"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Check, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useApp, send } from "./app-context";
import { Markdown } from "./markdown";

type Proposal = { kind: "task" | "opportunity_update"; payload: Record<string, unknown>; rationale: string; warnings: string[]; state?: "pending" | "saved" | "dismissed" | "error"; result?: string };
type Msg = { role: "user" | "assistant"; content: string; trace?: { tool: string; args: unknown; result: unknown }[]; proposals?: Proposal[]; asOf?: string };

const SUGGESTED = [
  "Why are we behind the confirmed-partnership target, and what should we do this week?",
  "Which campaigns should we scale, change or stop? Show the evidence.",
  "How much cash have we actually received from sponsors?",
  "What if all negotiating deals close — do we hit 28?",
  "Compare 1 Mar vs 15 Mar: what changed?",
  "Did the Beardo activation increase festival attendance?",
];

export function Copilot() {
  const { asOf, refresh, pendingQuestion, clearPending } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const s = sessionStorage.getItem("gc-chat"); if (s) setMsgs(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("gc-chat", JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  useEffect(() => {
    if (pendingQuestion) { void ask(pendingQuestion); clearPending(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await send("/api/chat", "POST", { messages: next.map((m) => ({ role: m.role, content: m.content })), as_of: asOf });
      setMsgs([...next, { role: "assistant", content: r.reply, trace: r.trace, proposals: (r.proposals ?? []).map((p: Proposal) => ({ ...p, state: "pending" })), asOf: r.as_of }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  }

  async function decide(mi: number, pi: number, accept: boolean) {
    const m = msgs[mi]; const p = m.proposals![pi];
    const upd = (patch: Partial<Proposal>) => setMsgs((cur) => cur.map((x, i) => i !== mi ? x : { ...x, proposals: x.proposals!.map((y, j) => j !== pi ? y : { ...y, ...patch }) }));
    if (!accept) return upd({ state: "dismissed" });
    try {
      if (p.kind === "task") {
        const r = await send("/api/tasks", "POST", { ...p.payload, source: "copilot" });
        upd({ state: "saved", result: `Task ${r.task.task_id} created` });
      } else {
        const pl = p.payload;
        const r = await send(`/api/opportunities/${pl.opportunity_id}`, "POST", { stage: pl.stage, effective_date: pl.effective_date, proposed_value_inr: pl.proposed_value_inr, confirmed_value_inr: pl.confirmed_value_inr, note: `Copilot: ${p.rationale}` });
        upd({ state: "saved", result: `Saved as version ${r.version.history_id}${r.warning ? ` — ${r.warning}` : ""}` });
      }
      refresh();
    } catch (e) { upd({ state: "error", result: (e as Error).message }); }
  }

  return (
    <aside className="flex w-full max-w-[440px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Bot size={16} className="text-brand-600" /> Growth Analyst &amp; Copilot</div>
        <button title="Clear conversation" onClick={() => setMsgs([])} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Trash2 size={14} /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Answers come only from live app data via tools (as of <b>{asOf}</b>). It shows the evidence it used, says when data can&apos;t answer, and drafts tasks you confirm.</p>
            {SUGGESTED.map((q) => <button key={q} onClick={() => ask(q)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50">{q}</button>)}
          </div>
        )}
        {msgs.map((m, mi) => (
          <div key={mi} className={m.role === "user" ? "ml-8 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" : "mr-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200"}>
            {m.role === "user" ? m.content : <Markdown text={m.content} />}
            {m.proposals?.map((p, pi) => (
              <div key={pi} className="mt-2 rounded-lg border border-brand-200 bg-white p-2 text-xs">
                <div className="font-semibold text-brand-700">{p.kind === "task" ? "Proposed task" : "Proposed opportunity update"}</div>
                {p.kind === "task" ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="font-medium text-slate-800">{String(p.payload.title)}</div>
                    {p.payload.description ? <div className="text-slate-600">{String(p.payload.description)}</div> : null}
                    <div className="text-slate-500">Owner {String(p.payload.owner_id ?? "—")} · due {String(p.payload.due_date ?? "—")} · {String(p.payload.priority)}{p.payload.opportunity_id ? ` · ${p.payload.opportunity_id}` : ""}{p.payload.brand_id ? ` · ${p.payload.brand_id}` : ""}{p.payload.sponsor_campaign_id ? ` · ${p.payload.sponsor_campaign_id}` : ""}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-slate-700">{String(p.payload.brand ?? p.payload.opportunity_id)}: {String(p.payload.from_stage ?? "?")} → <b>{String(p.payload.stage)}</b> (effective {String(p.payload.effective_date)})</div>
                )}
                {p.rationale && <div className="mt-1 italic text-slate-500">Why: {p.rationale}</div>}
                {p.warnings?.length > 0 && <div className="mt-1 text-amber-700">⚠ {p.warnings.join("; ")}</div>}
                {p.state === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => decide(mi, pi, true)} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-700"><Check size={12} /> Confirm</button>
                    <button onClick={() => decide(mi, pi, false)} className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-300"><X size={12} /> Dismiss</button>
                  </div>
                ) : (
                  <div className={p.state === "saved" ? "mt-1 font-medium text-emerald-700" : p.state === "error" ? "mt-1 text-rose-700" : "mt-1 text-slate-400"}>{p.state === "dismissed" ? "Dismissed" : p.result}</div>
                )}
              </div>
            ))}
            {m.trace && m.trace.length > 0 && <Trace trace={m.trace} asOf={m.asOf} />}
          </div>
        ))}
        {busy && <div className="mr-2 animate-pulse rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">Analysing live data…</div>}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2 border-t border-slate-200 p-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Ask about performance, bottlenecks, forecasts, what to do next…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
          className="flex-1 resize-none rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none" />
        <button type="submit" disabled={busy || !input.trim()} className="self-end rounded-lg bg-brand-600 p-2 text-white disabled:opacity-40"><Send size={16} /></button>
      </form>
    </aside>
  );
}

function Trace({ trace, asOf }: { trace: NonNullable<Msg["trace"]>; asOf?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-slate-200 pt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Evidence: {trace.length} tool call{trace.length > 1 ? "s" : ""} {asOf ? `· as of ${asOf}` : ""}
      </button>
      {open && trace.map((t, i) => (
        <details key={i} className="mt-1 text-[11px]">
          <summary className="cursor-pointer font-mono text-slate-600">{t.tool}({JSON.stringify(t.args)})</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">{JSON.stringify(t.result, null, 1)}</pre>
        </details>
      ))}
    </div>
  );
}
