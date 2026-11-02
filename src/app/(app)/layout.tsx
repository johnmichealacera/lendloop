import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Loading } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
