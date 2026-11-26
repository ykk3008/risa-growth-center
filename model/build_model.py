"""
CampusFest 2027 (Mumbai) — sponsorship cash model.

Single source of truth for the 3 slides, the README and the Growth Center projections.
Run:  python -I model/build_model.py
Outputs:
  model/sponsorship_model.xlsx   (live Excel formulas + cached values, inputs tagged by source)
  model/model_output.json        (numbers consumed by the app and the slide builder)

Source tags used on every input:
  DATA  = computed from the provided Sponsor Dataset (CampusFest 2025, deduplicated)
  BENCH = public benchmark (see research/fact_base.md for URLs)
  EST   = our estimate / assumption (explicitly labelled)
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import xlsxwriter

ROOT = Path(__file__).resolve().parents[1]  # growth-center/
DATA = ROOT / "data" / "source" / "Sponsor Dataset.xlsx"
OUT_XLSX = ROOT / "model" / "sponsorship_model.xlsx"
OUT_JSON = ROOT / "data" / "model_output.json"

WARM = ["Creator Network Referrals", "Warm Partner Introductions", "Partner Interest Form"]
COLD = ["Brand Discovery Email", "Brand Leader LinkedIn", "Past Conversation Revival"]


# --------------------------------------------------------------------------------------
# 1. Baseline from the dataset (deduplicated, end-state = latest version per entity)
# --------------------------------------------------------------------------------------
def baseline() -> dict:
    x = pd.ExcelFile(DATA)
    S = {s: x.parse(s) for s in x.sheet_names}
    I = S["Sponsor interactions"].drop_duplicates("interaction_id")
    Q = S["Brand qualification"].drop_duplicates("history_id")
    H = S["Opportunity history"].drop_duplicates("history_id")
    O = S["Partner opportunities"]
    raw_counts = {
        "interactions_raw": len(S["Sponsor interactions"]), "interactions": len(I),
        "qualification_raw": len(S["Brand qualification"]), "qualification": len(Q),
        "opp_history_raw": len(S["Opportunity history"]), "opp_history": len(H),
    }
    ql = Q.sort_values(["effective_at", "history_id"]).groupby("brand_id").tail(1)
    hl = (H.sort_values(["effective_at", "history_id"]).groupby("opportunity_id").tail(1)
            .merge(O[["opportunity_id", "originating_campaign_name", "support_type"]], on="opportunity_id"))
    rows = []
    for camp, g in I.groupby("campaign_name"):
        h = hl[hl.originating_campaign_name == camp]
        conf = h[h.stage == "partner_confirmed"]
        rows.append({
            "campaign": camp,
            "group": "warm/inbound" if camp in WARM else "cold",
            "brands": int(g.brand_id.nunique()),
            "attempts": int(g.attempt_id.nunique()),
            "replied_brands": int(g[g.event_type == "replied"].brand_id.nunique()),
            "meeting_brands": int(g[g.event_type == "meeting_held"].brand_id.nunique()),
            "qualified": int(((ql.source_campaign_name == camp) & (ql.qualification_status == "qualified")).sum()),
            "opps": int(len(h)),
            "confirmed": int(len(conf)),
            "confirmed_inr": int(conf.confirmed_value_inr.sum()),
            "open_pipeline_inr": int(h[h.stage.isin(["prospecting", "contacted", "proposal_sent", "negotiating"])].proposed_value_inr.sum()),
        })
    ch = pd.DataFrame(rows)
    conf = hl[hl.stage == "partner_confirmed"]
    first = H.groupby("opportunity_id").effective_at.min()
    conf_at = H[H.stage == "partner_confirmed"].groupby("opportunity_id").effective_at.min()
    cycle = (conf_at - first).dt.days

    def grp(name):
        g = ch[ch.group == name].sum(numeric_only=True)
        return {k: int(v) for k, v in g.items()}

    w, c = grp("warm/inbound"), grp("cold")
    return {
        "dedup": raw_counts,
        "channels": ch.to_dict("records"),
        "warm": w, "cold": c,
        "warm_meeting_rate": w["meeting_brands"] / w["brands"],
        "warm_opp_per_meeting": w["opps"] / w["meeting_brands"],
        "warm_close_rate_brand": w["confirmed"] / w["brands"],
        "cold_meeting_rate": c["meeting_brands"] / c["brands"],
        "cold_close_rate_brand": c["confirmed"] / c["brands"],
        "confirmed_deals": int(len(conf)),
        "confirmed_inr": int(conf.confirmed_value_inr.sum()),
        "confirmed_cash_inr": int(conf[conf.support_type == "cash"].confirmed_value_inr.sum()),
        "cash_share_value": float(conf[conf.support_type == "cash"].confirmed_value_inr.sum() / conf.confirmed_value_inr.sum()),
        "avg_deal_inr": float(conf.confirmed_value_inr.mean()),
        "median_cycle_days": float(cycle.median()),
        "qualified_brands": int((ql.qualification_status == "qualified").sum()),
        "targets": {"qualified": 55, "confirmed": 28},
    }


# --------------------------------------------------------------------------------------
# 2. Forward model inputs (base / stretch), every one tagged DATA / BENCH / EST
# --------------------------------------------------------------------------------------
# Channel stage rates: prospect->meeting, meeting->proposal, proposal->signed (MoU)
CHANNELS = {
    "Warm intro": ((0.40, 0.70, 0.40), (0.50, 0.75, 0.50),
                   "EST anchored on DATA + BENCH. DATA 2025 warm: 36/44 brands met (82%), 24/44 confirmed - small sample, so haircut. "
                   "BENCH warm intro->meeting 25-40% (vendor, low confidence) - base capped at the top of that range; proposal win 34% (Proposify). "
                   "Result 11.2 signed per 100 prospects (base) vs vendor range 10-20."),
    "Inbound / sponsor store": ((0.60, 0.70, 0.45), (0.70, 0.75, 0.55),
                   "EST anchored on DATA: 2025 partner form 13/17 met (76%), 7/17 confirmed (41%); haircut for a larger, less self-selected inbound pool."),
    "Cold ABM (anchors only)": ((0.12, 0.60, 0.20), (0.18, 0.65, 0.30),
                   "EST: DATA cold 2025 = 24/148 brands met (16%), 0 confirmed. BENCH 1-3 signed per 100 cold prospects (vendor). "
                   "Used only as personalised multi-touch outreach to anchor/vertical accounts."),
}
HRS_PROSPECT = {"Warm intro": 1.0, "Inbound / sponsor store": 0.3, "Cold ABM (anchors only)": 1.5}
HRS_MEETING = 1.5

SEGMENTS = [
    {"key": "A", "name": "A. Anchor (title / co-title / associate)", "bet": "anchor", "deal": (14.0, 15.3), "slots": (3, 3), "size_factor": 0.6,
     "prospects": ({"Warm intro": 20, "Cold ABM (anchors only)": 30}, {"Warm intro": 25, "Cold ABM (anchors only)": 40}),
     "cash_share": (0.95, 0.95), "guaranteed": (1.0, 1.0), "paid": (0.70, 0.78), "hrs_proposal": 8, "hrs_deal": 30,
     "tag": "EST ticket: title ~Rs20L, co-title/associate Rs10-13L, avg Rs14L. BENCH public asking cards: IIT ISM title Rs15L (2020), Amity UNIFEST Rs20-40L. "
            "Size factor 0.6 (EST): big tickets need more approvals. Prospects 50 (EST) = the fintech/UPI/bank/consumer-tech marketing heads reachable in Mumbai. "
            "Paid by T-14 0.70 (EST): anchors sign weeks 7-9 and corporate DSO is 56-75 days (BENCH), so the 50% advance lands but some balances slip."},
    {"key": "B", "name": "B. Unbundled vertical titles (hackathon, nights, arena, summit)", "bet": "verticals", "deal": (6.0, 6.5), "slots": (6, 8), "size_factor": 0.8,
     "prospects": ({"Warm intro": 30, "Inbound / sponsor store": 10, "Cold ABM (anchors only)": 40}, {"Warm intro": 35, "Inbound / sponsor store": 15, "Cold ABM (anchors only)": 50}),
     "cash_share": (0.90, 0.92), "guaranteed": (1.0, 1.0), "paid": (0.78, 0.85), "hrs_proposal": 4, "hrs_deal": 12,
     "tag": "BENCH SIIB Ignisense cultural night Rs5L priced above its Rs4L title; Mood Indigo sold 10 night/competition titles; IIT ISM Gold Rs9L / Silver Rs6L. "
            "EST avg Rs6L, 6 slots (2 pro-nights, hackathon, esports arena, summit, fashion night). Size factor 0.8 (EST)."},
    {"key": "C", "name": "C. Category partners (fintech app, beverage, mobility, devices, edtech)", "bet": "store", "deal": (2.0, 2.2), "slots": (20, 22), "size_factor": 1.0,
     "prospects": ({"Warm intro": 40, "Inbound / sponsor store": 40}, {"Warm intro": 45, "Inbound / sponsor store": 50}),
     "cash_share": (0.85, 0.88), "guaranteed": (1.0, 1.0), "paid": (0.85, 0.90), "hrs_proposal": 2, "hrs_deal": 5,
     "tag": "BENCH IIT ISM category sponsors Rs0.5-3L, IIEST title Rs1.35L. EST avg Rs2L. DATA cash share 89% of 2025 value (in-kind excluded)."},
    {"key": "D", "name": "D. Long tail (stalls, small D2C, local brands)", "bet": "store", "deal": (0.9, 1.0), "slots": (40, 40), "size_factor": 1.0,
     "prospects": ({"Warm intro": 40, "Inbound / sponsor store": 40}, {"Warm intro": 50, "Inbound / sponsor store": 50}),
     "cash_share": (0.85, 0.88), "guaranteed": (1.0, 1.0), "paid": (0.90, 0.93), "hrs_proposal": 1, "hrs_deal": 3,
     "tag": "DATA 2025 confirmed avg Rs0.93L (Rs35K-2L); BENCH Antaragni'11 median deal Rs49K. Small tickets pay upfront more often (EST paid 0.90)."},
    {"key": "E", "name": "E. Hybrid performance packages (guaranteed fee only)", "bet": "hybrid", "deal": (2.0, 2.2), "slots": (6, 10), "size_factor": 1.0,
     "prospects": ({"Warm intro": 10, "Cold ABM (anchors only)": 20}, {"Warm intro": 15, "Cold ABM (anchors only)": 30}),
     "cash_share": (0.95, 0.95), "guaranteed": (0.5, 0.6), "paid": (0.85, 0.90), "hrs_proposal": 3, "hrs_deal": 6,
     "tag": "Incremental brands that refuse fixed fees (quick-commerce, AI tools, D2C performance teams). Only the GUARANTEED share (50%) counts as T-14 cash; "
            "the CPA bonus is paid after the fest and excluded. BENCH college CPL Rs180-900, Blinkit sampling Rs9/unit (vendor)."},
]

CASH = {
    "slippage": ((0.10, 0.05), "BENCH/EST 10-25% of verbally confirmed value never becomes MoU/payment (vendor, low confidence); MoU-first process keeps it at the low end."),
    "tds": ((0.02, 0.02), "BENCH s.194C / s.393(1): 2% TDS on sponsorship (advertising contract) for non-individual payees; GST is pass-through."),
}
CAPACITY = {"team": (6, 8), "hours_per_week": (15, 16), "weeks": 12, "team_2025": 3,
            "tag": "EST: 2025 had 3 deal owners. Base adds 3 sellers (6 x 15 h/week), stretch 8 x 16 h/week; 12 weeks from 26 Nov 2026 to T-14 (20 Feb 2027). "
                   "Hours = prospects x outreach h (warm 1.0, inbound 0.3, cold ABM 1.5) + meetings x 1.5 h + proposals x segment h + signed deals x segment h (all EST; 2025 median cycle 10 days)."}
FEST = {"name": "CampusFest 2027", "city": "Mumbai", "dates": "6-7 March 2027", "t14": "2027-02-20", "start": "2026-11-26"}

BETS = [
    {"key": "store", "bet": "Self-serve sponsor store + category bundles + early-pay bonus inventory", "segments": "C-D", "confidence": "High",
     "evidence": "2025 inbound form 7/17 brands confirmed", "cost_items": {"Package page + payment links": 0.3, "Campus ambassador + social push": 0.5, "Collateral": 0.2},
     "owner": "1 seller + 1 web dev", "timeline": "Live week 2, promote weeks 2-11"},
    {"key": "warm", "bet": "Warm-network engine (alumni, past sponsors, creators, community)", "segments": "Door-opener for A-E", "confidence": "High",
     "evidence": "2025 warm channels: 24/44 brands, 100% of value", "cost_items": {"Alumni meetups": 0.4, "Creator gifting": 0.3, "Travel": 0.1},
     "owner": "1 seller + alumni cell", "timeline": "Weeks 0-12, always on"},
    {"key": "verticals", "bet": "Unbundled vertical titles incl. employer-branding hackathon (HR wallet)", "segments": "B", "confidence": "Medium",
     "evidence": "Public precedents (Mood Indigo, Techfest, Ignisense); not in 2025 data", "cost_items": {"Hackathon prize seed": 1.0, "Mock-ups and decks": 0.5, "Travel": 0.5},
     "owner": "2 sellers", "timeline": "Weeks 1-10"},
    {"key": "anchor", "bet": "Anchor title: fintech/UPI/bank 'closed-loop UPI fest'", "segments": "A", "confidence": "Low",
     "evidence": "2024-26 title sponsors are fintech/UPI/banks; long approval chains", "cost_items": {"Exec pitch travel": 0.6, "UPI pilot integration": 0.5, "Custom proposal design": 0.4},
     "owner": "Sponsorship head + 1", "timeline": "Pitch by week 3, MoU by week 9"},
    {"key": "hybrid", "bet": "Hybrid performance packages (50% guaranteed + capped CPA bonus)", "segments": "E", "confidence": "Low",
     "evidence": "No 2025 data; CPA pricing benchmarks are vendor-reported", "cost_items": {"Tracking links / MMP setup": 0.3, "DPDP consent flow": 0.2, "Reporting": 0.2},
     "owner": "1 seller + data lead", "timeline": "Pilot weeks 3-6, scale weeks 7-11"},
]


def run_scenario(idx: int, ov: dict | None = None) -> dict:
    """ov overrides for sensitivities: {'ticket_mult': {seg: x}, 'drop_segments': [..], 'warm_meet': x, 'paid_delta': x, 'hours_cap': h}"""
    ov = ov or {}
    segs, hours_by_bet = [], {b["key"]: 0.0 for b in BETS}
    tot_val = tot_cash = tot_deals = hours = 0.0
    slip, tds = CASH["slippage"][0][idx], CASH["tds"][0][idx]
    for s in SEGMENTS:
        lines, raw = [], 0.0
        for ch, n in s["prospects"][idx].items():
            m, p, g = CHANNELS[ch][idx]
            if ch == "Warm intro" and "warm_meet" in ov:
                m = ov["warm_meet"]
            signed = n * m * p * g * s["size_factor"]
            if s["key"] in ov.get("drop_segments", []):
                signed = 0.0
            raw += signed
            lines.append({"channel": ch, "prospects": n, "meetings": n * m, "proposals": n * m * p, "signed": signed})
        deals = min(raw, s["slots"][idx])
        scale = deals / raw if raw else 0
        ticket = s["deal"][idx] * ov.get("ticket_mult", {}).get(s["key"], 1.0)
        val = deals * ticket
        paid = min(0.98, max(0.0, s["paid"][idx] + ov.get("paid_delta", 0.0)))
        cash = val * s["cash_share"][idx] * s["guaranteed"][idx] * (1 - slip) * paid * (1 - tds)
        # hours ledger per line, attributed like cash: warm lines split 50/50 between the warm engine and the product bet
        seg_hours = 0.0
        for l in lines:
            h = (l["prospects"] * HRS_PROSPECT[l["channel"]] + l["meetings"] * HRS_MEETING + l["proposals"] * s["hrs_proposal"]
                 + l["signed"] * scale * s["hrs_deal"])
            l["hours"] = h
            seg_hours += h
            if l["channel"] == "Warm intro":
                hours_by_bet["warm"] += h * 0.5; hours_by_bet[s["bet"]] += h * 0.5
            else:
                hours_by_bet[s["bet"]] += h
        hours += seg_hours
        warm_signed = sum(l["signed"] for l in lines if l["channel"] == "Warm intro")
        segs.append({"segment": s["name"], "key": s["key"], "bet": s["bet"], "lines": lines, "uncapped_deals": raw, "deals": deals,
                     "slots": s["slots"][idx], "avg_deal_lakh": ticket, "signed_value_lakh": val, "cash_by_T14_lakh": cash,
                     "paid_by_T14": paid, "hours": seg_hours, "warm_share": (warm_signed / raw) if raw else 0.0})
        tot_val += val; tot_cash += cash; tot_deals += deals
    cap = CAPACITY["team"][idx] * CAPACITY["hours_per_week"][idx] * CAPACITY["weeks"]
    if "hours_cap" in ov and hours > ov["hours_cap"]:
        k = ov["hours_cap"] / hours
        tot_cash *= k; tot_val *= k; tot_deals *= k
    return {"segments": segs, "deals": tot_deals, "signed_value_lakh": tot_val, "cash_by_T14_lakh": tot_cash,
            "prospects": sum(sum(s["prospects"][idx].values()) for s in SEGMENTS),
            "hours_needed": hours, "hours_available": cap, "utilisation": hours / cap, "hours_by_bet": hours_by_bet}


def attribute(res: dict) -> dict:
    """Cash by bet: each segment's cash belongs to its product bet; the warm engine is credited 50% of the warm-sourced share."""
    out = {b["key"]: 0.0 for b in BETS}
    for s in res["segments"]:
        out["warm"] += s["cash_by_T14_lakh"] * s["warm_share"] * 0.5
        out[s["bet"]] += s["cash_by_T14_lakh"] * (1 - s["warm_share"] * 0.5)
    return out


