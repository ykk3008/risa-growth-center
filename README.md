# Sponsorship Growth Center — RISA Growth APM assignment (Challenge B)

**Author:** Bommineedi Manaswitha (Roll No. 23ME10018)
**Challenge:** B — Sponsorship Growth: maximise sponsorship **cash collected before the festival**
**Live app:** **https://risa-growth-center-three.vercel.app** · **Repo:** https://github.com/ykk3008/risa-growth-center · **3-slide strategy (PDF):** `Manaswitha_RISA_Sponsorship_Strategy.pdf` · **Copilot eval results:** [scripts/eval-results.md](scripts/eval-results.md)

> I ran sponsorship sales for a large Indian college fest. The lesson I carried into this case: *a signed deal is not cash*. So the north-star metric is **cash in the bank 14 days before the fest (T-14), net of TDS** — not "confirmed value".

---

## 1. TL;DR

| | |
|---|---|
| **City / event** | **Mumbai**, CampusFest 2027, 6–7 March 2027 |
| **2025 baseline** (provided dataset) | 24 confirmed partnerships (goal 28), ₹22.4L confirmed value (₹20.0L cash-type). **100% of value came from warm/inbound channels; cold email, LinkedIn and revival converted 0 of 148 brands.** |
| **Status-quo replay** | ₹14.1L cash by T-14 (2025 deals through the same cash rules, 3 sellers) |
| **Base case** | **₹54.1L cash by T-14** (3.8× = 1.32× more deals × 2.97× higher average ticket). 32 deals, ₹88.1L signed, 6 sellers at 85% load. **P10–P90: ₹42.0L–₹65.8L** (Monte Carlo). |
| **Stretch** | **₹1.27 Cr**: 61 deals, 8 sellers, higher conversion. Comes mainly from volume (store +₹25L, warm +₹19L, verticals +₹16L), not the anchor (+₹12L). |
| **Bets (net cash per 100 seller-hours)** | 1. Warm-network engine (6.23) · 2. Self-serve sponsor store + bundles (5.71) · 3. Unbundled vertical titles (5.49) · 4. Anchor fintech/UPI/bank title (4.59, high variance, kill switch) · 5. Hybrid performance packages (−0.17 in base → capped pilot) |
| **Deprioritised / rejected** | Mass cold email, revival, cold LinkedIn (0 closes in 2025) → account-based asks only. Rejected: pure CPA, CSR pitches, govt/PSU grants, multi-fest consortium, in-kind-only. |
| **Product** | Next.js + Supabase + Gemini: point-in-time funnel analytics, campaign scale/change/stop verdicts, **live bet signals against the 2027 thresholds**, pipeline kanban with versioned edits, tasks, simulated cash ledger, and a tool-calling copilot that grounds every number in live data, shows evidence, admits what the data can't answer, and drafts tasks you confirm. |

---

## 2. Challenge and city

- **Why Challenge B.** It is where my experience gives an edge, and the sponsor data has a decisive, testable insight about channel mix.
- **Why Mumbai** (scores in [research/fact_base.md §2](research/fact_base.md)).
  - Weighted score: Delhi-NCR 8.95, Mumbai 8.90, Bengaluru 7.40, Chennai 6.00. Weights: brand-HQ pool 30%, students 20%, agency access 15%, fest precedent 15%, venue cost 10%, startup funding 10%. The top two are within noise.
  - **Tiebreak (sourced):** the largest bank/UPI title buyers of 2024–26 make budget decisions in Mumbai — NPCI (BKC), SBI Corporate Centre and Union Bank Central Office (Nariman Point), IDFC FIRST corporate office (BKC). Not every fintech is in Mumbai; if the sponsor mix were D2C or quick-commerce led, **Delhi-NCR would win**.
  - Mumbai also has the most-sponsored fest precedents (Techfest raised ₹1.58 Cr in 2014) and the fastest metro collections (59 days for MSMEs).
- **Why early March.** Avoids the December Mood Indigo/Techfest season and lands before brands' 31 March FY close (reasoning, not a sourced fact).

---

## 3. What the data says (and its traps)

Source: `data/source/Sponsor Dataset.xlsx` (fictional CampusFest 2025). Every figure below is reproduced by `npm test` and `model/build_model.py`.

