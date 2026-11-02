/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const people = {
  ana: { name: "Ana Reyes", email: "ana@example.com", subject: "user_ana", tokenIdentifier: "clerk|user_ana" },
  ben: { name: "Ben Cruz", email: "ben@example.com", subject: "user_ben", tokenIdentifier: "clerk|user_ben" },
  cara: { name: "Cara Lim", email: "cara@example.com", subject: "user_cara", tokenIdentifier: "clerk|user_cara" },
  admin: { name: "Ada Admin", email: "admin@example.com", subject: "user_admin", tokenIdentifier: "clerk|user_admin" },
};

const drill = { name: "Cordless drill", category: "power_tools", condition: "good", description: "18V, two batteries" } as const;

async function setup() {
  const t = convexTest(schema, modules);
  const as = {
    ana: t.withIdentity(people.ana),
    ben: t.withIdentity(people.ben),
    cara: t.withIdentity(people.cara),
    admin: t.withIdentity(people.admin),
  };
  for (const who of Object.values(as)) await who.mutation(api.users.ensureCurrent, {});
  await t.mutation(internal.users.setRole, { email: people.admin.email, role: "admin" });
  const toolId: Id<"tools"> = await as.ana.mutation(api.tools.create, drill);
  return { t, as, toolId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T08:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("signed out", () => {
  test("cannot write anything", async () => {
    const { t, toolId } = await setup();
    await expect(t.mutation(api.tools.create, drill)).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(t.mutation(api.tools.remove, { toolId })).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(
      t.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" }),
    ).rejects.toThrow(/UNAUTHENTICATED/);
  });

  test("public list shows only name and category of available tools", async () => {
    const { t } = await setup();
    const list = await t.query(api.tools.listPublic, {});
    expect(list).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
  });
});

describe("listings", () => {
  test("only the owner can edit a listing", async () => {
    const { as, toolId } = await setup();
    await expect(as.ben.mutation(api.tools.update, { toolId, ...drill, name: "Mine now" })).rejects.toThrow(/FORBIDDEN/);
    await as.ana.mutation(api.tools.update, { toolId, ...drill, name: "Drill (18V)" });
  });

  test("users remove only their own listings; admins can remove any", async () => {
    const { as, toolId } = await setup();
    await expect(as.ben.mutation(api.tools.remove, { toolId })).rejects.toThrow(/FORBIDDEN/);
    await as.admin.mutation(api.tools.remove, { toolId });
    expect(await as.ben.query(api.tools.list, {})).toEqual([]);
  });

  test("input limits are enforced on the server", async () => {
    const { as } = await setup();
    await expect(as.ana.mutation(api.tools.create, { ...drill, name: "   " })).rejects.toThrow(/Name is required/);
    await expect(as.ana.mutation(api.tools.create, { ...drill, name: "x".repeat(81) })).rejects.toThrow(/at most 80/);
  });
});

describe("borrowing", () => {
  test("full happy path: request → approve → returned", async () => {
    const { as, toolId } = await setup();
    const loanId = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-07" });
    await as.ana.mutation(api.loans.approve, { loanId });
    expect((await as.cara.query(api.tools.list, {}))[0].available).toBe(false);
    await as.ana.mutation(api.loans.markReturned, { loanId });
    expect((await as.cara.query(api.tools.list, {}))[0].available).toBe(true);
    expect((await as.ben.query(api.loans.myRequests, {}))[0].status).toBe("returned");
  });

  test("cannot borrow your own tool or use bad dates", async () => {
    const { as, toolId } = await setup();
    await expect(as.ana.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" })).rejects.toThrow(/own tool/);
    await expect(as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-01", endDate: "2026-11-03" })).rejects.toThrow(/past/);
    await expect(as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-09", endDate: "2026-11-05" })).rejects.toThrow(/on or after/);
    await expect(as.ben.mutation(api.loans.request, { toolId, startDate: "2026-02-30", endDate: "2026-03-01" })).rejects.toThrow(/real date/);
  });

  test("only the tool owner can approve or decline; only the borrower can cancel", async () => {
    const { as, toolId } = await setup();
    const loanId = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await expect(as.ben.mutation(api.loans.approve, { loanId })).rejects.toThrow(/NOT_FOUND/);
    await expect(as.cara.mutation(api.loans.decline, { loanId })).rejects.toThrow(/NOT_FOUND/);
    await expect(as.admin.mutation(api.loans.approve, { loanId })).rejects.toThrow(/NOT_FOUND/);
    await expect(as.ana.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/NOT_FOUND/);
    await as.ben.mutation(api.loans.cancel, { loanId });
  });

  test("invalid status changes are rejected", async () => {
    const { as, toolId } = await setup();
    const loanId = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await expect(as.ana.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/already requested/);
    await as.ana.mutation(api.loans.decline, { loanId });
    await expect(as.ana.mutation(api.loans.approve, { loanId })).rejects.toThrow(/already declined/);
  });

  test("approving declines overlapping requests and blocks new overlapping ones", async () => {
    const { as, toolId } = await setup();
    const benLoan = await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-08" });
    const caraLoan = await as.cara.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-09" });
    await as.ana.mutation(api.loans.approve, { loanId: benLoan });
    expect((await as.cara.query(api.loans.myRequests, {})).find((l) => l._id === caraLoan)?.status).toBe("declined");
    await expect(as.cara.mutation(api.loans.request, { toolId, startDate: "2026-11-08", endDate: "2026-11-10" })).rejects.toThrow(/already lent out/);
  });

  test("each side sees only their own loans, without the other's email", async () => {
    const { as, toolId } = await setup();
    await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    const incoming = await as.ana.query(api.loans.incoming, {});
    expect(incoming).toHaveLength(1);
    expect(incoming[0].borrowerFirstName).toBe("Ben");
    expect(JSON.stringify(incoming)).not.toContain("@example.com");
    expect(await as.cara.query(api.loans.incoming, {})).toEqual([]);
    expect(await as.cara.query(api.loans.myRequests, {})).toEqual([]);
  });
});

describe("admin", () => {
  test("only admins can see all loans and set Trusted Lender", async () => {
    const { t, as, toolId } = await setup();
    await as.ben.mutation(api.loans.request, { toolId, startDate: "2026-11-05", endDate: "2026-11-06" });
    await expect(as.ben.query(api.loans.adminAll, {})).rejects.toThrow(/FORBIDDEN/);
    await expect(as.ben.query(api.tools.adminList, {})).rejects.toThrow(/FORBIDDEN/);
    expect(await as.admin.query(api.tools.adminList, {})).toHaveLength(1);
    expect(await as.admin.query(api.loans.adminAll, {})).toHaveLength(1);

    const anaId = await t.run(async (ctx) =>
      (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "ana@example.com")).unique())!._id,
    );
    await expect(as.ben.mutation(api.users.setTrustedLender, { userId: anaId, trusted: true })).rejects.toThrow(/FORBIDDEN/);
    await as.admin.mutation(api.users.setTrustedLender, { userId: anaId, trusted: true });
    expect((await as.ben.query(api.tools.list, {}))[0].ownerTrusted).toBe(true);
  });

  test("new users are never admins (roles are set only by an internal function)", async () => {
    const { as } = await setup();
    expect((await as.ben.query(api.users.me, {}))?.role).toBe("user");
  });
});
