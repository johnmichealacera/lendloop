export const LIMITS = {
  toolName: 80,
  description: 500,
  message: 300,
  maxLoanDays: 30,
  maxAdvanceDays: 180,
} as const;

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "sports",
  "other",
] as const;

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
