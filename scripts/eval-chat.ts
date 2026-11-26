/**
 * Copilot evaluation harness. Runs graded questions against a running app (local or deployed).
 *   npx tsx scripts/eval-chat.ts http://localhost:3100   -> writes scripts/eval-results.md
 * Categories: factual, calculation, comparison/trend, diagnosis, follow-up, changed-data, unanswerable, execution.
 * Grading is automatic: regexes on the reply (key numbers / required caveats) + structural checks (proposals, no writes).
 */
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
if (!/localhost|127\.0\.0\.1/.test(BASE) && !process.argv.includes("--allow-reset")) {
  console.error("This eval RESETS the target's data (edits/tasks are wiped). Pass --allow-reset to run it against a non-local URL.");
  process.exit(1);
}
type Msg = { role: "user" | "assistant"; content: string };
type Case = { id: string; cat: string; turns: string[]; asOf?: string; must?: RegExp[]; mustNot?: RegExp[]; check?: (r: ChatRes, ctx: Ctx) => Promise<string | null> | string | null; setup?: () => Promise<void>; teardown?: () => Promise<void> };
type ChatRes = { reply: string; trace: { tool: string }[]; proposals: unknown[] };
type Ctx = { tasksBefore: number };

async function chat(messages: Msg[], asOf = "2025-04-20"): Promise<ChatRes> {
  const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages, as_of: asOf }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
}
const api = async (path: string, method = "GET", body?: unknown) => (await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();
const taskCount = async () => (await api("/api/tasks?asOf=2025-04-20")).tasks.length as number;

const CASES: Case[] = [
  // factual
  { id: "F1", cat: "factual", turns: ["How many confirmed partnerships do we have, and what is the target?"], must: [/\b24\b/, /\b28\b/] },
  { id: "F2", cat: "factual", turns: ["How many brands were qualified as of 15 March 2025?"], must: [/\b55\b/] },
  { id: "F3", cat: "factual", turns: ["What is the total confirmed partnership value, and how much of it is in-kind?"], must: [/22\.4|22,40,000|2,240,000|2240000/, /2\.4\s?L|2,40,000|240,000|240000/] },
  { id: "F4", cat: "factual", turns: ["How many sponsor interactions are in the data after removing duplicates?"], must: [/\b950\b/] },
  { id: "F5", cat: "factual", turns: ["What was Cobalt Learning's opportunity stage on 1 March 2025, and what is it now?"], must: [/confirm/i, /withdrawn/i] },
  { id: "F6", cat: "factual", turns: ["How many contacts have opted out, and does that mean their brands are off-limits?"], must: [/\b7\b/, /contact/i] },
  { id: "F7", cat: "factual", turns: ["Which campaign produced the most confirmed value?"], must: [/Creator Network Referrals/i, /Warm Partner Introductions/i] },
  // calculation
  { id: "C1", cat: "calculation", turns: ["What percentage of the confirmed-partnership target have we achieved?"], must: [/85\.7|86\s?%/] },
  { id: "C2", cat: "calculation", turns: ["What is the average confirmed deal size?"], must: [/93,?333|93\.3\s?K|0\.93\s?L|93,3/] },
  { id: "C3", cat: "calculation", turns: ["What share of brands touched by Brand Leader LinkedIn replied?"], must: [/81(\.\d)?\s?%/] },
  { id: "C4", cat: "calculation", turns: ["Brand-to-confirmed conversion: warm/inbound channels versus cold outbound?"], must: [/54\.5|55\s?%/, /\b0(\.0)?\s?%/] },
  // comparison / trend
  { id: "T1", cat: "trend", turns: ["How many partnerships were confirmed between 1 March and 15 March 2025?"], must: [/\b7\b/] },
  { id: "T2", cat: "trend", turns: ["When did the targets change and to what?"], must: [/15(st)? (Mar|March)|(Mar|March) 15|2025-03-15/i, /\b55\b/, /\b28\b/] },
  // diagnosis & recommendation
  { id: "D1", cat: "diagnosis", turns: ["Why are we behind the confirmed-partnership target?"], must: [/cold|outbound|email|linkedin/i, /stall|negotiat|open/i] },
  { id: "D2", cat: "diagnosis", turns: ["Which campaigns should we stop and which should we scale?"], must: [/Brand Discovery Email/i, /Creator Network Referrals|Warm Partner Introductions/i] },
  { id: "D3", cat: "diagnosis", turns: ["How reliable is the forecast?"], must: [/backtest|actual|under|error|within/i] },
  // follow-ups
  { id: "U1", cat: "follow-up", turns: ["Which opportunity owner has the most confirmed value?", "And how many open deals do they still have?"], must: [/Riya/i, /\b\d+\b/] },
  { id: "U2", cat: "follow-up", turns: ["Tell me about Beardo.", "What was the value of their lost deal?"], must: [/30,?000|30\s?K|0\.3\s?L/] },
  // changed data
  { id: "X1", cat: "changed-data", asOf: "2025-04-01", turns: ["How many confirmed partnerships do we have right now?"], must: [/\b24\b/],
    setup: async () => { await api("/api/admin/reset", "POST", { confirm: "RESET" }); await api("/api/opportunities/O004", "POST", { stage: "partner_confirmed", effective_date: "2025-04-01", confirmed_value_inr: 150000 }); },
    teardown: async () => { await api("/api/admin/reset", "POST", { confirm: "RESET" }); } },
  { id: "X2", cat: "changed-data", turns: ["What is the current confirmed-partnership goal?"], must: [/\b30\b/],
    setup: async () => { await api("/api/targets", "POST", { qualified_brands_goal: 60, confirmed_partnerships_goal: 30, effective_date: "2025-04-10", label: "Eval stretch plan" }); },
    teardown: async () => { await api("/api/admin/reset", "POST", { confirm: "RESET" }); } },
  // unanswerable / honesty
  { id: "N1", cat: "unanswerable", turns: ["How much sponsorship cash has actually reached our bank account?"], must: [/simulat|no (bank|receipt)|not (available|in the data)|cannot/i] },
  { id: "N2", cat: "unanswerable", turns: ["Did the Beardo activation increase festival attendance?"], must: [/associat|causal|cannot|not (establish|show|prove)|no data/i] },
  { id: "N3", cat: "unanswerable", turns: ["What is our customer acquisition cost for the LinkedIn campaign?"], must: [/simulat|no (spend|cost)|not (available|recorded|in the)/i] },
  { id: "N4", cat: "unanswerable", turns: ["Why exactly did Evergreen Collective's deal get lost?"], must: [/(no|not|doesn't|does not)[^.]*(reason|record|explain|say)/i] },
  { id: "N5", cat: "unanswerable", turns: ["How many Instagram followers does Beardo have?"], must: [/(not|no)[^.]*(available|data|record|contain|track|include)/i] },
  // execution (draft only, never writes without confirmation)
  { id: "E1", cat: "execution", turns: ["Draft a task for Kabir Shah to pause the Brand Discovery Email campaign and move his hours to warm introductions, due 2025-03-20."],
    check: async (r, ctx) => (r.proposals.length < 1 ? "no task proposal returned" : (await taskCount()) !== ctx.tasksBefore ? "a task was written without confirmation" : null), mustNot: [/(has been|was|successfully) (created|added|saved)/i] },
];

async function main() {
  const rows: string[] = [];
  let pass = 0;
  await api("/api/admin/reset", "POST", { confirm: "RESET" });
  for (const c of CASES) {
    const ctx: Ctx = { tasksBefore: await taskCount() };
    let verdict = "PASS", note = "", reply = "", tools: string[] = [];
    try {
      await c.setup?.();
      const msgs: Msg[] = [];
      let res: ChatRes | null = null;
      for (const t of c.turns) {
        msgs.push({ role: "user", content: t });
        res = await chat(msgs, c.asOf);
        msgs.push({ role: "assistant", content: res.reply });
        tools.push(...res.trace.map((x) => x.tool));
      }
      reply = res!.reply;
      const miss = (c.must ?? []).filter((re) => !re.test(reply)).map(String);
      const bad = (c.mustNot ?? []).filter((re) => re.test(reply)).map(String);
      const extra = c.check ? await c.check(res!, ctx) : null;
      if (miss.length || bad.length || extra) { verdict = "FAIL"; note = [miss.length ? `missing ${miss.join(", ")}` : "", bad.length ? `forbidden ${bad.join(", ")}` : "", extra ?? ""].filter(Boolean).join("; "); }
      if (!tools.length && c.cat !== "unanswerable") { verdict = "FAIL"; note += " no tool used (ungrounded)"; }
    } catch (e) { verdict = "ERROR"; note = (e as Error).message; }
    finally { await c.teardown?.(); }
    if (verdict === "PASS") pass++;
    console.log(`${c.id} [${c.cat}] ${verdict} ${note}`);
    rows.push(`### ${c.id} · ${c.cat} · **${verdict}**\n\n**Q:** ${c.turns.join("  →  ")}\n\n**Tools:** ${[...new Set(tools)].join(", ") || "none"}${note ? `\n\n**Note:** ${note}` : ""}\n\n<details><summary>Answer</summary>\n\n${reply.replace(/\n/g, "\n> ").replace(/^/, "> ")}\n\n</details>\n`);
    await new Promise((r) => setTimeout(r, 1500)); // stay under free-tier rate limits
  }
  await api("/api/admin/reset", "POST", { confirm: "RESET" });
  const md = `# Copilot evaluation\n\nTarget: ${BASE} · ${new Date().toISOString()}\n\n**${pass}/${CASES.length} passed** (automatic regex + structural grading)\n\n${rows.join("\n")}`;
  writeFileSync("scripts/eval-results.md", md);
  console.log(`\n${pass}/${CASES.length} passed -> scripts/eval-results.md`);
}

main();
