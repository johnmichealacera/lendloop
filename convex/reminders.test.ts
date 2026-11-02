/// <reference types="vite/client" />
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-callback-secret";

const ana = { name: "Ana Reyes", email: "ana@example.com", subject: "user_ana", tokenIdentifier: "clerk|user_ana" };
const ben = { name: "Ben Cruz", email: "ben@example.com", subject: "user_ben", tokenIdentifier: "clerk|user_ben" };

function signed(method: string, path: string, body = "", { secret = SECRET, ageSeconds = 0 } = {}) {
  const ts = String(Math.floor(Date.now() / 1000) - ageSeconds);
  const sig = createHmac("sha256", secret).update(`${ts}.${method} ${path}.${body}`).digest("hex");
  return {
    method,
    headers: { "Content-Type": "application/json", "X-LendLoop-Timestamp": ts, "X-LendLoop-Signature": `sha256=${sig}` },
    ...(method === "GET" ? {} : { body }),
  };
}

/** A loan for Nov 3–5 approved on Nov 2, then the clock moves to Nov 8 (3 days overdue). */
async function overdueLoan() {
  const t = convexTest(schema, modules);
  const asAna = t.withIdentity(ana);
  const asBen = t.withIdentity(ben);
  await asAna.mutation(api.users.ensureCurrent, {});
  await asBen.mutation(api.users.ensureCurrent, {});
  const toolId = await asAna.mutation(api.tools.create, { name: "Ladder", category: "hand_tools", condition: "good", description: "3 m, aluminium" });
  const loanId = await asBen.mutation(api.loans.request, { toolId, startDate: "2026-11-03", endDate: "2026-11-05" });
  await asAna.mutation(api.loans.approve, { loanId });
  vi.setSystemTime(new Date("2026-11-08T01:00:00Z"));
  return { t, loanId };
}

const writeBack = (loanId: string, status: "sent" | "failed", date = "2026-11-08") =>
  JSON.stringify({ loanId, date, status, idempotencyKey: `reminder:${loanId}:${date}`, ...(status === "failed" ? { error: "SMTP 421" } : {}) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T08:00:00Z"));
  vi.stubEnv("CONVEX_CALLBACK_SECRET", SECRET);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("authentication on n8n endpoints", () => {
  test("unsigned, wrongly signed, stale, or signed-for-another-path requests get 401", async () => {
    const { t, loanId } = await overdueLoan();
    expect((await t.fetch("/n8n/overdue-loans", { method: "GET" })).status).toBe(401);
    expect((await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans", "", { secret: "wrong" }))).status).toBe(401);
    expect((await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans", "", { ageSeconds: 600 }))).status).toBe(401);
    expect((await t.fetch("/n8n/overdue-loans", signed("GET", "/health"))).status).toBe(401);

    const body = writeBack(loanId, "sent");
    expect((await t.fetch("/n8n/reminder-status", { method: "POST", body })).status).toBe(401);
    const tampered = { ...signed("POST", "/n8n/reminder-status", body), body: writeBack(loanId, "failed") };
    expect((await t.fetch("/n8n/reminder-status", tampered)).status).toBe(401);
  });

  test("missing secret answers 503 rather than accepting anything", async () => {
    vi.stubEnv("CONVEX_CALLBACK_SECRET", "");
    const { t } = await overdueLoan();
    expect((await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans"))).status).toBe(503);
  });
});

describe("overdue reminders", () => {
  test("lists overdue loans with only what a reminder needs", async () => {
    const { t, loanId } = await overdueLoan();
    const res = await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      date: "2026-11-08",
      loans: [{ loanId, borrower: { email: "ben@example.com", firstName: "Ben" }, tool: { name: "Ladder" }, endDate: "2026-11-05", daysOverdue: 3 }],
    });
  });

  test("write-back is idempotent: three runs on the same day record one reminder, and the loan leaves the list", async () => {
    const { t, loanId } = await overdueLoan();
    const outcomes = [];
    for (let run = 0; run < 3; run++) {
      const body = writeBack(loanId, "sent");
      const res = await t.fetch("/n8n/reminder-status", signed("POST", "/n8n/reminder-status", body));
      outcomes.push((await res.json()).outcome);
    }
    expect(outcomes).toEqual(["recorded", "duplicate", "duplicate"]);

    const rows = await t.run(async (ctx) => await ctx.db.query("automationEvents").collect());
    expect(rows.filter((r) => r.kind === "overdue_reminder")).toHaveLength(1);
    const list = await (await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans"))).json();
    expect(list.loans).toEqual([]);

    vi.setSystemTime(new Date("2026-11-09T01:00:00Z"));
    const nextDay = await (await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans"))).json();
    expect(nextDay.loans).toHaveLength(1);
  });

  test("a failed reminder stays on the list and can be upgraded to sent by a later run", async () => {
    const { t, loanId } = await overdueLoan();
    let body = writeBack(loanId, "failed");
    expect(await (await t.fetch("/n8n/reminder-status", signed("POST", "/n8n/reminder-status", body))).json()).toMatchObject({ outcome: "recorded", status: "failed" });
    expect((await (await t.fetch("/n8n/overdue-loans", signed("GET", "/n8n/overdue-loans"))).json()).loans).toHaveLength(1);

    body = writeBack(loanId, "sent");
    await t.fetch("/n8n/reminder-status", signed("POST", "/n8n/reminder-status", body));
    const [row] = await t.run(async (ctx) => await ctx.db.query("automationEvents").collect().then((r) => r.filter((x) => x.kind === "overdue_reminder")));
    expect(row).toMatchObject({ status: "sent", attempts: 2 });
  });

  test("rejects a write-back whose idempotency key doesn't match loan and date", async () => {
    const { t, loanId } = await overdueLoan();
    const body = JSON.stringify({ loanId, date: "2026-11-08", status: "sent", idempotencyKey: `reminder:${loanId}:2026-11-07` });
    expect((await t.fetch("/n8n/reminder-status", signed("POST", "/n8n/reminder-status", body))).status).toBe(400);
  });
});