def rank_bets(base: dict, stretch: dict) -> None:
    """Framework: seller-hours are the binding constraint. Rank by NET expected cash per 100 seller-hours
    = (base cash contribution - test budget) / hours attributed x 100. Base cash is already an expected value
    (conversion rates are probabilities), so no second probability multiplier; confidence is shown separately."""
    cb, cs = attribute(base), attribute(stretch)
    for b in BETS:
        b["cost_lakh"] = round(sum(b["cost_items"].values()), 2)
        b["cash_lakh"] = round(cb[b["key"]], 1)
        b["stretch_cash_lakh"] = round(cs[b["key"]], 1)
        b["stretch_uplift_lakh"] = round(cs[b["key"]] - cb[b["key"]], 1)
        b["effort_h"] = round(base["hours_by_bet"][b["key"]])
        b["ev_per_100h"] = round((cb[b["key"]] - b["cost_lakh"]) / base["hours_by_bet"][b["key"]] * 100, 2)
    BETS.sort(key=lambda b: -b["ev_per_100h"])
    for i, b in enumerate(BETS, 1):
        b["rank"] = i


def sensitivities(base_cash: float) -> list[dict]:
    hours_2025 = CAPACITY["team_2025"] * CAPACITY["hours_per_week"][0] * CAPACITY["weeks"]
    cases = [
        ("Anchor and vertical tickets halved", {"ticket_mult": {"A": 0.5, "B": 0.5}}),
        ("No anchor signs", {"drop_segments": ["A"]}),
        ("Warm intro to meeting 30% instead of 40%", {"warm_meet": 0.30}),
        ("Collections 10 points slower", {"paid_delta": -0.10}),
        ("Only the 2025 team of 3 sellers", {"hours_cap": hours_2025}),
    ]
    out = []
    for name, ov in cases:
        c = run_scenario(0, ov)["cash_by_T14_lakh"]
        out.append({"case": name, "cash_lakh": round(c, 1), "delta_lakh": round(c - base_cash, 1)})
    return out


