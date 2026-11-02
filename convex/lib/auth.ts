import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

async function identityOrFail(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("UNAUTHENTICATED", "Please sign in first.");
  return identity;
}

/** The signed-in user's row, or null if signed out or not registered yet (queries cannot create it). */
export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/** For queries: the signed-in user, or an error. */
export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  await identityOrFail(ctx);
  const user = await getCurrentUser(ctx);
  if (!user) fail("UNAUTHENTICATED", "Your account is still being set up. Please reload.");
  return user;
}

/** For mutations: the signed-in user, creating their row on first use. New users are always "user"; admin is granted only by an internal function. */
export async function requireUserForWrite(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await identityOrFail(ctx);
  const existing = await getCurrentUser(ctx);
  const email = (identity.email ?? "").toLowerCase();
  const name = identity.name || identity.givenName || email.split("@")[0] || "Neighbor";

  if (existing) {
    if (existing.email !== email || existing.name !== name) {
      await ctx.db.patch("users", existing._id, { email, name });
      return { ...existing, email, name };
    }
    return existing;
  }

  const id = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    clerkUserId: identity.subject,
    email,
    name,
    role: "user",
    trustedLender: false,
  });
  return (await ctx.db.get("users", id))!;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") fail("FORBIDDEN", "Only admins can do that.");
  return user;
}

export function firstName(user: Pick<Doc<"users">, "name">): string {
  return user.name.trim().split(/\s+/)[0] || "Neighbor";
}
