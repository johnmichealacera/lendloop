"use client";

import { ConvexError } from "convex/values";
import { useState } from "react";
import { toast } from "sonner";

export function friendlyError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (data?.message) return data.message;
  }
  return "Something went wrong. Please try again.";
}

/** Runs one mutation at a time per key, tracking which button is busy and toasting the result. */
export function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(friendlyError(error));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { busy, run };
}
