"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatRange } from "@/lib/dates";
import { CATEGORY_LABELS, LOAN_STATUS } from "@/lib/labels";
import { useRunner } from "@/lib/use-runner";
import { Badge, Button, EmptyState, Loading, PageHeader, Section } from "@/components/ui";

const table = "w-full text-left text-sm";
const th = "border-b border-zinc-200 px-3 py-2 font-medium text-zinc-500 dark:border-zinc-800";
const td = "border-b border-zinc-100 px-3 py-2 dark:border-zinc-800/60";
const wrap = "overflow-x-auto rounded-xl border border-zinc-200/80 bg-white/85 dark:border-zinc-800 dark:bg-zinc-900/85";

function AdminContent() {
  const tools = useQuery(api.tools.adminList);
  const loans = useQuery(api.loans.adminAll);
  const users = useQuery(api.users.adminListUsers);
  const remove = useMutation(api.tools.remove);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const deliveries = useQuery(api.n8n.adminEvents);
  const retry = useMutation(api.n8n.adminRetry);
  const { busy, run } = useRunner();

  return (
    <>
      <Section title="Notifications needing attention">
        {deliveries === undefined ? (
          <Loading />
        ) : deliveries.length === 0 ? (
          <EmptyState title="All notifications delivered" hint="Failed or retrying deliveries to n8n show up here." />
        ) : (
          <div className={wrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Event</th>
                  <th className={th}>Tool</th>
                  <th className={th}>Status</th>
                  <th className={th}>Attempts</th>
                  <th className={th}>Last error</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d._id}>
                    <td className={td}>{d.event ?? d.kind}</td>
                    <td className={td}>{d.toolName}</td>
                    <td className={td}>{d.status === "failed" ? <Badge tone="red">Failed</Badge> : <Badge tone="amber">Retrying</Badge>}</td>
                    <td className={td}>{d.attempts}</td>
                    <td className={`${td} max-w-xs truncate text-xs text-zinc-500`} title={d.lastError ?? undefined}>
                      {d.lastError ?? "—"}
                    </td>
                    <td className={`${td} text-right`}>
                      {d.status === "failed" && (
                        <Button
                          loading={busy === `retry-${d._id}`}
                          onClick={() => void run(`retry-${d._id}`, () => retry({ eventId: d._id }), "Retrying delivery.")}
                        >
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Listings">
        {tools === undefined ? (
          <Loading />
        ) : tools.length === 0 ? (
          <EmptyState title="No listings" />
        ) : (
          <div className={wrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Category</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t._id}>
                    <td className={td}>{t.name}</td>
                    <td className={td}>{CATEGORY_LABELS[t.category]}</td>
                    <td className={td}>{t.ownerName}</td>
                    <td className={td}>{t.status === "on_loan" ? <Badge tone="amber">On loan</Badge> : <Badge tone="emerald">Available</Badge>}</td>
                    <td className={`${td} text-right`}>
                      <Button
                        variant="danger"
                        loading={busy === `remove-${t._id}`}
                        onClick={() => {
                          if (!window.confirm(`Remove "${t.name}" from LendLoop?`)) return;
                          void run(`remove-${t._id}`, () => remove({ toolId: t._id }), "Listing removed.");
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Loans">
        {loans === undefined ? (
          <Loading />
        ) : loans.length === 0 ? (
          <EmptyState title="No loans yet" />
        ) : (
          <div className={wrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Borrower</th>
                  <th className={th}>Dates</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l._id}>
                    <td className={td}>{l.toolName}</td>
                    <td className={td}>{l.ownerName ?? l.ownerFirstName}</td>
                    <td className={td}>{l.borrowerName ?? l.borrowerFirstName}</td>
                    <td className={td}>{formatRange(l.startDate, l.endDate)}</td>
                    <td className={td}>
                      <Badge tone={LOAN_STATUS[l.status].tone}>{LOAN_STATUS[l.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Members">
        {users === undefined ? (
          <Loading />
        ) : (
          <div className={wrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Email</th>
                  <th className={th}>Role</th>
                  <th className={th}>Trusted Lender</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td className={td}>{u.name}</td>
                    <td className={td}>{u.email}</td>
                    <td className={td}>{u.role === "admin" ? <Badge tone="teal">Admin</Badge> : "User"}</td>
                    <td className={td}>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-teal-600"
                          checked={u.trustedLender}
                          disabled={busy === `trust-${u._id}`}
                          onChange={(e) =>
                            void run(
                              `trust-${u._id}`,
                              () => setTrusted({ userId: u._id, trusted: e.target.checked }),
                              e.target.checked ? `${u.name} is now a Trusted Lender.` : "Badge removed.",
                            )
                          }
                        />
                        {u.trustedLender ? "Yes" : "No"}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

export function AdminPanel() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <Loading />;
  return (
    <>
      <PageHeader title="Admin" description="Moderate listings, see every loan, and award the Trusted Lender badge." />
      {me?.role === "admin" ? <AdminContent /> : <EmptyState title="Admins only" hint="This page isn't available for your account." />}
    </>
  );
}
