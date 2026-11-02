import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, firstName, getCurrentUser, requireAdmin, requireUserForWrite } from "./lib/auth";
import { enqueueLoanEvent } from "./lib/notify";
import { cleanText, LIMITS, rangesOverlap, validateLoanDates } from "./lib/validate";

const MAX_LIST = 200;

type LoanStatus = Doc<"loans">["status"];
type Action = "approve" | "decline" | "cancel" | "markReturned";

/** The only allowed moves, and who may make them. Anything else is rejected on the server. */
const TRANSITIONS: Record<Action, { from: LoanStatus; to: LoanStatus; actor: "owner" | "borrower" }> = {
  approve: { from: "requested", to: "approved", actor: "owner" },
  decline: { from: "requested", to: "declined", actor: "owner" },
  cancel: { from: "requested", to: "cancelled", actor: "borrower" },
  markReturned: { from: "approved", to: "returned", actor: "owner" },
};

async function loansForTool(ctx: QueryCtx, toolId: Id<"tools">, status: LoanStatus) {
  return await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", status))
    .take(MAX_LIST);
}

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUserForWrite(ctx);
    const tool = await ctx.db.get("tools", args.toolId);
    if (!tool || tool.status === "removed") fail("NOT_FOUND", "That tool no longer exists.");
    if (tool.ownerId === me._id) fail("INVALID", "You can't borrow your own tool.");
    validateLoanDates(args.startDate, args.endDate);
    const range = { startDate: args.startDate, endDate: args.endDate };

    const approved = await loansForTool(ctx, tool._id, "approved");
    if (approved.some((l) => rangesOverlap(l, range))) {
      fail("CONFLICT", "The tool is already lent out for some of those dates.");
    }
    const pending = await loansForTool(ctx, tool._id, "requested");
    if (pending.some((l) => l.borrowerId === me._id && rangesOverlap(l, range))) {
      fail("CONFLICT", "You already have a pending request for those dates.");
    }

    const message = args.message === undefined ? undefined : cleanText(args.message, "Message", LIMITS.message, { required: false });
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: me._id,
      startDate: args.startDate,
      endDate: args.endDate,
      ...(message ? { message } : {}),
      status: "requested",
    });
    await enqueueLoanEvent(ctx, loanId, "requested");
    return loanId;
  },
});

async function transition(ctx: MutationCtx, loanId: Id<"loans">, action: Action) {
  const me = await requireUserForWrite(ctx);
  const loan = await ctx.db.get("loans", loanId);
  const rule = TRANSITIONS[action];
  const actorId = rule.actor === "owner" ? loan?.ownerId : loan?.borrowerId;
  // Same answer for "doesn't exist" and "not yours", so IDs can't be probed.
  if (!loan || actorId !== me._id) fail("NOT_FOUND", "Loan not found.");
  if (loan.status !== rule.from) fail("CONFLICT", `This request is already ${loan.status}.`);

  const now = Date.now();
  await ctx.db.patch("loans", loanId, {
    status: rule.to,
    ...(rule.to === "returned" ? { returnedAt: now } : { decidedAt: now }),
  });
  return loan;
}

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await transition(ctx, loanId, "approve");
    const tool = await ctx.db.get("tools", loan.toolId);
    if (!tool || tool.status === "removed") fail("CONFLICT", "That tool has been removed.");

    // Mutations are serializable, so this check and the writes below can't race another approval.
    const approved = await loansForTool(ctx, loan.toolId, "approved");
    if (approved.some((l) => l._id !== loanId && rangesOverlap(l, loan))) {
      fail("CONFLICT", "Those dates overlap a loan you already approved.");
    }
    for (const other of await loansForTool(ctx, loan.toolId, "requested")) {
      if (rangesOverlap(other, loan)) {
        await ctx.db.patch("loans", other._id, { status: "declined", decidedAt: Date.now() });
        await enqueueLoanEvent(ctx, other._id, "declined");
      }
    }
    await ctx.db.patch("tools", loan.toolId, { status: "on_loan" });
    await enqueueLoanEvent(ctx, loanId, "approved");
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await transition(ctx, loanId, "decline");
    await enqueueLoanEvent(ctx, loanId, "declined");
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await transition(ctx, loanId, "cancel");
    await enqueueLoanEvent(ctx, loanId, "cancelled");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await transition(ctx, loanId, "markReturned");
    const tool = await ctx.db.get("tools", loan.toolId);
    const stillLent = (await loansForTool(ctx, loan.toolId, "approved")).length > 0;
    if (tool && tool.status === "on_loan" && !stillLent) {
      await ctx.db.patch("tools", loan.toolId, { status: "available" });
    }
    await enqueueLoanEvent(ctx, loanId, "returned");
  },
});

async function toView(ctx: QueryCtx, loan: Doc<"loans">, viewer: "owner" | "borrower" | "admin") {
  const [tool, owner, borrower] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", loan.ownerId),
    ctx.db.get("users", loan.borrowerId),
  ]);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    message: loan.message ?? null,
    requestedAt: loan._creationTime,
    ownerFirstName: owner ? firstName(owner) : "Neighbor",
    borrowerFirstName: borrower ? firstName(borrower) : "Neighbor",
    // Only admins see full names; neither side sees the other's email in the app.
    ...(viewer === "admin"
      ? { ownerName: owner?.name ?? null, borrowerName: borrower?.name ?? null }
      : {}),
  };
}

async function byStatuses(
  ctx: QueryCtx,
  index: "by_ownerId_and_status" | "by_borrowerId_and_status",
  userId: Id<"users">,
  statuses: LoanStatus[],
) {
  const loans: Doc<"loans">[] = [];
  for (const status of statuses) {
    const batch =
      index === "by_ownerId_and_status"
        ? await ctx.db.query("loans").withIndex(index, (q) => q.eq("ownerId", userId).eq("status", status)).order("desc").take(MAX_LIST)
        : await ctx.db.query("loans").withIndex(index, (q) => q.eq("borrowerId", userId).eq("status", status)).order("desc").take(MAX_LIST);
    loans.push(...batch);
  }
  return loans.sort((a, b) => b._creationTime - a._creationTime);
}

const ALL_STATUSES: LoanStatus[] = ["requested", "approved", "declined", "cancelled", "returned"];

/** Requests I made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];
    const loans = await byStatuses(ctx, "by_borrowerId_and_status", me._id, ALL_STATUSES);
    return await Promise.all(loans.map((l) => toView(ctx, l, "borrower")));
  },
});

/** Requests and active loans on my tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];
    const loans = await byStatuses(ctx, "by_ownerId_and_status", me._id, ALL_STATUSES);
    return await Promise.all(loans.map((l) => toView(ctx, l, "owner")));
  },
});

/** Admin: every loan, newest first. */
export const adminAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(MAX_LIST);
    return await Promise.all(loans.map((l) => toView(ctx, l, "admin")));
  },
});
