import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { fail, firstName, requireAdmin } from "./lib/auth";
import { signBody } from "./lib/hmac";
import type { LoanEvent } from "./lib/notify";

/** Delays before retries 2, 3 and 4. After the 4th failed attempt the event is marked failed. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const REQUEST_TIMEOUT_MS = 10_000;
export const LOAN_EVENT_PATH = "/webhook/lendloop-loan-event";

const OWNER_EVENTS: LoanEvent[] = ["requested", "cancelled"];

export type LoanEventPayload = {
  eventId: string;
  event: LoanEvent;
  recipient: { email: string; firstName: string };
  otherParty: { firstName: string };
  tool: { name: string };
  loan: { startDate: string; endDate: string; status: Doc<"loans">["status"]; message: string | null };
};

type Job = { kind: "skip" } | { kind: "fail"; reason: string } | { kind: "send"; payload: LoanEventPayload };

/** Builds the minimal payload: one email (the recipient's), first names only, no tool description. */
export const loadLoanEvent = internalQuery({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }): Promise<Job> => {
    const row = await ctx.db.get("automationEvents", eventId);
    if (!row || row.status !== "pending" || !row.event) return { kind: "skip" };
    const loan = await ctx.db.get("loans", row.loanId);
    if (!loan) return { kind: "fail", reason: "Loan no longer exists." };
    const [tool, owner, borrower] = await Promise.all([
      ctx.db.get("tools", loan.toolId),
      ctx.db.get("users", loan.ownerId),
      ctx.db.get("users", loan.borrowerId),
    ]);
    const toOwner = OWNER_EVENTS.includes(row.event);
    const recipient = toOwner ? owner : borrower;
    const other = toOwner ? borrower : owner;
    if (!recipient?.email) return { kind: "fail", reason: "Recipient has no email on file." };
    return {
      kind: "send",
      payload: {
        eventId: row.idempotencyKey,
        event: row.event,
        recipient: { email: recipient.email, firstName: firstName(recipient) },
        otherParty: { firstName: other ? firstName(other) : "Neighbor" },
        tool: { name: tool?.name ?? "a tool" },
        loan: {
          startDate: loan.startDate,
          endDate: loan.endDate,
          status: loan.status,
          message: row.event === "requested" ? (loan.message ?? null) : null,
        },
      },
    };
  },
});

async function postSigned(url: string, secret: string, payload: LoanEventPayload): Promise<string | null> {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LendLoop-Timestamp": timestamp,
        "X-LendLoop-Signature": await signBody(secret, timestamp, body),
        "X-LendLoop-Event-Id": payload.eventId,
      },
      body,
      signal: controller.signal,
    });
    if (res.ok) return null;
    return `n8n responded ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (error) {
    return error instanceof Error && error.name === "AbortError"
      ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : `Network error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    clearTimeout(timer);
  }
}

export const sendLoanEvent = internalAction({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }): Promise<null> => {
    const job: Job = await ctx.runQuery(internal.n8n.loadLoanEvent, { eventId });
    if (job.kind === "skip") return null;
    if (job.kind === "fail") {
      await ctx.runMutation(internal.n8n.recordAttempt, { eventId, error: job.reason, retryable: false });
      return null;
    }

    const base = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    const error =
      base && secret
        ? await postSigned(`${base.replace(/\/+$/, "")}${LOAN_EVENT_PATH}`, secret, job.payload)
        : "N8N_WEBHOOK_URL or N8N_WEBHOOK_SECRET is not set in the Convex environment.";
    await ctx.runMutation(internal.n8n.recordAttempt, { eventId, error: error ?? undefined, retryable: true });
    return null;
  },
});

export const recordAttempt = internalMutation({
  args: { eventId: v.id("automationEvents"), error: v.optional(v.string()), retryable: v.boolean() },
  handler: async (ctx, { eventId, error, retryable }) => {
    const row = await ctx.db.get("automationEvents", eventId);
    if (!row || row.status !== "pending") return null;
    const attempts = row.attempts + 1;
    if (error === undefined) {
      await ctx.db.patch("automationEvents", eventId, { status: "sent", attempts, sentAt: Date.now(), lastError: undefined });
    } else if (retryable && attempts < MAX_ATTEMPTS) {
      await ctx.db.patch("automationEvents", eventId, { attempts, lastError: error });
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempts - 1], internal.n8n.sendLoanEvent, { eventId });
    } else {
      await ctx.db.patch("automationEvents", eventId, { status: "failed", attempts, lastError: error });
    }
    return null;
  },
});

/** Admin: deliveries that failed or are still retrying, so nothing fails silently. */
export const adminEvents = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = [
      ...(await ctx.db.query("automationEvents").withIndex("by_status", (q) => q.eq("status", "failed")).order("desc").take(50)),
      ...(await ctx.db.query("automationEvents").withIndex("by_status", (q) => q.eq("status", "pending")).order("desc").take(50)),
    ];
    return await Promise.all(
      rows.map(async (r) => {
        const loan = await ctx.db.get("loans", r.loanId);
        const tool = loan ? await ctx.db.get("tools", loan.toolId) : null;
        return {
          _id: r._id,
          kind: r.kind,
          event: r.event ?? null,
          status: r.status,
          attempts: r.attempts,
          lastError: r.lastError ?? null,
          toolName: tool?.name ?? "Removed tool",
          createdAt: r._creationTime,
        };
      }),
    );
  },
});

export const adminRetry = mutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get("automationEvents", eventId);
    if (!row) fail("NOT_FOUND", "Event not found.");
    if (row.status !== "failed") fail("CONFLICT", "Only failed deliveries can be retried.");
    await ctx.db.patch("automationEvents", eventId, { status: "pending", attempts: 0 });
    await ctx.scheduler.runAfter(0, internal.n8n.sendLoanEvent, { eventId });
  },
});
