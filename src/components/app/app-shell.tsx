"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Loading } from "@/components/ui";

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

function Nav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pages render only once the user's Convex row exists, so their queries never hit "not set up yet". */
function ReadyGate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  return (
    <>
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <Nav isAdmin={me?.role === "admin"} />
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {me ? children : <Loading label="Setting up your account…" />}
      </main>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Lend<span className="bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">Loop</span>
        </Link>
        <UserButton />
      </header>
      <AuthLoading>
        <main className="mx-auto w-full max-w-5xl px-4">
          <Loading label="Signing you in…" />
        </main>
      </AuthLoading>
      <Unauthenticated>
        <main className="mx-auto w-full max-w-5xl px-4">
          <Loading label="Redirecting…" />
        </main>
      </Unauthenticated>
      <Authenticated>
        <ReadyGate>{children}</ReadyGate>
      </Authenticated>
    </div>
  );
}
