"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BudgetSync, type Snapshot } from "@/lib/budget-sync";
import { BUDGET_TIMEOUT, requestJSON } from "@/lib/request";
export function useBudget(userId: string, enabled = true) {
  const [sync] = useState(() => new BudgetSync({
    get: (signal) => requestJSON<Snapshot>("/api/budget", { signal }, BUDGET_TIMEOUT),
    put: (state, revision, signal) => requestJSON("/api/budget", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, revision }), signal }, BUDGET_TIMEOUT),
  }, userId));
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  useEffect(() => { sync.activate(); if (enabled) void sync.load(); return () => sync.dispose(); }, [sync, enabled]);
  return { ...snapshot, sync };
}
