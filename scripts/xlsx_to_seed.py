"""Convert the provided Sponsor Dataset.xlsx into data/seed.json VERBATIM (duplicates kept on purpose —
the app's metrics layer must deduplicate import retries itself, exactly like it would with a real feed).

Also appends clearly-flagged SIMULATED operational tables that the source data does not contain:
  campaign_plan (budget/hours per acquisition campaign), payments (invoice/receipt per confirmed cash deal),
  tasks (a handful of starter tasks). Every simulated row carries is_simulated = true.

Run from growth-center/:  python -I scripts/xlsx_to_seed.py
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import timedelta
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parents[1]
SRC = HERE / "data" / "source" / "Sponsor Dataset.xlsx"
OUT = HERE / "data" / "seed.json"

SHEETS = {
    "Read me": "readme", "Field guide": "field_guide", "Event": "event", "Targets": "targets", "Brands": "brands",
    "Sponsor contacts": "contacts", "Sponsor campaigns": "campaigns", "Sponsor interactions": "interactions",
    "Brand qualification": "qualification", "Partner opportunities": "opportunities",
    "Opportunity history": "opp_history", "Sponsor activations": "activations",
}


def iso(v):
    if isinstance(v, pd.Timestamp):
        return v.strftime("%Y-%m-%dT%H:%M:%S") + "+05:30"
    return v


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, pd.Timestamp):
        return iso(v)
    if hasattr(v, "item"):
        return v.item()
    return v


def h(s: str) -> float:
    """Deterministic pseudo-random in [0,1) from a string (stable simulated data)."""
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def main() -> None:
    x = pd.ExcelFile(SRC)
    db: dict[str, list] = {}
    for sheet, name in SHEETS.items():
        df = x.parse(sheet)
        db[name] = [{k: clean(v) for k, v in row.items()} for row in df.to_dict("records")]
    # readme text contains a non-UTF8 dash in source; normalise
    for r in db["readme"]:
        r["description"] = (r["description"] or "").replace("�", "-")

    # ---------------- SIMULATED: campaign plan (budget + seller hours) ----------------
    plan = {
        "SC01": (40000, 180, "Email tool + list data; 1 owner ~15h/wk"),
        "SC02": (10000, 60, "Alumni/partner intro coordination"),
        "SC03": (30000, 90, "LinkedIn Sales Navigator seat + InMail"),
        "SC04": (15000, 40, "Partner form landing page + promotion"),
        "SC05": (25000, 70, "Creator community gifting + coordination"),
        "SC06": (5000, 50, "Re-sequencing dormant contacts"),
    }
    db["campaign_plan"] = [
        {"sponsor_campaign_id": k, "budget_inr": b, "planned_hours": hrs, "notes": n, "is_simulated": True,
         "updated_at": "2025-01-15T09:00:00+05:30"}
        for k, (b, hrs, n) in plan.items()
    ]

    # ---------------- SIMULATED: payments for confirmed CASH deals ----------------
    # Policy modelled: 50% advance invoiced at confirmation, balance invoiced 7 days later.
    # Receipt lag is deterministic pseudo-random per opportunity; some balances remain unpaid at event time.
    hist = pd.DataFrame(db["opp_history"]).drop_duplicates("history_id")
    hist["effective_at"] = pd.to_datetime(hist["effective_at"].str[:19])
    opps = {o["opportunity_id"]: o for o in db["opportunities"]}
    latest = hist.sort_values(["effective_at", "history_id"]).groupby("opportunity_id").tail(1)
    still_confirmed = set(latest[latest.stage == "partner_confirmed"].opportunity_id)   # excludes O006 (confirmed, later withdrawn)
    conf = (hist[(hist.stage == "partner_confirmed") & hist.opportunity_id.isin(still_confirmed)]
            .sort_values("effective_at").groupby("opportunity_id").head(1))
    pays = []
    n = 0
    for _, r in conf.iterrows():
        o = opps[r.opportunity_id]
        if o["support_type"] != "cash":
            continue
        val = int(r.confirmed_value_inr)
        t0 = r.effective_at
        for part, frac, inv_lag in (("advance", 0.5, 0), ("balance", 0.5, 7)):
            n += 1
            u = h(r.opportunity_id + part)
            invoiced = t0 + timedelta(days=inv_lag)
            due = invoiced + timedelta(days=15)
            if part == "advance":
                lag = 4 + int(u * 20)            # 4-23 days
            else:
                lag = 8 + int(u * 45)            # 8-52 days -> some land after the fest / after history end
            received = invoiced + timedelta(days=lag)
            gross = int(round(val * frac))
            tds = int(round(gross * 0.02))
            pays.append({
                "payment_id": f"PAY{n:03d}", "opportunity_id": r.opportunity_id, "brand_id": o["brand_id"],
                "installment": part, "amount_inr": gross, "tds_inr": tds,
                "invoiced_at": iso(pd.Timestamp(invoiced)), "due_at": iso(pd.Timestamp(due)),
                "received_at": iso(pd.Timestamp(received)) if received <= pd.Timestamp("2025-04-20 23:59:59") else None,
                "net_received_inr": gross - tds, "utr": f"SIMUTR{n:05d}", "is_simulated": True,
            })
    db["payments"] = pays

    # ---------------- Starter tasks (user-editable) ----------------
    db["tasks"] = [
        {"task_id": "TK0001", "title": "Chase balance invoices for confirmed creator-referral deals", "description": "Collect balance before T-14.",
         "owner_id": "T05", "due_date": "2025-03-28", "status": "in_progress", "priority": "high",
         "brand_id": None, "opportunity_id": None, "sponsor_campaign_id": "SC05", "source": "manual",
         "created_at": "2025-03-15T10:00:00+05:30", "updated_at": "2025-03-15T10:00:00+05:30"},
        {"task_id": "TK0002", "title": "Review stalled negotiating deals from cold channels", "description": "Decide push, re-price or drop.",
         "owner_id": "T01", "due_date": "2025-03-25", "status": "todo", "priority": "high",
         "brand_id": None, "opportunity_id": None, "sponsor_campaign_id": "SC03", "source": "manual",
         "created_at": "2025-03-15T10:05:00+05:30", "updated_at": "2025-03-15T10:05:00+05:30"},
        {"task_id": "TK0003", "title": "Ask alumni cell for 10 warm intros to fintech marketing heads", "description": "",
         "owner_id": "T01", "due_date": "2025-03-20", "status": "done", "priority": "medium",
         "brand_id": None, "opportunity_id": None, "sponsor_campaign_id": "SC02", "source": "manual",
         "created_at": "2025-03-12T10:00:00+05:30", "updated_at": "2025-03-19T16:00:00+05:30"},
    ]
    db["audit_log"] = []
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(db, indent=1, ensure_ascii=False), encoding="utf-8")
    print({k: len(v) for k, v in db.items()})


if __name__ == "__main__":
    main()
