import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { todayUtc } from "./lib/validate";
import { verifyN8nRequest } from "./lib/verify";
import { reminderKey } from "./reminders";

const http = httpRouter();

const json = (body: unknown, status = 200) => Response.json(body, { status });
const denied = (status: 401 | 503) =>
  json({ error: status === 401 ? "unauthorized" : "not configured" }, status);

/** Lets n8n confirm it can reach Convex. Returns nothing about the data. */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => json({ ok: true, service: "lendloop-convex" })),
});

/** Overdue loans needing a reminder today. The server decides "today", so callers can't ask about other dates. */
http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await verifyN8nRequest(req, process.env.CONVEX_CALLBACK_SECRET);
    if (!auth.ok) return denied(auth.status);
    const date = todayUtc();
    const loans = await ctx.runQuery(internal.reminders.overdueForDate, { today: date });
    return json({ date, loans });
  }),
});

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await verifyN8nRequest(req, process.env.CONVEX_CALLBACK_SECRET);
    if (!auth.ok) return denied(auth.status);

    let input: unknown;
    try {
      input = JSON.parse(auth.body);
    } catch {
      return json({ error: "body must be JSON" }, 400);
    }
    const b = (input ?? {}) as Record<string, unknown>;
    const valid =
      typeof b.loanId === "string" &&
      typeof b.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
      (b.status === "sent" || b.status === "failed") &&
      (b.error === undefined || (typeof b.error === "string" && b.error.length <= 500)) &&
      b.idempotencyKey === reminderKey(b.loanId, b.date);
    if (!valid) return json({ error: "expected { loanId, date, status: sent|failed, idempotencyKey: reminder:{loanId}:{date}, error? }" }, 400);

    const result = await ctx.runMutation(internal.reminders.recordReminder, {
      loanId: b.loanId as string,
      date: b.date as string,
      status: b.status as "sent" | "failed",
      ...(typeof b.error === "string" ? { error: b.error } : {}),
    });
    if (result.outcome === "unknown_loan") return json({ error: "unknown loan" }, 404);
    return json({ idempotencyKey: b.idempotencyKey, ...result });
  }),
});

export default http;
