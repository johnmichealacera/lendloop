/// <reference types="vite/client" />
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_ATTEMPTS } from "./n8n";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-webhook-secret";

const people = {
  ana: { name: "Ana Reyes", email: "ana@example.com", subject: "user_ana", tokenIdentifier: "clerk|user_ana" },
  ben: { name: "Ben Cruz", email: "ben@example.com", subject: "user_ben", tokenIdentifier: "clerk|user_ben" },
  cara: { name: "Cara Lim", email: "cara@example.com", subject: "user_cara", tokenIdentifier: "clerk|user_cara" },
  admin: { name: "Ada Admin", email: "admin@example.com", subject: "user_admin", tokenIdentifier: "clerk|user_admin" },
};

async function setup() {
  const t = convexTest(schema, modules);
  const as = {
    ana: t.withIdentity(people.ana),
    ben: t.withIdentity(people.ben),
    cara: t.withIdentity(people.cara),
    admin: t.withIdentity(people.admin),
  };
  for (const who of Object.values(as)) await who.mutation(api.users.ensureCurrent, {});
  await t.mutation(internal.users.setRole, { email: people.admin.email, role: "admin" });
  const toolId: Id<"tools"> = await as.ana.mutation(api.tools.create, {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "18V, two batteries, spare in the garage",
  });
  return { t, as, toolId };
}

async function events(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return await t.run(async (ctx) => await ctx.db.query("automationEvents").collect());
}

async function payloadFor(t: Awaited<ReturnType<typeof setup>>["t"], key: string) {
  const row = (await events(t)).find((e) => e.idempotencyKey === key)!;
  const job = await t.query(internal.n8n.loadLoanEvent, { eventId: row._id });
  if (job.kind !== "send") throw new Error(`expected send, got ${job.kind}`);
  return job.payload;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T08:00:00Z"));
  vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.example.test/");
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "sent" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("which loan changes notify whom", () => {
  test("request -> owner; approve -> borrower; overlapping request auto-declined -> its borrower", async () => {
    const { t, as, toolId } = await setup();
    const benLoan = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-08", message: "Shelves" });
    const caraLoan = await as.cara.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-09" });
    await as.ana.mutation(api.loans.approve, { loanId: benLoan });

    expect((await events(t)).map((e) => e.idempotencyKey).sort()).toEqual(
      [`loan:${benLoan}:approved`, `loan:${benLoan}:requested`, `loan:${caraLoan}:declined`, `loan:${caraLoan}:requested`].sort(),
    );
    expect((await payloadFor(t, `loan:${benLoan}:requested`)).recipient.email).toBe("ana@example.com");
    expect((await payloadFor(t, `loan:${benLoan}:approved`)).recipient.email).toBe("ben@example.com");
    expect((await payloadFor(t, `loan:${caraLoan}:declined`)).recipient.email).toBe("cara@example.com");
  });

  test("decline, cancel, return and tool removal each produce exactly one event", async () => {
    const { t, as, toolId } = await setup();
    const declined = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-05" });
    await as.ana.mutation(api.loans.decline, { loanId: declined });
    const cancelled = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-06", endDate: "2026-11-06" });
    await as.ben.mutation(api.loans.cancel, { loanId: cancelled });
    const returned = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-07" });
    await as.ana.mutation(api.loans.approve, { loanId: returned });
    await as.ana.mutation(api.loans.markReturned, { loanId: returned });
    const orphaned = await as.cara.mutation(api.loans.request, { toolId, startDate: "2026-11-20", endDate: "2026-11-21" });
    await as.ana.mutation(api.tools.remove, { toolId });

    const keys = (await events(t)).map((e) => e.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect((await payloadFor(t, `loan:${declined}:declined`)).recipient.email).toBe("ben@example.com");
    expect((await payloadFor(t, `loan:${cancelled}:cancelled`)).recipient.email).toBe("ana@example.com");
    expect((await payloadFor(t, `loan:${returned}:returned`)).recipient.email).toBe("ben@example.com");
    expect((await payloadFor(t, `loan:${orphaned}:tool_removed`)).recipient.email).toBe("cara@example.com");
  });

  test("payload is minimal: recipient email only, first names, no tool description", async () => {
    const { t, as, toolId } = await setup();
    const loanId = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06", message: "For shelves" });
    const payload = await payloadFor(t, `loan:${loanId}:requested`);
    expect(payload).toEqual({
      eventId: `loan:${loanId}:requested`,
      event: "requested",
      recipient: { email: "ana@example.com", firstName: "Ana" },
      otherParty: { firstName: "Ben" },
      tool: { name: "Cordless drill" },
      loan: { startDate: "2026-11-05", endDate: "2026-11-06", status: "requested", message: "For shelves" },
    });
    expect(JSON.stringify(payload)).not.toContain("ben@example.com");
    expect(JSON.stringify(payload)).not.toContain("batteries");
  });
});

describe("delivery to n8n", () => {
  test("posts a body signed with HMAC-SHA256 over timestamp.body and marks the event sent", async () => {
    const { t, as, toolId } = await setup();
    const loanId = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(url).toBe("https://n8n.example.test/webhook/lendloop-loan-event");
    expect(headers["X-LendLoop-Event-Id"]).toBe(`loan:${loanId}:requested`);
    expect(headers["X-LendLoop-Timestamp"]).toBe(String(Date.parse("2026-11-02T08:00:00Z") / 1000));
    const expected = createHmac("sha256", SECRET).update(`${headers["X-LendLoop-Timestamp"]}.${body}`).digest("hex");
    expect(headers["X-LendLoop-Signature"]).toBe(`sha256=${expected}`);

    const [row] = await events(t);
    expect(row).toMatchObject({ status: "sent", attempts: 1 });
  });

  test("when n8n is down it retries with backoff, then marks the event failed and shows it to admins", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { t, as, toolId } = await setup();
    await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const [row] = await events(t);
    expect(row).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, lastError: "Network error: fetch failed" });

    await expect(as.ben.query(api.n8n.adminEvents, {})).rejects.toThrow(/FORBIDDEN/);
    const visible = await as.admin.query(api.n8n.adminEvents, {});
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ status: "failed", event: "requested", toolName: "Cordless drill" });
  });

  test("a non-2xx answer (e.g. n8n rejecting the signature) is retried, and an admin can retry after fixing it", async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    const { t, as, toolId } = await setup();
    await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [failed] = await events(t);
    expect(failed).toMatchObject({ status: "failed", lastError: 'n8n responded 401: {"error":"unauthorized"}' });

    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await as.admin.mutation(api.n8n.adminRetry, { eventId: failed._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await events(t))[0]).toMatchObject({ status: "sent" });
  });

  test("missing configuration fails loudly instead of silently", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    const { t, as, toolId } = await setup();
    await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await events(t))[0]).toMatchObject({ status: "failed", lastError: expect.stringContaining("not set") });
  });
});
