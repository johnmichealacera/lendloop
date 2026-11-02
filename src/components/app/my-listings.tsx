"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";
import { useRunner } from "@/lib/use-runner";
import { Badge, Button, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { ToolForm } from "./tool-form";

export function MyListings() {
  const tools = useQuery(api.tools.myListings);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const { busy, run } = useRunner();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);

  return (
    <>
      <PageHeader
        title="My listings"
        description="Tools you're lending out."
        action={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> Add a tool
            </Button>
          )
        }
      />

      {adding && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">New listing</h2>
          <ToolForm
            submitLabel="List tool"
            saving={busy === "create"}
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              const ok = await run("create", () => create(values), "Tool listed.");
              if (ok) setAdding(false);
              return ok;
            }}
          />
        </Card>
      )}

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        !adding && <EmptyState title="You haven't listed anything yet" hint="Add a tool your neighbors could borrow." />
      ) : (
        <ul className="space-y-3">
          {tools.map((t) => (
            <li key={t._id}>
              <Card>
                {editing === t._id ? (
                  <ToolForm
                    initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                    submitLabel="Save changes"
                    saving={busy === `update-${t._id}`}
                    onCancel={() => setEditing(null)}
                    onSubmit={async (values) => {
                      const ok = await run(`update-${t._id}`, () => update({ toolId: t._id, ...values }), "Listing updated.");
                      if (ok) setEditing(null);
                      return ok;
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{t.name}</h3>
                        {t.status === "on_loan" ? <Badge tone="amber">On loan</Badge> : <Badge tone="emerald">Available</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {CATEGORY_LABELS[t.category]} · {CONDITION_LABELS[t.condition]} condition
                      </p>
                      {t.description && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{t.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => setEditing(t._id)}>Edit</Button>
                      <Button
                        variant="danger"
                        loading={busy === `remove-${t._id}`}
                        disabled={t.status === "on_loan"}
                        title={t.status === "on_loan" ? "Mark it returned first" : undefined}
                        onClick={() => {
                          if (!window.confirm(`Delete "${t.name}"? Pending requests for it will be cancelled.`)) return;
                          void run(`remove-${t._id}`, () => remove({ toolId: t._id }), "Listing deleted.");
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
