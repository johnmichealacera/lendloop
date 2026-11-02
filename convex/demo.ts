import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { fail } from "./lib/auth";
import { todayUtc } from "./lib/validate";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Demo/testing only: moves an approved loan into the past so the overdue workflow has work to do.
 * Internal, so only someone with deployment access can run it:
 *   npx convex run demo:makeOverdue '{"loanId":"<id>","daysOverdue":2}'
 */
export const makeOverdue = internalMutation({
  args: { loanId: v.id("loans"), daysOverdue: v.optional(v.number()) },
  handler: async (ctx, { loanId, daysOverdue = 1 }) => {
    const loan = await ctx.db.get("loans", loanId);
    if (!loan || loan.status !== "approved") fail("INVALID", "Only an approved (lent out) loan can be made overdue.");
    const today = Date.parse(`${todayUtc()}T00:00:00Z`);
    const endDate = new Date(today - Math.max(1, Math.floor(daysOverdue)) * DAY_MS).toISOString().slice(0, 10);
    const startDate = new Date(Date.parse(`${endDate}T00:00:00Z`) - 2 * DAY_MS).toISOString().slice(0, 10);
    await ctx.db.patch("loans", loanId, { startDate, endDate });
    return { loanId, startDate, endDate };
  },
});