| Campaign | Brands | Attempts | Replied | Met | Qualified | Opps | Confirmed | ₹ confirmed |
|---|---|---|---|---|---|---|---|---|
| Creator Network Referrals (warm) | 19 | 21 | 19 | 15 | 15 | 9 | 9 | 7.85L |
| Warm Partner Introductions | 8 | 9 | 8 | 8 | 8 | 9 | 8 | 7.85L |
| Partner Interest Form (inbound) | 17 | 18 | 17 | 13 | 13 | 7 | 7 | 6.70L |
| Brand Discovery Email (cold) | 91 | 224 | 34 | 7 | 7 | 11 | **0** | 0 |
| Brand Leader LinkedIn (cold) | 37 | 54 | 30 | 10 | 10 | 12 | **0** | 0 |
| Past Conversation Revival | 20 | 44 | 10 | 7 | 7 | 10 | **0** | 0 |

- Qualified brands 60 (goal 55); confirmed partnerships 24 (revised goal 28; launch goal 20); ₹22.4L confirmed, ₹2.4L of it in-kind.
- Open pipeline: 26 deals, ₹14.4L, all from cold channels, all stalled > 14 days. Median prospecting→confirmed: 10 days.
- One owner holds 126 of 180 brands, mostly cold: seller time went to the channel that does not close.

**Data rules implemented (the traps):**
- **Import retries** — repeated `interaction_id` / `history_id` rows counted once (3 / 1 / 2 duplicates).
- **As-of snapshots** — end of day IST; latest version ≤ cutoff per entity; versions never summed. Cobalt Learning is *confirmed* on 1 March and *withdrawn* from 20 March. Brand views also hide contacts, receipts and voids after the cutoff.
- **Different populations** — attempts ≠ contacts ≠ brands ≠ qualified ≠ confirmed; a positive reply ≠ qualification; one brand can hold two opportunities (Beardo).
- **Value ≠ cash**; in-kind ≠ cash; **activations** are associations, not causal uplift; **opt-outs** are contact-level.
- **No spend or bank data exists**, so campaign budgets/hours and payments are a **clearly tagged simulated layer** (`is_simulated`, **SIM** in the UI). Confirming a cash deal in the app creates its simulated invoices; moving it out of confirmed voids the unpaid ones.

---

## 4. Slide 1: target model (`model/build_model.py` → `model/sponsorship_model.xlsx`)

Inputs are tagged **DATA** (provided dataset), **BENCH** (public source in `research/fact_base.md`) or **EST** (own estimate). On the *Model* sheet, the yellow inputs drive live formulas for the funnel, segment value and cash. Capacity, bet attribution, sensitivities and the Monte Carlo band are computed by the script (re-run it after changing inputs there).

**Funnel per segment × channel:** `signed = prospects × P(meeting) × P(proposal|meeting) × P(MoU|proposal) × size factor`, capped by inventory slots.

| Channel | Base (meet / proposal / MoU) | Stretch | Per 100 (base) | Basis |
|---|---|---|---|---|
| Warm intro | 40% / 70% / 40% | 50% / 75% / 50% | 11.2 | EST. 2025 warm: 82% met, 55% of brands confirmed (small sample) → capped at the top of the vendor 25–40% intro→meeting range; vendor 10–20 signed per 100. |
| Inbound / sponsor store | 60% / 70% / 45% | 70% / 75% / 55% | 18.9 | EST from 2025 form: 76% met, 41% confirmed. |
| Cold ABM (anchors/verticals only) | 12% / 60% / 20% | 18% / 65% / 30% | 1.4 | EST. 2025 cold: 16% met, 0 confirmed; vendor 1–3 per 100. |

