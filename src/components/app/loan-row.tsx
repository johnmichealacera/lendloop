import type { ReactNode } from "react";
import { formatRange, todayLocal } from "@/lib/dates";
import { LOAN_STATUS, type LoanStatus } from "@/lib/labels";
import { Badge, Card } from "@/components/ui";

export function LoanRow({
  loan,
  who,
  actions,
}: {
  loan: { toolName: string; startDate: string; endDate: string; status: LoanStatus; message: string | null };
  who: string;
  actions?: ReactNode;
}) {
  const status = LOAN_STATUS[loan.status];
  const overdue = loan.status === "approved" && loan.endDate < todayLocal();
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{loan.toolName}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
            {overdue && <Badge tone="red">Overdue</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {formatRange(loan.startDate, loan.endDate)} · {who}
          </p>
          {loan.message && <p className="mt-2 text-sm italic text-zinc-700 dark:text-zinc-300">&ldquo;{loan.message}&rdquo;</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </Card>
  );
}
