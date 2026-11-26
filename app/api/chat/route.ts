import { GoogleGenAI, type Content } from "@google/genai";
import { getStore } from "@/lib/store";
import { fail } from "@/lib/api";
import { defaultAsOf } from "@/lib/metrics";
import { TOOL_DECLARATIONS, runTool, type Proposal } from "@/lib/copilot/tools";
import { systemPrompt } from "@/lib/copilot/prompt";

export const maxDuration = 120;

// Primary model first; on overload (503/429) fall back down the chain. Once a model answers,
// the rest of the request sticks to it (tool-call turns are not mixed across models).
const MODELS = (process.env.GEMINI_MODEL || "gemini-4-hydrogen,gemini-3.8-flash,gemini-3.5-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);
const MAX_ROUNDS = 8;
const clip = (x: unknown, n = 24000) => { const s = JSON.stringify(x); return s.length > n ? JSON.parse(JSON.stringify({ truncated: true, preview: s.slice(0, n) })) : x; };

type Msg = { role: "user" | "assistant"; content: string };

// Overloaded, rate-limited or hung (our own per-call timeout) all mean "try the next model".
const BUSY = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|high demand|abort|timed? ?out/i;
// A fallback candidate gets a short leash (a busy model can hang 45 s+); the model in use gets longer.
const CANDIDATE_TIMEOUT_MS = 10_000;
const STICKY_TIMEOUT_MS = 30_000;

// Per-instance memory of overloaded models, so later requests skip straight to one that answers.
const COOLDOWN_MS = 120_000;
const busyUntil = new Map<string, number>();

async function generate(ai: GoogleGenAI, contents: Content[], system: string, state: { model?: string }) {
  const now = Date.now();
  const fresh = MODELS.filter((m) => (busyUntil.get(m) ?? 0) <= now);
  const chain = state.model ? [state.model] : (fresh.length ? fresh : MODELS);
  let last: unknown;
  for (const model of chain) {
    const sticky = !!state.model;
    // Fallback candidates get one quick try; the model already in use gets patient retries.
    const isLast = model === chain[chain.length - 1];
    for (let attempt = 0; attempt < (sticky ? 3 : isLast ? 2 : 1); attempt++) {
      try {
        const res = await ai.models.generateContent({
          model, contents,
          config: {
            systemInstruction: system, tools: [{ functionDeclarations: TOOL_DECLARATIONS as never }], temperature: 0.2,
            abortSignal: AbortSignal.timeout(sticky || isLast ? STICKY_TIMEOUT_MS : CANDIDATE_TIMEOUT_MS),
          },
        });
        state.model = model;
        busyUntil.delete(model);
        return res;
      } catch (e) {
        last = e;
        const msg = String((e as Error).message ?? e);
        const notFound = /404|NOT_FOUND|no longer available/i.test(msg);
        if (!BUSY.test(msg) && !notFound) throw e;
        if (!sticky) busyUntil.set(model, Date.now() + (notFound ? 24 * 3600_000 : COOLDOWN_MS));
        if (notFound) break;
        if (!sticky && !isLast) break;
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
  }
  throw last;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { messages: Msg[]; as_of?: string };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return Response.json({ reply: "The AI copilot is not configured (GEMINI_API_KEY missing). The dashboard still works.", trace: [], proposals: [] });
    const db = await getStore().load();
    const asOf = body.as_of && /^\d{4}-\d{2}-\d{2}$/.test(body.as_of) ? body.as_of : defaultAsOf(db);
    const ai = new GoogleGenAI({ apiKey });
    const contents: Content[] = (body.messages ?? []).slice(-16).filter((m) => m.content?.trim()).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const trace: { tool: string; args: unknown; result: unknown }[] = [];
    const proposals: Proposal[] = [];
    const system = systemPrompt(db, asOf);
    let reply = "";
    const state: { model?: string } = {};
    const deadline = Date.now() + 95_000;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (round > 0 && Date.now() > deadline) { reply = "The model is slow right now, so I stopped before finishing. The evidence trace below shows what I gathered; please ask again or narrow the question."; break; }
      const res = await generate(ai, contents, system, state);
      const calls = res.functionCalls ?? [];
      const content = res.candidates?.[0]?.content;
      if (!calls.length) { reply = res.text ?? ""; break; }
      if (content) contents.push(content);
      const parts = calls.map((c) => {
        let out: unknown;
        try {
          const r = runTool(db, c.name ?? "", (c.args ?? {}) as Record<string, unknown>, asOf);
          out = r.result;
          if (r.proposal) proposals.push(r.proposal);
        } catch (e) { out = { error: (e as Error).message }; }
        trace.push({ tool: c.name ?? "?", args: c.args ?? {}, result: clip(out, 4000) });
        return { functionResponse: { id: c.id, name: c.name, response: { result: clip(out) } } };
      });
      contents.push({ role: "user", parts });
      if (round === MAX_ROUNDS - 1) reply = "I hit my tool-call limit before finishing. Here is what I gathered — please narrow the question.";
    }
    if (!reply.trim()) reply = "I could not produce an answer from the available data. Try rephrasing or narrowing the question.";
    return Response.json({ reply, trace, proposals, as_of: asOf, model: state.model ?? MODELS[0] });
  } catch (e) { return fail(e); }
}
