"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRunner } from "@/lib/use-runner";
import { Button, EmptyState, Loading, PageHeader } from "@/components/ui";
import { LoanRow } from "./loan-row";

export function MyRequests() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const { busy, run } = useRunner();

  return (
    <>
      <PageHeader title="My requests" description="Tools you asked to borrow, and where each request stands." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet" hint="Find something under Tools and request dates." />
      ) : (
        <ul className="space-y-3">
          {loans.map((l) => (
            <li key={l._id}>
              <LoanRow
                loan={l}
                who={`from ${l.ownerFirstName}`}
                actions={
                  l.status === "requested" && (
                    <Button
                      variant="danger"
                      loading={busy === l._id}
                      onClick={() => void run(l._id, () => cancel({ loanId: l._id }), "Request cancelled.")}
                    >
                      Cancel
                    </Button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