def monte_carlo(n: int = 5000, seed: int = 7) -> dict:
    """Uncertainty band (EST): channel rates x U(0.75,1.25), segment tickets x U(0.8,1.2), collections +/-0.08,
    anchor deals ~ Binomial(3, base mean/3). Same structure as the base case."""
    import random
    rnd = random.Random(seed)
    base = run_scenario(0)
    a_mean = next(s for s in base["segments"] if s["key"] == "A")["deals"]
    sims = []
    for _ in range(n):
        cm = {ch: rnd.uniform(0.75, 1.25) for ch in CHANNELS}
        tot = 0.0
        for s in SEGMENTS:
            raw = sum(n_ * CHANNELS[ch][0][0] * CHANNELS[ch][0][1] * CHANNELS[ch][0][2] * cm[ch] * s["size_factor"] for ch, n_ in s["prospects"][0].items())
            deals = min(raw, s["slots"][0])
            if s["key"] == "A":
                deals = sum(1 for _ in range(3) if rnd.random() < min(1.0, a_mean / 3 * (cm["Warm intro"] + cm["Cold ABM (anchors only)"]) / 2))
            ticket = s["deal"][0] * rnd.uniform(0.8, 1.2)
            paid = min(0.98, max(0.3, s["paid"][0] + rnd.uniform(-0.08, 0.08)))
            tot += deals * ticket * s["cash_share"][0] * s["guaranteed"][0] * (1 - CASH["slippage"][0][0]) * paid * (1 - CASH["tds"][0][0])
        sims.append(tot)
    sims.sort()
    q = lambda p: round(sims[int(p * (n - 1))], 1)
    st = run_scenario(1)["cash_by_T14_lakh"]
    return {"p10": q(0.10), "p50": q(0.50), "p90": q(0.90), "mean": round(sum(sims) / n, 1),
            "p_at_least_base": round(sum(1 for x in sims if x >= base["cash_by_T14_lakh"]) / n, 2),
            "p_at_least_stretch_with_base_team": round(sum(1 for x in sims if x >= st) / n, 3),
            "method": "5,000 draws: channel rates x U(0.75,1.25), tickets x U(0.8,1.2), collections +/-8 pts, anchors Binomial(3). Base team only (EST)."}


