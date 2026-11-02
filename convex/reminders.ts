import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { firstName } from "./lib/auth";

const MAX_BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export function reminderKey(loanId: string, date: string): string {
  return `reminder:${loanId}:${date}`;
}

/** Approved loans whose end date has passed and that have no successful reminder for `today` yet. */
export const overdueForDate = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(MAX_BATCH);

    const result = [];
    for (const loan of loans) {
      const reminder = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", reminderKey(loan._id, today)))
        .unique();
      if (reminder?.status === "sent") continue;
      const [borrower, tool] = await Promise.all([ctx.db.get("users", loan.borrowerId), ctx.db.get("tools", loan.toolId)]);
      if (!borrower?.email) continue;
      result.push({
        loanId: loan._id,
        borrower: { email: borrower.email, firstName: firstName(borrower) },
        tool: { name: tool?.name ?? "the tool" },
        endDate: loan.endDate,
        daysOverdue: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${loan.endDate}T00:00:00Z`)) / DAY_MS),
      });
    }
    return result;
  },
});

/**
 * Write-back from n8n. Idempotent on reminder:{loanId}:{date}: the unique-key lookup and the insert run in one
 * serializable transaction, so concurrent retries can't create two rows. A later "sent" upgrades an earlier "failed".
 */
export const recordReminder = internalMutation({
  args: {
    loanId: v.string(),
    date: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { loanId: rawLoanId, date, status, error }) => {
    const loanId = ctx.db.normalizeId("loans", rawLoanId);
    if (!loanId || !(await ctx.db.get("loans", loanId))) return { outcome: "unknown_loan" as const };

    const idempotencyKey = reminderKey(loanId, date);
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    const now = Date.now();

    if (!existing) {
      await ctx.db.insert("automationEvents", {
        loanId,
        kind: "overdue_reminder",
        status,
        idempotencyKey,
        attempts: 1,
        ...(status === "sent" ? { sentAt: now } : { lastError: error ?? "Reminder failed" }),
      });
      return { outcome: "recorded" as const, status };
    }
    if (existing.status === "sent") return { outcome: "duplicate" as const, status: existing.status };
    await ctx.db.patch("automationEvents", existing._id, {
      status,
      attempts: existing.attempts + 1,
      ...(status === "sent" ? { sentAt: now, lastError: undefined } : { lastError: error ?? "Reminder failed" }),
    });
    return { outcome: "recorded" as const, status };
  },
});
