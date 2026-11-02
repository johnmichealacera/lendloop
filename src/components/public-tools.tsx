"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/labels";
import { Badge, EmptyState, Loading } from "@/components/ui";

export function PublicTools() {
  const tools = useQuery(api.tools.listPublic, {});
  if (tools === undefined) return <Loading label="Loading tools…" />;
  if (tools.length === 0) return <EmptyState title="No tools listed yet" hint="Sign in and be the first to lend something." />;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {tools.map((t, i) => (
        <li
          key={`${t.name}-${i}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70"
        >
          <span className="font-medium">{t.name}</span>
          <Badge tone="zinc">{CATEGORY_LABELS[t.category]}</Badge>
        </li>
      ))}
    </ul>
  );
}
