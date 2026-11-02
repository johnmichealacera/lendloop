"use client";

import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function IdentityFromConvex() {
  const me = useQuery(api.users.whoami);
  if (me === undefined) return <p className="text-sm text-zinc-500">Asking Convex who you are…</p>;
  if (me === null) return <p className="text-sm text-red-600">Convex did not accept the Clerk token.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-zinc-500">Clerk user ID (read in Convex)</dt>
      <dd className="font-mono">{me.subject}</dd>
      <dt className="text-zinc-500">Email</dt>
      <dd>{me.email ?? "—"}</dd>
    </dl>
  );
}

export function Whoami() {
  return (
    <>
      <AuthLoading>
        <p className="text-sm text-zinc-500">Connecting to Convex…</p>
      </AuthLoading>
      <Authenticated>
        <IdentityFromConvex />
      </Authenticated>
    </>
  );
}
