import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, getCurrentUser, requireAdmin, requireUserForWrite } from "./lib/auth";
import { roleValidator } from "./schema";

/** Called by the client right after sign-in so queries can find the user's row. */
export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserForWrite(ctx);
    return me._id;
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { subject: identity.subject, email: identity.email ?? null };
  },
});

/** Admin: everyone registered, to grant or remove the Trusted Lender badge. */
export const adminListUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(200);
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) fail("NOT_FOUND", "User not found.");
    await ctx.db.patch("users", userId, { trustedLender: trusted });
  },
});

/**
 * Role changes are never exposed to the browser. Run from a terminal with deployment access:
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!user) fail("NOT_FOUND", `No user with email ${email}. Sign in once first.`);
    await ctx.db.patch("users", user._id, { role });
    return { email: user.email, role };
  },
});
