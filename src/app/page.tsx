import { Suspense } from "react";
import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { PublicTools } from "@/components/public-tools";

export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="pointer-events-none absolute -top-10 left-1/2 -z-10 size-72 -translate-x-1/2 rounded-full bg-teal-400/20 blur-3xl" />
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Lend<span className="bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">Loop</span>
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">Borrow what you need. Lend what you don&apos;t.</p>
        </div>
        <Suspense fallback={null}>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </Suspense>
      </header>

      <Suspense fallback={null}>
        <Show when="signed-out">
          <SignInButton mode="modal" forceRedirectUrl="/tools">
            <button className="w-fit rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:from-teal-500 hover:to-emerald-500">
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/tools"
            className="w-fit rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:from-teal-500 hover:to-emerald-500"
          >
            Open LendLoop →
          </Link>
        </Show>
      </Suspense>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Available in the neighborhood</h2>
        <PublicTools />
      </section>
    </main>
  );
}