SIGN_WEEKS = {"D": range(1, 9), "C": range(2, 10), "E": range(4, 10), "B": range(3, 10), "A": range(6, 10)}


def gates(res: dict) -> dict:
    """Pacing gates derived from the plan (EST signing schedule). Miss = more than 15% below plan."""
    def signed_by(week):
        return sum(s["signed_value_lakh"] * sum(1 for w in SIGN_WEEKS[s["key"]] if w <= week) / len(SIGN_WEEKS[s["key"]]) for s in res["segments"])
    curve = weekly_cash_curve(res)
    w6 = signed_by(6)
    return {"week6_signed_plan_lakh": round(w6, 1), "week6_signed_gate_lakh": round(w6 * 0.85, 1), "week6_signed_share": round(w6 / res["signed_value_lakh"], 2),
            "week9_cash_plan_lakh": curve[8], "week9_cash_gate_lakh": round(curve[8] * 0.85, 1),
            "t14_cash_plan_lakh": curve[-1], "tolerance": 0.15}


def weekly_cash_curve(res: dict, weeks: int = 12) -> list[float]:
    """Cumulative cash by week (EST shape). Signing weeks by segment; 50% advance ~1 week after MoU; balances chased from week 9 to T-21."""
    sign_weeks = SIGN_WEEKS
    flows = [0.0] * weeks
    for s in res["segments"]:
        ws = list(sign_weeks[s["key"]])
        per = s["cash_by_T14_lakh"] / len(ws)
        for w in ws:
            flows[min(weeks - 1, w + 1)] += per * 0.5          # advance
            flows[min(weeks - 1, max(w + 3, 9))] += per * 0.5  # balance
    out, cum = [], 0.0
    for f in flows:
        cum += f
        out.append(round(cum, 2))
    return out


