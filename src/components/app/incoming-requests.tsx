"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRunner } from "@/lib/use-runner";
import { Button, EmptyState, Loading, PageHeader, Section } from "@/components/ui";
import { LoanRow } from "./loan-row";

export function IncomingRequests() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const { busy, run } = useRunner();

  if (loans === undefined) return <Loading />;
  const pending = loans.filter((l) => l.status === "requested");
  const active = loans.filter((l) => l.status === "approved");
  const history = loans.filter((l) => l.status !== "requested" && l.status !== "approved");

  return (
    <>
      <PageHeader title="Incoming" description="Requests for your tools, and what's currently lent out." />

      <Section title={`Pending requests (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting on you" />
        ) : (
          <ul className="space-y-3">
            {pending.map((l) => (
              <li key={l._id}>
                <LoanRow
                  loan={l}
                  who={`requested by ${l.borrowerFirstName}`}
                  actions={
                    <>
                      <Button
                        variant="danger"
                        disabled={busy !== null}
                        loading={busy === `decline-${l._id}`}
                        onClick={() => void run(`decline-${l._id}`, () => decline({ loanId: l._id }), "Request declined.")}
                      >
                        Decline
                      </Button>
                      <Button
                        variant="primary"
                        disabled={busy !== null}
                        loading={busy === `approve-${l._id}`}
                        onClick={() => void run(`approve-${l._id}`, () => approve({ loanId: l._id }), "Approved. Overlapping requests were declined.")}
                      >
                        Approve
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Lent out (${active.length})`}>
        {active.length === 0 ? (
          <EmptyState title="None of your tools are out right now" />
        ) : (
          <ul className="space-y-3">
            {active.map((l) => (
              <li key={l._id}>
                <LoanRow
                  loan={l}
                  who={`with ${l.borrowerFirstName}`}
                  actions={
                    <Button
                      loading={busy === `return-${l._id}`}
                      onClick={() => void run(`return-${l._id}`, () => markReturned({ loanId: l._id }), "Marked as returned.")}
                    >
                      Mark returned
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {history.length > 0 && (
        <Section title="History">
          <ul className="space-y-3">
            {history.map((l) => (
              <li key={l._id}>
                <LoanRow loan={l} who={l.borrowerFirstName} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
