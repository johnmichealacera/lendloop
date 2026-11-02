import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("sports"),
  v.literal("other"),
);

export const conditionValidator = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const toolStatusValidator = v.union(
  v.literal("available"),
  v.literal("on_loan"),
  v.literal("removed"),
);

export const loanStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

/** Loan changes that notify someone. "requested" and "cancelled" go to the owner; the rest to the borrower. */
export const loanEventValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
  v.literal("tool_removed"),
);

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    trustedLender: v.boolean(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    status: toolStatusValidator,
    removedBy: v.optional(v.id("users")),
  })
    .index("by_status", ["status"])
    .index("by_category_and_status", ["category", "status"])
    .index("by_ownerId_and_status", ["ownerId", "status"]),

  // Dates are calendar days as "YYYY-MM-DD" (UTC), so string comparison orders them.
  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_toolId_and_status", ["toolId", "status"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_borrowerId_and_status", ["borrowerId", "status"])
    .index("by_status_and_endDate", ["status", "endDate"]),

  // Outbound automation deliveries (Convex -> n8n), one row per notification, with retry state.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    event: v.optional(loanEventValidator),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    idempotencyKey: v.string(),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  })
    .index("by_loanId", ["loanId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status", ["status"]),
});