# --------------------------------------------------------------------------------------
# 3. Excel writer (live formulas for the funnel and cash; capacity/attribution computed by this script)
# --------------------------------------------------------------------------------------
def write_xlsx(bl: dict, base: dict, stretch: dict, sens: list, mc: dict, sq: float) -> None:
    wb = xlsxwriter.Workbook(OUT_XLSX)
    H = wb.add_format({"bold": True, "bg_color": "#1F3A5F", "font_color": "white", "text_wrap": True, "valign": "top"})
    B = wb.add_format({"bold": True}); W = wb.add_format({"text_wrap": True, "valign": "top"})
    P = wb.add_format({"num_format": "0%"}); N1 = wb.add_format({"num_format": "0.0"}); N2 = wb.add_format({"num_format": "0.00"})
    INR = wb.add_format({"num_format": "#,##0"}); INP = wb.add_format({"bg_color": "#FFF4CC", "num_format": "0.00"})
    TITLE = wb.add_format({"bold": True, "font_size": 14})

    ws = wb.add_worksheet("README"); ws.set_column(0, 0, 130)
    for r, (t, f) in enumerate([
        ("CampusFest 2027 (Mumbai) - Sponsorship cash model", TITLE),
        ("North-star metric: sponsorship CASH in bank by T-14 (20 Feb 2027), net of 2% TDS. Confirmed value is not cash.", B),
        ("Yellow cells on 'Model' are inputs: funnel, segment value and cash totals recalculate with live formulas.", None),
        ("Capacity, bet attribution, sensitivities and the Monte Carlo band are computed by build_model.py (re-run it after changing inputs there).", None),
        ("Tags: DATA = provided Sponsor Dataset (deduplicated); BENCH = public benchmark (URLs in research/fact_base.md); EST = labelled estimate.", None),
        ("signed = prospects x P(meeting) x P(proposal|meeting) x P(MoU|proposal) x size factor, capped by inventory slots", None),
        ("cash by T-14 = signed value x cash share x guaranteed share x (1 - slippage) x P(paid by T-14, by segment) x (1 - TDS)", None),
    ]):
        ws.write(r, 0, t, f)

    ws = wb.add_worksheet("Baseline_2025 (DATA)")
    cols = ["campaign", "group", "brands", "attempts", "replied_brands", "meeting_brands", "qualified", "opps", "confirmed", "confirmed_inr", "open_pipeline_inr"]
    ws.set_column(0, 0, 30); ws.set_column(1, 10, 14)
    for c, k in enumerate(cols):
        ws.write(0, c, k, H)
    for r, row in enumerate(bl["channels"], start=1):
        for c, k in enumerate(cols):
            ws.write(r, c, row[k], INR if k.endswith("inr") else None)

    ws = wb.add_worksheet("Model")
    ws.set_column(0, 0, 52); ws.set_column(1, 1, 26); ws.set_column(2, 13, 11); ws.set_column(14, 14, 100)
    for c, h in enumerate(["Segment", "Channel", "Scenario", "Prospects", "P(meet)", "P(prop)", "P(MoU)", "Size factor", "Meetings", "Proposals", "Signed (uncapped)", "Hours", "", "", "Source / rationale"]):
        ws.write(0, c, h, H)
    row, seg_rows, res = 1, [], {0: base, 1: stretch}
    for s in SEGMENTS:
        for idx, scen in ((0, "Base"), (1, "Stretch")):
            first = row
            segr = next(x for x in res[idx]["segments"] if x["key"] == s["key"])
            for (ch, n), ln in zip(s["prospects"][idx].items(), segr["lines"]):
                m, p, g = CHANNELS[ch][idx]
                r1 = row + 1
                ws.write(row, 0, s["name"]); ws.write(row, 1, ch); ws.write(row, 2, scen)
                for c, v in zip(range(3, 8), (n, m, p, g, s["size_factor"])):
                    ws.write_number(row, c, v, INP)
                ws.write_formula(row, 8, f"=D{r1}*E{r1}", N1, n * m)
                ws.write_formula(row, 9, f"=I{r1}*F{r1}", N1, n * m * p)
                ws.write_formula(row, 10, f"=J{r1}*G{r1}*H{r1}", N2, n * m * p * g * s["size_factor"])
                ws.write_number(row, 11, round(ln["hours"], 1), N1)
                ws.write(row, 14, CHANNELS[ch][2] + " | prospects: " + ("EST, see segment tag" if True else ""), W)
                row += 1
            seg_rows.append((s, idx, first, row - 1))
        row += 1
    row += 1
    ws.write(row, 0, "Segment summary", TITLE); row += 1
    for c, h in enumerate(["Segment", "Scenario", "Signed (uncapped)", "Slots", "Deals", "Avg deal (Rs L)", "Signed value (Rs L)", "Cash share",
                           "Guaranteed share", "Slippage", "P(paid by T-14)", "TDS", "Cash by T-14 (Rs L)", "", "Source / rationale"]):
        ws.write(row, c, h, H)
    row += 1
    sum_rows = {0: [], 1: []}
    for s, idx, a, b in seg_rows:
        r1 = row + 1
        seg = next(x for x in res[idx]["segments"] if x["key"] == s["key"])
        ws.write(row, 0, s["name"]); ws.write(row, 1, "Base" if idx == 0 else "Stretch")
        ws.write_formula(row, 2, f"=SUM(K{a+1}:K{b+1})", N2, seg["uncapped_deals"])
        ws.write_number(row, 3, s["slots"][idx], INP)
        ws.write_formula(row, 4, f"=MIN(C{r1},D{r1})", N1, seg["deals"])
        ws.write_number(row, 5, s["deal"][idx], INP)
        ws.write_formula(row, 6, f"=E{r1}*F{r1}", N1, seg["signed_value_lakh"])
        for c, v in zip(range(7, 12), (s["cash_share"][idx], s["guaranteed"][idx], CASH["slippage"][0][idx], s["paid"][idx], CASH["tds"][0][idx])):
            ws.write_number(row, c, v, INP)
        ws.write_formula(row, 12, f"=G{r1}*H{r1}*I{r1}*(1-J{r1})*K{r1}*(1-L{r1})", N1, seg["cash_by_T14_lakh"])
        ws.write(row, 14, s["tag"], W)
        sum_rows[idx].append(r1); row += 1
    row += 1
    for idx, scen in ((0, "BASE"), (1, "STRETCH")):
        rs = sum_rows[idx]
        ws.write(row, 0, f"TOTAL {scen}", B)
        ws.write_formula(row, 4, "=" + "+".join(f"E{x}" for x in rs), N1, res[idx]["deals"])
        ws.write_formula(row, 6, "=" + "+".join(f"G{x}" for x in rs), N1, res[idx]["signed_value_lakh"])
        ws.write_formula(row, 12, "=" + "+".join(f"M{x}" for x in rs), N1, res[idx]["cash_by_T14_lakh"])
        row += 1
    ws.write(row + 1, 0, f"Status-quo replay (2025 cash-type Rs{bl['confirmed_cash_inr']/1e5:.1f}L x (1-10% slippage) x 80% paid x 98%) = Rs{sq:.1f}L", B)

    ws = wb.add_worksheet("Capacity")
    ws.set_column(0, 0, 46); ws.set_column(1, 3, 16)
    ws.write_row(0, 0, ["", "Base", "Stretch"], H)
    ws.write_row(1, 0, ["Hours needed (outreach + meetings + proposals + deals)", round(base["hours_needed"]), round(stretch["hours_needed"])])
    ws.write_row(2, 0, ["Hours available", base["hours_available"], stretch["hours_available"]])
    ws.write(3, 0, "Utilisation"); ws.write_formula(3, 1, "=B2/B3", P, base["utilisation"]); ws.write_formula(3, 2, "=C2/C3", P, stretch["utilisation"])
    ws.write(5, 0, CAPACITY["tag"], W)
    for i, (k, v) in enumerate(base["hours_by_bet"].items()):
        ws.write_row(7 + i, 0, [f"Base hours attributed to bet '{k}'", round(v)])

    ws = wb.add_worksheet("Risk")
    ws.set_column(0, 0, 50); ws.set_column(1, 2, 16)
    ws.write_row(0, 0, ["Sensitivity (base case, one change at a time)", "Cash by T-14 (Rs L)", "Change vs base"], H)
    for i, x in enumerate(sens, 1):
        ws.write_row(i, 0, [x["case"], x["cash_lakh"], x["delta_lakh"]])
    r = len(sens) + 3
    ws.write(r, 0, "Monte Carlo band (base team)", B)
    for i, k in enumerate(["p10", "p50", "p90", "mean", "p_at_least_base", "p_at_least_stretch_with_base_team"]):
        ws.write_row(r + 1 + i, 0, [k, mc[k]])
    ws.write(r + 8, 0, mc["method"], W)

    ws = wb.add_worksheet("Cash_curve")
    ws.write_row(0, 0, ["Week (from 26 Nov 2026)", "Cumulative cash base (Rs L)", "Cumulative cash stretch (Rs L)"], H)
    cb, cs = weekly_cash_curve(base), weekly_cash_curve(stretch)
    for w in range(12):
        ws.write_row(w + 1, 0, [w + 1, cb[w], cs[w]])

    ws = wb.add_worksheet("Bets_EV")
    hdr = ["Rank", "Bet", "Segments", "Base cash (Rs L)", "Stretch cash (Rs L)", "Test budget (Rs L)", "Hours (attributed)", "Net cash per 100 h (Rs L)", "Confidence", "Evidence", "Owner", "Timeline", "Budget line items"]
    ws.set_column(1, 1, 60); ws.set_column(9, 12, 40)
    for c, h in enumerate(hdr):
        ws.write(0, c, h, H)
    for r, b in enumerate(BETS, start=1):
        ws.write_row(r, 0, [b["rank"], b["bet"], b["segments"], b["cash_lakh"], b["stretch_cash_lakh"], b["cost_lakh"], b["effort_h"]])
        ws.write_formula(r, 7, f"=(D{r+1}-F{r+1})/G{r+1}*100", N2, b["ev_per_100h"])
        ws.write_row(r, 8, [b["confidence"], b["evidence"], b["owner"], b["timeline"], "; ".join(f"{k} Rs{v}L" for k, v in b["cost_items"].items())])
    wb.close()