| Segment (base) | Prospects | Deals | Avg ticket | Signed | Paid by T-14 | Cash by T-14 |
|---|---|---|---|---|---|---|
| A. Anchor title/co-title (fintech, UPI, banks; size factor 0.6, 3 slots) | 50 | 1.6 | ₹14L | ₹22.4L | 70% | ₹13.2L |
| B. Vertical titles: hackathon, nights, arena, summit (0.8, 6 slots) | 80 | 4.7 | ₹6L | ₹28.0L | 78% | ₹17.3L |
| C. Category partners (20 slots) | 80 | 12.0 | ₹2L | ₹24.1L | 85% | ₹15.3L |
| D. Long tail (40 slots, not binding) | 80 | 12.0 | ₹0.9L | ₹10.8L | 90% | ₹7.3L |
| E. Hybrid performance (guaranteed 50% fee only) | 30 | 1.4 | ₹2L | ₹2.8L | 85% | ₹1.0L |
| **Total** | **320** | **32** | **₹2.8L** | **₹88.1L** | | **₹54.1L** |

**Signed → cash:** `cash = signed × cash share (in-kind excluded) × guaranteed share × (1 − 10% slippage) × P(paid by T-14, by segment) × (1 − 2% TDS)`. Paid-by-T-14 differs by segment because anchors sign in weeks 6–9 and corporate DSO is 56–75 days (BENCH); policy is 50% on MoU, balance by T-21.
*Worked example, segment A:* 1.60 × ₹14L = ₹22.4L × 0.95 × 1.0 × 0.90 × 0.70 × 0.98 = **₹13.2L**.

**Capacity:** hours = prospects × outreach (warm 1.0 h, inbound 0.3 h, cold ABM 1.5 h) + meetings × 1.5 h + proposals × segment hours (A 8, B 4, C 2, D 1, E 3) + deals × segment hours (A 30, B 12, C 5, D 3, E 6). Base 913 of 1,080 h (6 sellers × 15 h × 12 weeks, vs 3 sellers in 2025); stretch 1,434 of 1,536 h (8 sellers × 16 h).

**Risk:**

| One change at a time | Cash by T-14 |
|---|---|
| Anchor and vertical tickets halved | ₹38.9L (−15.2) |
| No anchor signs | ₹41.0L (−13.2) |
| Warm intro→meeting 30% | ₹46.6L (−7.6) |
| Collections 10 pts slower | ₹47.3L (−6.8) |
| Only the 2025 team of 3 sellers | ₹32.0L (−22.1) |

Monte Carlo (5,000 draws; channel rates × U(0.75, 1.25), tickets × U(0.8, 1.2), collections ±8 pts, anchors Binomial(3)): **P10 ₹42.0L · P50 ₹54.0L · P90 ₹65.8L**. The stretch is not reachable with the base team (0% of draws) — it needs the extra sellers and higher conversion.

