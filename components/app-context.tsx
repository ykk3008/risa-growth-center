"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

interface Ctx {
  asOf: string;
  setAsOf: (d: string) => void;
  version: number;          // bump to make every view refetch after a mutation
  refresh: () => void;
  copilotOpen: boolean;
  setCopilotOpen: (b: boolean) => void;
  ask: (q: string) => void; // open copilot with a pre-filled question
  pendingQuestion: string | null;
  clearPending: () => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const DEFAULT_AS_OF = "2025-04-20";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [asOf, setAsOfState] = useState(DEFAULT_AS_OF);
  const [version, setVersion] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [pendingQuestion, setPending] = useState<string | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem("gc-asof"); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) setAsOfState(v); } catch { /* storage unavailable */ }
  }, []);
  const setAsOf = useCallback((d: string) => {
    setAsOfState(d);
    try { localStorage.setItem("gc-asof", d); } catch { /* ignore */ }
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const ask = useCallback((q: string) => { setCopilotOpen(true); setPending(q); }, []);
  return (
    <AppCtx.Provider value={{ asOf, setAsOf, version, refresh, copilotOpen, setCopilotOpen, ask, pendingQuestion, clearPending: () => setPending(null) }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

/** Fetch JSON from an API route; refetches when asOf or version changes. */
export function useApi<T>(path: string | null, withAsOf = true) {
  const { asOf, version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    const url = withAsOf ? `${path}${path.includes("?") ? "&" : "?"}asOf=${asOf}` : path;
    fetch(url, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; })
      .then((j) => { if (alive) { setData(j); setError(null); } })
      .catch((e) => alive && setError(String(e.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [path, asOf, version, withAsOf]);
  return { data, error, loading };
}

export async function send(path: string, method: string, body?: unknown) {
  const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
