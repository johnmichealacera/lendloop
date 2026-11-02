import { Suspense } from "react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Whoami } from "@/components/whoami";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">LendLoop</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">Borrow what you need. Lend what you don&apos;t.</p>
        </div>
        <Suspense fallback={null}>
          <SignedInButton />
        </Suspense>
      </header>

      <Suspense fallback={<p className="text-sm text-zinc-500">Checking session…</p>}>
        <SessionGate />
      </Suspense>
    </main>
  );
}

function SignedInButton() {
  return (
    <Show when="signed-in">
      <UserButton />
    </Show>
  );
}

function SessionGate() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900">
            Sign in to lend or borrow
          </button>
        </SignInButton>
      </Show>

      <Show when="signed-in">
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium">Scaffold check: Clerk → Convex</h2>
          <Whoami />
        </section>
      </Show>
    </>
  );
}