def main() -> None:
    bl = baseline()
    base, stretch = run_scenario(0), run_scenario(1)
    rank_bets(base, stretch)
    sq = bl["confirmed_cash_inr"] / 1e5 * (1 - CASH["slippage"][0][0]) * 0.80 * (1 - CASH["tds"][0][0])
    sens = sensitivities(base["cash_by_T14_lakh"])
    mc = monte_carlo()
    avg_ticket = base["signed_value_lakh"] / base["deals"]
    out = {
        "fest": FEST, "baseline_2025": bl,
        "status_quo_cash_by_T14_lakh": round(sq, 1),
        "base": base, "stretch": stretch,
        "uplift": {"multiple": round(base["cash_by_T14_lakh"] / sq, 2), "deals_ratio": round(base["deals"] / bl["confirmed_deals"], 2),
                   "avg_signed_ticket_lakh": round(avg_ticket, 2), "ticket_ratio": round(avg_ticket / (bl["avg_deal_inr"] / 1e5), 2),
                   "prospects_2025_warm_inbound": bl["warm"]["brands"], "team_2025": CAPACITY["team_2025"]},
        "sensitivities": sens, "monte_carlo": mc, "gates": gates(base),
        "cash_curve": {"base": weekly_cash_curve(base), "stretch": weekly_cash_curve(stretch)},
        "channels": {k: {"base": v[0], "stretch": v[1], "rationale": v[2]} for k, v in CHANNELS.items()},
        "segments_meta": [{k: s[k] for k in ("key", "name", "bet", "deal", "slots", "size_factor", "paid", "guaranteed", "tag")} for s in SEGMENTS],
        "cash_factors": {k: {"base": v[0][0], "stretch": v[0][1], "rationale": v[1]} for k, v in CASH.items()},
        "capacity": CAPACITY, "bets": BETS,
    }
    OUT_JSON.write_text(json.dumps(out, indent=2, default=float), encoding="utf-8")
    write_xlsx(bl, base, stretch, sens, mc, sq)
    for name, r in (("BASE", base), ("STRETCH", stretch)):
        print(f"{name}: prospects {r['prospects']}, deals {r['deals']:.1f}, signed Rs{r['signed_value_lakh']:.1f}L, cash Rs{r['cash_by_T14_lakh']:.1f}L, "
              f"hours {r['hours_needed']:.0f}/{r['hours_available']} ({r['utilisation']:.0%})")
        for s in r["segments"]:
            print(f"   {s['key']} deals {s['deals']:5.2f}/{s['slots']} signed Rs{s['signed_value_lakh']:5.1f}L cash Rs{s['cash_by_T14_lakh']:5.1f}L hours {s['hours']:.0f} warm {s['warm_share']:.0%}")
    print("status quo", round(sq, 1), "uplift", out["uplift"])
    for b in BETS:
        print(b["rank"], b["key"], "base", b["cash_lakh"], "stretch", b["stretch_cash_lakh"], "+", b["stretch_uplift_lakh"], "h", b["effort_h"], "cost", b["cost_lakh"], "EV", b["ev_per_100h"])
    print("gates", out["gates"]); print("sens", sens); print("mc", mc); print("curve", out["cash_curve"]["base"])


if __name__ == "__main__":
    main()