**Sanity checks:** anchors + verticals are 56% of base cash (Antaragni'11 actuals: top 6 deals = 54%). The stretch (₹1.79 Cr signed) would put the fest in flagship-IIT territory (Techfest raised ₹1.58 Cr in 2014), which is why it is a stretch, not a plan.

---

## 5. Slide 2: prioritisation framework

**Net cash per 100 seller-hours = (base cash contribution − test budget) ÷ hours attributed × 100.**
- Seller-hours are the binding constraint (85% utilisation), so ranking by cash per hour is the right lens.
- Hours come from the **same ledger as capacity**, attributed like cash: each segment's cash and hours belong to its product bet; warm-sourced lines are split 50/50 with the warm engine (door-opener, not closer). Contributions sum exactly to ₹54.1L.
- Base cash is already an expected value (conversion rates are probabilities), so there is **no second probability multiplier**; confidence (evidence strength) is shown separately.

| # | Bet | Base ₹ | Stretch ₹ | Hours | Budget (line items) | Net ₹/100h | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | Warm-network engine | 15.1L | 33.6L | 230 | ₹0.8L (alumni meetups 0.4, creator gifting 0.3, travel 0.1) | 6.23 | High — 2025 warm: 24/44 brands |
| 2 | Self-serve sponsor store + category bundles + early-pay **bonus inventory** | 18.4L | 43.7L | 306 | ₹1.0L (package page 0.3, CA + social push 0.5, collateral 0.2) | 5.71 | High — 2025 form: 7/17 |
| 3 | Unbundled vertical titles incl. employer-branding hackathon (HR budget) | 12.3L | 28.0L | 188 | ₹2.0L (hackathon prize seed 1.0, mock-ups 0.5, travel 0.5) | 5.49 | Medium — public precedents |
| 4 | Anchor title: fintech/UPI/bank "closed-loop UPI fest" | 7.6L | 19.5L | 134 | ₹1.5L (exec travel 0.6, UPI pilot 0.5, proposal design 0.4) | 4.59 | Low — long approvals |
| 5 | Hybrid performance (50% guaranteed + capped CPA bonus, DPDP consent) | 0.6L | 2.6L | 55 | ₹0.7L (tracking 0.3, consent flow 0.2, reporting 0.2) | −0.17 | Low — no data |

**Deliberate calls:** double down on bets 1–3 (₹45.8L of ₹54.1L). The anchor is a high-variance option with a kill switch (week 6 → co-title price; week 9 → release slots to verticals). Hybrid is a capped pilot: it loses money in the base case and scales only if two pilots sign with ≥ 60% guaranteed.
**Deprioritised:** mass cold email (0/91 brands), revival (0/20), cold LinkedIn (0/37) → account-based asks only. **Rejected:** pure CPA (cash after the fest), CSR pitches (MCA: event sponsorship is not CSR), govt/PSU grants (lead time), multi-fest consortium (next year), in-kind-only deals (no cash).

---

## 6. Slide 3: experiments and thresholds

Single source of truth: [`lib/plan.ts`](lib/plan.ts). Rule: **SCALE at ≥ 120% of the plan rate, STOP below 70% of plan, otherwise CHANGE; TOO EARLY below a minimum n.** The app's **live bet signals** ([`lib/bets.ts`](lib/bets.ts), Plan page, copilot tool `get_bet_signals`) apply these rules to measurable proxies in the live data (warm engine = SC02 + SC05, store = SC04); verticals/anchor/hybrid report *not measurable* until their deals are tagged.

| Bet | Leading indicator (plan) | Scale | Stop | Test (n per arm · read) |
|---|---|---|---|---|
| Warm engine | intros/week 12.7; intro→meeting 40% | ≥ 15.2/wk and ≥ 48% | < 8.9/wk or < 28% | ROI one-pager vs generic deck · 60 · detects +25 pts at 80% power · week 6 |
| Sponsor store | submits/week 8.2; submit→meeting 60% | ≥ 9.8/wk and ≥ 72% | < 5.7/wk or < 42% | Bonus for 100% upfront vs 50/50 terms · 36 · detects +30 pts · week 6 |
| Vertical titles | avg ask ₹6L; 2 live proposals/vertical by week 5 | ask ≥ ₹7.2L → open 2 more | ask < ₹4.2L or no proposal in 15 pitches | ₹7L vs ₹5L ask · 20 · directional only · week 7 |
| Anchor | anchors at proposal by week 6: 2 | 3 → escalate | 0 → release slots | Title vs co-title ask · 25 · directional · week 6 |
| Hybrid | guaranteed share 50% | ≥ 60% in 2 pilots | < 35% or pure CPA only | Pilot on 30 brands that refused a fixed fee · week 6 |

**Pacing gates** (from the model's signing schedule; miss = > 15% below plan): week 4 — 3 anchors in talks; week 6 — signed ₹46.2L (miss < ₹39.2L); week 9 — cash ₹18.8L (miss < ₹15.9L); T-21 — all balances invoiced; T-14 — cash ₹54.1L. Headline-artist spend scales only with cash already banked.

---

## 7. The Growth Center (product)

**Pages:** Overview (KPIs vs targets, weekly point-in-time trend, funnel, warm vs cold, alerts with *Ask copilot*) · Campaigns (funnel, verdict, weakest step; editable simulated budget/hours; outreach-owner vs deal-owner and industry views) · Pipeline (kanban with forecast weights; stage edits append versions) · Brands (drawer with contacts, opt-outs, qualification history — editable — timeline, opportunities, payments, activations) · Tasks (CRUD, owners, deadlines, overdue, copilot tag) · 2027 Plan (model, uncertainty, bets, thresholds, **live bet signals**, gates) · Data & Settings (target versions, simulated payments, audit log, confirmed reset).

**Architecture**
- `lib/metrics.ts` is the single metrics engine used by both the API routes and the copilot tools, so the copilot's numbers equal the UI's.
- **Forecast:** campaign-aware stage weights smoothed hierarchically (campaign → warm/cold group → all), stall decay, zero weight after event start. **Backtest:** projections on 15 Mar / 1 Apr land at 26.9 / 26.2 vs the actual 24; early dates under-forecast because a pipeline forecast cannot see deals not yet created.
- **Persistence:** Supabase Postgres, one `records` table of JSONB documents (`supabase/schema.sql`, RLS on, server-only service key). Source rows stored verbatim (incl. duplicates); history edits appended as versions; every write audited. Without Supabase env vars it falls back to a local JSON file for development.

**AI copilot** (`app/api/chat`, Gemini function calling, 18 tools in [`lib/copilot/tools.ts`](lib/copilot/tools.ts))
- Tools: `get_kpis`, `get_funnel`, `diagnose_campaigns`, `list_opportunities`, `get_brand`, `forecast` (what-if close/drop with applied/ignored ids, plus the backtest), `get_cash_collection`, `compare_dates`, `get_trend`, `get_targets`, `get_tasks`, `get_bet_signals`, `get_2027_plan`, `data_dictionary`, `query_records` (validated fields, day-aware date filters, numeric comparisons, group-by/aggregates), `calculate` (parser-based, no `eval`), `propose_task`, `propose_opportunity_update`.
- Grounding rules: every number from a tool call made in that turn; arithmetic only via `calculate`; evidence vs assumption separated; simulated data always labelled; invalid dates and unknown fields return errors instead of guesses; says when the data cannot answer (real cash, CAC, causal uplift, loss reasons).
- **Execution:** proposals are drafts; a **Confirm** click writes them, they appear in Tasks/Pipeline and the analytics refresh. Each answer has an expandable *Evidence* trace.

**Demo workflow:** "Why are we behind the 28-partnership target?" → diagnosis (cold channels, 26 stalled deals worth ₹14.4L, seller time skewed to cold) → recommendation (move hours to warm/inbound) → drafted tasks → **Confirm** → tasks appear, dashboard updates → follow-up "What if the negotiating deals close?" (forecast what-if) → "How much cash hit the bank?" (simulated; no bank data exists).

---

## 8. Setup

```bash
npm install
cp .env.example .env.local     # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
# Supabase: run supabase/schema.sql in the SQL editor; the app seeds itself on first load
npm run dev                    # http://localhost:3000
npm test                       # 37 unit/regression tests
npx tsx scripts/api-smoke.ts http://localhost:3000   # 18 API end-to-end checks
npx tsx scripts/eval-chat.ts http://localhost:3000   # copilot eval -> scripts/eval-results.md
python -I scripts/xlsx_to_seed.py                    # regenerate data/seed.json from the xlsx
python -I model/build_model.py                       # regenerate the model, workbook and data/model_output.json
```
> ⚠️ `api-smoke.ts` and `eval-chat.ts` **reset the target's data** (all edits and tasks are wiped). They refuse non-localhost URLs unless you pass `--allow-reset`.

**Deploy:** import the repo into Vercel, add the three environment variables, deploy.

---

## 9. Testing

- **Vitest (37 tests):** headline numbers pinned to an independent pandas analysis; dedup counts; as-of snapshots (15 Feb, 1 Mar, 15 Mar, 1 Apr); the Cobalt withdrawal; the 15 March target switch; forecast behaviour and backtest; calculator; query engine semantics (day-aware dates, numeric comparisons, unknown fields); as-of leakage in brand views and payments; owner registry (T03); bet signals; draft proposals never write.
- **API smoke (`scripts/api-smoke.ts`, 18 checks):** confirmed reset; stage edit → KPIs update on the effective date and not before; confirming a cash deal creates simulated invoices; 400s on bad stage, date, value, owner and task status; audit log; bet-signal endpoint; reset restores source state.
- **Copilot eval (`scripts/eval-chat.ts`, 26 graded cases):** factual, calculation, trend, diagnosis, follow-ups, changed data (edit a deal or target, then re-ask), unanswerable questions, execution (draft returned, nothing written). Results: [scripts/eval-results.md](scripts/eval-results.md).
- **Independent review:** a 4-lens adversarial review against the RISA rubric (quant, strategy, code, communication); its verified findings were fixed (hours ledger, double-counted risk, sensitivities, owner registry, date filters, as-of leakage, payments sync, validation, sourced city tiebreak).

---

## 10. Key assumptions (EST), ordered by impact on cash

| Assumption | Value | Why | Sensitivity |
|---|---|---|---|
| Team size | 6 sellers (2025: 3) | Base needs 913 h | 3 sellers → ₹32.0L |
| Anchor/vertical tickets | ₹14L / ₹6L | Public asking cards (IIT ISM, SIIB, Amity) | Halved → ₹38.9L |
| Anchor signs at all | 1.6 expected of 3 slots | 2024–26 title buyers are banks/UPI | None → ₹41.0L |
| Warm intro→meeting | 40% | Top of vendor range; 2025 = 82% | 30% → ₹46.6L |
| Paid by T-14 | 70–90% by segment | DSO 56–75 days; 50% advance policy | −10 pts → ₹47.3L |
| Prospect volumes | 140 warm intros, 90 inbound (2025: 27 warm, 17 inbound brands) | ~12.7 intros/week from alumni + creators + past sponsors | Tracked weekly by the live bet signal |
| Slippage | 10% | Vendor 10–25% | — |
| Size factor | A 0.6, B 0.8 | Big tickets need more approvals | — |

---

## 11. Tools used

| Tool (plan) | Used for | Reused / modified / verified |
|---|---|---|
| [Next.js 16](https://nextjs.org) App Router, React 19, [Tailwind 4](https://tailwindcss.com), [Recharts](https://recharts.org), [lucide-react](https://lucide.dev) | Web app | Scaffold from `create-next-app`; all pages, API routes and logic written for this project |
| [Supabase](https://supabase.com) (Free) | Postgres persistence | Own schema (`supabase/schema.sql`); verified by the API smoke test |
| [Google Gemini API](https://aistudio.google.com) via [`@google/genai`](https://www.npmjs.com/package/@google/genai) (free tier) | Copilot | Own tools, prompt and eval harness; verified by `eval-chat.ts` |
| [Vercel](https://vercel.com) (Hobby) | Hosting | — |
| Python ([pandas](https://pandas.pydata.org), [xlsxwriter](https://xlsxwriter.readthedocs.io)) | Data verification and the model | All numbers cross-checked against the TypeScript engine via pinned tests |
| [Playwright](https://playwright.dev), [python-pptx](https://python-pptx.readthedocs.io), [Canva](https://www.canva.com) (Pro) | Screenshots and the deck | Deck generated from `data/model_output.json`, so slide numbers equal the model |
| [Claude Code](https://claude.com/claude-code) (AI coding assistant) | Pair-programmed the build, ran the web research (each claim adversarially fact-checked; refuted claims dropped) and an adversarial rubric review | Every number and decision reviewed by me; research with URLs and confidence per claim in [research/fact_base.md](research/fact_base.md) |

---

## 12. Known limitations

- **The 2027 plan is a model.** 2025 rates rest on small samples (17–19 brands per warm channel), haircut toward vendor benchmarks that are mostly global B2B, not Indian fest sponsorship. Public fest prices are *asking* prices; no realised post-2015 deal values were found.
- **Simulated layers.** Budgets, hours and payments are simulated (deterministic, tagged); cash, CAC and ROI in the app are illustrative, and the copilot says so.
- **Bet signals** are measurable only for the warm engine and store (2025 proxies). Verticals, anchor and hybrid need deal tagging before they can be tracked live.
- **Forecast** covers the open pipeline only, so it under-forecasts early in a campaign (see the backtest).
- **Copilot** uses free-tier Gemini models (chain `gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.5-flash-lite`, overridable via `GEMINI_MODEL`). When the primary model is overloaded the route falls back down the chain and skips a busy model for 2 minutes, so answers can take 10–40 s; eval grading is regex-based, so spot-check `eval-results.md`.
- **Tasks** are an operational workspace and are not versioned by the as-of date (overdue is relative to it).
- **No authentication** (single-tenant demo). Reset requires an explicit confirmation; the cold-start seed runs only when the store is empty.
- **Activations** link to the separate attendee dataset, which is not loaded; the copilot declines causal claims.
