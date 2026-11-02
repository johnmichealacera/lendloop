"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { addDays, todayLocal } from "@/lib/dates";
import { requestSchema } from "@/lib/schemas";
import { useRunner } from "@/lib/use-runner";
import { Button, Field, inputClass } from "@/components/ui";

export function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const today = todayLocal();
  const request = useMutation(api.loans.request);
  const { busy, run } = useRunner();
  const form = useForm({
    resolver: zodResolver(requestSchema(today)),
    defaultValues: { startDate: today, endDate: addDays(today, 2), message: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const ok = await run(
      "request",
      () => request({ toolId, startDate: values.startDate, endDate: values.endDate, message: values.message || undefined }),
      "Request sent. The owner will be notified.",
    );
    if (ok) onDone();
  });

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" error={errors.startDate?.message}>
          <input type="date" min={today} className={inputClass} {...form.register("startDate")} />
        </Field>
        <Field label="Until" error={errors.endDate?.message}>
          <input type="date" min={today} className={inputClass} {...form.register("endDate")} />
        </Field>
      </div>
      <Field label="Message (optional)" error={errors.message?.message}>
        <textarea rows={2} className={inputClass} placeholder="What's it for?" {...form.register("message")} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy === "request"}>
          Send request
        </Button>
      </div>
    </form>
  );
}
