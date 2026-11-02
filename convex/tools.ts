import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, firstName, getCurrentUser, requireAdmin, requireUser, requireUserForWrite } from "./lib/auth";
import { enqueueLoanEvent } from "./lib/notify";
import { cleanText, LIMITS } from "./lib/validate";
import { categoryValidator, conditionValidator } from "./schema";

const MAX_LIST = 200;

async function activeTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get("tools", toolId);
  if (!tool || tool.status === "removed") fail("NOT_FOUND", "That tool no longer exists.");
  return tool;
}

/** Public page: available tools, name and category only. No owner, description or IDs of people. */
export const listPublic = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category_and_status", (q) => q.eq("category", category).eq("status", "available"))
          .order("desc")
          .take(MAX_LIST)
      : await ctx.db
          .query("tools")
          .withIndex("by_status", (q) => q.eq("status", "available"))
          .order("desc")
          .take(MAX_LIST);
    return tools.map((t) => ({ name: t.name, category: t.category }));
  },
});

/** Signed-in browse view: every listed tool with availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const statuses = ["available", "on_loan"] as const;
    const tools: Doc<"tools">[] = [];
    for (const status of statuses) {
      const batch = category
        ? await ctx.db
            .query("tools")
            .withIndex("by_category_and_status", (q) => q.eq("category", category).eq("status", status))
            .order("desc")
            .take(MAX_LIST)
        : await ctx.db
            .query("tools")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(MAX_LIST);
      tools.push(...batch);
    }

    const owners = new Map<Id<"users">, Doc<"users"> | null>();
    for (const t of tools) {
      if (!owners.has(t.ownerId)) owners.set(t.ownerId, await ctx.db.get("users", t.ownerId));
    }

    return tools
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((t) => {
        const owner = owners.get(t.ownerId);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          available: t.status === "available",
          isMine: t.ownerId === me._id,
          ownerFirstName: owner ? firstName(owner) : "Neighbor",
          ownerTrusted: owner?.trustedLender ?? false,
        };
      });
  },
});

export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];
    const result: Doc<"tools">[] = [];
    for (const status of ["available", "on_loan"] as const) {
      result.push(
        ...(await ctx.db
          .query("tools")
          .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", me._id).eq("status", status))
          .take(MAX_LIST)),
      );
    }
    return result.sort((a, b) => b._creationTime - a._creationTime);
  },
});

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

function cleanToolFields(args: { name: string; description: string }) {
  return {
    name: cleanText(args.name, "Name", LIMITS.toolName),
    description: cleanText(args.description, "Description", LIMITS.description, { required: false }),
  };
}

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const me = await requireUserForWrite(ctx);
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
      status: "available",
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const me = await requireUserForWrite(ctx);
    const tool = await activeTool(ctx, toolId);
    if (tool.ownerId !== me._id) fail("FORBIDDEN", "You can only edit your own listings.");
    await ctx.db.patch("tools", toolId, {
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
    });
  },
});

async function closeOpenRequests(ctx: MutationCtx, toolId: Id<"tools">) {
  const pending = await ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "requested"))
    .take(MAX_LIST);
  for (const loan of pending) {
    await ctx.db.patch("loans", loan._id, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loan._id, "tool_removed");
  }
}

/** Owners remove their own listing; admins can remove any. Soft delete keeps loan history intact. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUserForWrite(ctx);
    const tool = await activeTool(ctx, toolId);
    const isOwner = tool.ownerId === me._id;
    if (!isOwner && me.role !== "admin") fail("FORBIDDEN", "You can only remove your own listings.");
    if (isOwner && tool.status === "on_loan") {
      fail("CONFLICT", "This tool is lent out. Mark it returned before removing it.");
    }
    await closeOpenRequests(ctx, toolId);
    await ctx.db.patch("tools", toolId, { status: "removed", removedBy: me._id });
  },
});

/** Admin: every live listing with its owner's full name, so any of them can be removed. */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools: Doc<"tools">[] = [];
    for (const status of ["available", "on_loan"] as const) {
      tools.push(
        ...(await ctx.db.query("tools").withIndex("by_status", (q) => q.eq("status", status)).order("desc").take(MAX_LIST)),
      );
    }
    const owners = new Map<Id<"users">, Doc<"users"> | null>();
    for (const t of tools) {
      if (!owners.has(t.ownerId)) owners.set(t.ownerId, await ctx.db.get("users", t.ownerId));
    }
    return tools
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        category: t.category,
        status: t.status,
        ownerName: owners.get(t.ownerId)?.name ?? "Unknown",
      }));
  },
});
