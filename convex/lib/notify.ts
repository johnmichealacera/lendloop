import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { loanEventValidator } from "../schema";

export type LoanEvent = Infer<typeof loanEventValidator>;

/**
 * Records a notification in the same transaction as the loan change, then hands delivery to an action.
 * If the mutation rolls back, no notification exists; if it commits, delivery is guaranteed to be attempted.
 */
export async function enqueueLoanEvent(ctx: MutationCtx, loanId: Id<"loans">, event: LoanEvent) {
  const idempotencyKey = `loan:${loanId}:${event}`;
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
  if (existing) return;
  const eventId = await ctx.db.insert("automationEvents", {
    loanId,
    kind: "request_notification",
    event,
    status: "pending",
    idempotencyKey,
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.n8n.sendLoanEvent, { eventId });
}
