import { Suspense } from "react";
import { ToolBrowser } from "@/components/app/tool-browser";
import { Loading, PageHeader } from "@/components/ui";

export default function ToolsPage() {
  return (
    <>
      <PageHeader title="Tools" description="Everything your neighbors are lending. Filter by category and request dates." />
      <Suspense fallback={<Loading />}>
        <ToolBrowser />
      </Suspense>
    </>
  );
}
