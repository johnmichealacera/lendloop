"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CATEGORIES } from "../../../convex/lib/limits";
import { CATEGORY_LABELS, CONDITION_LABELS, parseCategory } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, Loading } from "@/components/ui";
import { RequestForm } from "./request-form";

function CategoryFilter({ active }: { active?: string }) {
  const chip = (selected: boolean) =>
    `rounded-full px-3 py-1 text-sm transition ${
      selected
        ? "bg-teal-600 text-white"
        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    }`;
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <Link href="/tools" className={chip(!active)}>
        All
      </Link>
      {CATEGORIES.map((c) => (
        <Link key={c} href={`/tools?category=${c}`} className={chip(active === c)}>
          {CATEGORY_LABELS[c]}
        </Link>
      ))}
    </div>
  );
}

export function ToolBrowser() {
  const category = parseCategory(useSearchParams().get("category"));
  const tools = useQuery(api.tools.list, { category });
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);

  return (
    <>
      <CategoryFilter active={category} />
      {tools === undefined ? (
        <Loading label="Loading tools…" />
      ) : tools.length === 0 ? (
        <EmptyState
          title={category ? `No ${CATEGORY_LABELS[category].toLowerCase()} listed yet` : "No tools listed yet"}
          hint="Have one to share? Add it under My listings."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tools.map((t) => (
            <li key={t._id}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {CATEGORY_LABELS[t.category]} · {CONDITION_LABELS[t.condition]} condition
                    </p>
                  </div>
                  {t.available ? <Badge tone="emerald">Available</Badge> : <Badge tone="amber">On loan</Badge>}
                </div>
                {t.description && <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{t.description}</p>}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {t.isMine ? "Your listing" : `Lent by ${t.ownerFirstName}`}
                    {t.ownerTrusted && (
                      <Badge tone="teal">
                        <ShieldCheck className="size-3" aria-hidden /> Trusted Lender
                      </Badge>
                    )}
                  </span>
                  {!t.isMine && requesting !== t._id && (
                    <Button variant="primary" onClick={() => setRequesting(t._id)}>
                      Request to borrow
                    </Button>
                  )}
                </div>
                {!t.available && !t.isMine && requesting !== t._id && (
                  <p className="mt-2 text-xs text-zinc-500">You can still request dates after the current loan.</p>
                )}
                {requesting === t._id && <RequestForm toolId={t._id} onDone={() => setRequesting(null)} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
