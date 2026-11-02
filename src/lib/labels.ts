import { CATEGORIES, CONDITIONS } from "../../convex/lib/limits";

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type LoanStatus = "requested" | "approved" | "declined" | "cancelled" | "returned";

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  sports: "Sports",
  other: "Other",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const LOAN_STATUS: Record<LoanStatus, { label: string; tone: Tone }> = {
  requested: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "teal" },
  declined: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "zinc" },
  returned: { label: "Returned", tone: "zinc" },
};

export type Tone = "teal" | "amber" | "red" | "zinc" | "emerald";

export function parseCategory(value: string | null): Category | undefined {
  return CATEGORIES.find((c) => c === value);
}
