"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CATEGORIES, CONDITIONS, LIMITS } from "../../../convex/lib/limits";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";
import { toolSchema, type ToolInput } from "@/lib/schemas";
import { Button, Field, inputClass } from "@/components/ui";

const EMPTY: ToolInput = { name: "", category: "power_tools", condition: "good", description: "" };

export function ToolForm({
  initial = EMPTY,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial?: ToolInput;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: ToolInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const form = useForm({ resolver: zodResolver(toolSchema), defaultValues: initial });
  const { errors } = form.formState;
  const description = useWatch({ control: form.control, name: "description" }) ?? "";

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        if (await onSubmit(values)) form.reset(EMPTY);
      })}
      className="space-y-3"
    >
      <Field label="Name" error={errors.name?.message}>
        <input className={inputClass} placeholder="Cordless drill" maxLength={LIMITS.toolName} {...form.register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.category?.message}>
          <select className={inputClass} {...form.register("category")}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition" error={errors.condition?.message}>
          <select className={inputClass} {...form.register("condition")}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={`Description (${description.length}/${LIMITS.description})`} error={errors.description?.message}>
        <textarea rows={3} className={inputClass} placeholder="18V, two batteries, charger included" {...form.register("description")} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
