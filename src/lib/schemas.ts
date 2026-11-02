import { z } from "zod";
import { CATEGORIES, CONDITIONS, LIMITS } from "../../convex/lib/limits";
import { dayNumber } from "./dates";

export const toolSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(LIMITS.toolName, `At most ${LIMITS.toolName} characters.`),
  category: z.enum(CATEGORIES),
  condition: z.enum(CONDITIONS),
  description: z.string().trim().max(LIMITS.description, `At most ${LIMITS.description} characters.`),
});

export type ToolInput = z.infer<typeof toolSchema>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export function requestSchema(today: string) {
  return z
    .object({
      startDate: day,
      endDate: day,
      message: z.string().trim().max(LIMITS.message, `At most ${LIMITS.message} characters.`),
    })
    .superRefine(({ startDate, endDate }, ctx) => {
      const start = dayNumber(startDate);
      const end = dayNumber(endDate);
      if (start < dayNumber(today)) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Can't be in the past." });
      if (start - dayNumber(today) > LIMITS.maxAdvanceDays) {
        ctx.addIssue({ code: "custom", path: ["startDate"], message: `At most ${LIMITS.maxAdvanceDays} days ahead.` });
      }
      if (end < start) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Must be on or after the start." });
      else if (end - start + 1 > LIMITS.maxLoanDays) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: `A loan lasts at most ${LIMITS.maxLoanDays} days.` });
      }
    });
}

export type RequestInput = z.infer<ReturnType<typeof requestSchema>>;
