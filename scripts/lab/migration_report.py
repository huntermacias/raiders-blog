#!/usr/bin/env python3
"""What changes for a reader when the Lab moves from method v1 to v2, on the same cutoff: the numbers the site shows today next to the
numbers v2 would show, with the causes. Writes `data/lab/v2/migration.json` and prints a table.

    python scripts/lab/migration_report.py --input <folder with the nflverse files> --v1 data/lab/players.json --v1-display <json from the TypeScript kit> --v2 data/lab/v2/players.json

`--v1-display` is the file the TypeScript kit writes for the production data (the number actually on a card, `gradeScore`, and its rank),
because that number is made in the browser from the production file, not stored in it.

The same cutoff is checked, not assumed: for every quarterback the difference in dropbacks between the two files must equal his
scrambles (v2 counts a scramble as a dropback; v1 did not), and the games must match.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd


def qb_values(input_dir: str, season: int, ids: set[str]) -> pd.DataFrame:
    """EPA per dropback for each quarterback under the three definitions, step by step."""
    cols = {"season_type", "penalty", "qb_dropback", "qb_scramble", "play_type", "epa", "qb_epa", "passer_player_id", "rusher_player_id"}
    d = pd.read_csv(Path(input_dir) / f"play_by_play_{season}.csv.gz", usecols=lambda c: c in cols, low_memory=False)
    d = d[(d.season_type == "REG") & (pd.to_numeric(d.penalty, errors="coerce").fillna(0) != 1) & d.play_type.isin(["pass", "run"]) & d.epa.notna()]
    db = d[pd.to_numeric(d.qb_dropback, errors="coerce").fillna(0) == 1].copy()
    scr = pd.to_numeric(db.qb_scramble, errors="coerce").fillna(0) == 1
    db["owner"] = db.passer_player_id.where(~(scr & db.rusher_player_id.notna()), db.rusher_player_id)
    db["is_scr"] = scr
    db["qb"] = pd.to_numeric(db.qb_epa, errors="coerce").fillna(db.epa)
    db = db[db.owner.isin(ids)]
    v1 = db[~db.is_scr].groupby("owner").agg(n1=("epa", "size"), epa_v1=("epa", "mean"))
    plus = db.groupby("owner").agg(n2=("epa", "size"), epa_scr=("epa", "mean"), qb_epa=("qb", "mean"))
    return v1.join(plus)


def explain(row: dict) -> list[str]:
    """The reasons a quarterback's place changed, in plain words, only those that apply. Thresholds are the size of a rank move."""
    v1, v2, c = row["v1"], row["v2"], row["causes"]
    out = []
    shown, stat = v1["rankOfDisplayed"], v1["rankOnTheStat"]
    if shown is not None and stat is not None and abs(shown - stat) >= 5:
        out.append(f"v1's Overall averaged five stats and he ranked {shown}{_o(shown)} on it but {stat}{_o(stat)} on EPA per dropback alone; v2's season number is EPA alone")
    if stat is not None and v1["plainRankOnTheStat"] is not None and abs(stat - v1["plainRankOnTheStat"]) >= 5:
        out.append(f"v1 ranked a value pulled toward the middle for his {v1['dropbacks']} dropbacks ({stat}{_o(stat)}); v2 ranks the plain number, not a pulled one (on v1's own numbers that is {v1['plainRankOnTheStat']}{_o(v1['plainRankOnTheStat'])}), and shows the sample beside it")
    if v1["displayedOverall"] is not None and v2["standing"] is not None and abs(v1["displayedOverall"] - v2["standing"]) >= 10:
        out.append(f"the number on his card changes meaning: v1's {v1['displayedOverall']} was a stretched average of five stats, v2's {v2['standing']} is the percentile of his EPA per dropback among {v1['of']} quarterbacks")
    move = c["changeFromScrambles"] + c["changeFromQbOnlyEpa"]
    if abs(move) >= 0.03:
        parts = []
        if abs(c["changeFromScrambles"]) >= 0.01:
            parts.append(f"{c['scramblesNowCounted']} scrambles now count as dropbacks ({c['changeFromScrambles']:+.3f})")
        if abs(c["changeFromQbOnlyEpa"]) >= 0.01:
            parts.append(f"receivers' fumbles no longer charged to him ({c['changeFromQbOnlyEpa']:+.3f})")
        out.append("his EPA per dropback moved " + f"{move:+.3f}: " + " and ".join(parts) if parts else f"his EPA per dropback moved {move:+.3f}")
    return out or ["no material change: same stat, same order within a few places"]


def _o(n: int) -> str:
    return "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def build(v1: dict, v1d: list[dict], v2: dict, input_dir: str, season: int) -> dict:
    A = {p["id"]: p for p in v1["players"] if p["group"] == "qb"}
    B = {p["id"]: p for p in v2["players"] if p["group"] == "qb"}
    D = {x["id"]: x for x in v1d if x["group"] == "qb"}
    steps = qb_values(input_dir, season, set(A) & set(B))
    stat = lambda p, k: next(s for s in p["stats"] if s["k"] == k)  # noqa: E731
    rows, problems = [], []
    for i in sorted(set(A) & set(B), key=lambda k: -(D[k]["displayed"] or 0)):
        a, b, d = A[i], B[i], D[i]
        sa, sb = stat(a, "epaDb")["season"], stat(b, "epaDb")
        gb = sb.get("grade") or None
        scr = b["box"].get("scr", 0)
        if a["games"] != b["games"] or sb["season"]["n"] - sa["n"] != scr:
            problems.append(a["name"])
        st = steps.loc[i]
        # v1's rank was made on a value pulled toward the middle for few plays; the plain order of the same numbers can differ.
        raw_order = sorted((x for x in A.values()), key=lambda p: -stat(p, "epaDb")["season"]["v"])
        raw_rank = [p["id"] for p in raw_order].index(i) + 1
        proj = b.get("grade")
        contrib = b.get("contrib")
        rows.append({
            "id": i, "name": a["name"], "team": a["team"], "games": a["games"],
            "v1": {"displayedOverall": d["displayed"], "rankOfDisplayed": d["rank"], "of": d["of"], "scoutingGrade": round(d["scouting"], 1) if d["scouting"] is not None else None,
                   "epaPerDropback": sa["v"], "dropbacks": int(sa["n"]), "rankOnTheStat": sa.get("r"), "statGrade": sa.get("g"), "plainRankOnTheStat": raw_rank,
                   "mainStatRanks": {k: next((s["season"].get("r") for s in a["stats"] if s["k"] == k), None) for k in ("epaDb", "success", "cpoe", "badThrow", "sackRate")}},
            "v2": {"thisSeasonQbEpa": sb["season"]["v"], "dropbacks": int(sb["season"]["n"]), "rank": sb["season"].get("r"), "standing": None,
                   "projection": None if not proj else {"grade": proj["g"], "lo": proj["lo"], "hi": proj["hi"], "rank": proj["rank"], "shareThisSeason": proj.get("cw")},
                   "contributionEpa": None if not contrib else contrib["over"], "contributionPerGame": None if not contrib else contrib["perGame"]},
            "causes": {
                "why": [],
                "scramblesNowCounted": int(scr),
                "epaPerDropbackWithV1Attribution": round(float(st.epa_v1), 4),
                "epaPerDropbackAfterAddingScrambles": round(float(st.epa_scr), 4),
                "epaPerDropbackQbOnly": round(float(st.qb_epa), 4),
                "changeFromScrambles": round(float(st.epa_scr - st.epa_v1), 4),
                "changeFromQbOnlyEpa": round(float(st.qb_epa - st.epa_scr), 4),
            },
        })
    for r in rows:
        r["causes"]["why"] = explain(r)
    return {"version": 1, "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "season": season, "cutoffCheck": {"quarterbacks": len(rows), "mismatches": problems},
            "reading": ["'Displayed' is the number on a card today: the average grade of the quarterback's main stats, stretched onto 1 to 99. 'This season' in v2 is one stat, quarterback-only EPA per dropback, and its rank.",
                        "A change in rank has four possible causes, listed per player: scrambles are now dropbacks; the value is the league's quarterback-only EPA; v1 averaged five stats and ranked on a value pulled toward the middle, v2 ranks the plain number; and the projection counts earlier seasons while 'this season' does not."],
            "rows": rows}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--v1", default="data/lab/players.json")
    ap.add_argument("--v1-display", required=True)
    ap.add_argument("--v2", default="data/lab/v2/players.json")
    ap.add_argument("--v2-display", required=True, help="the file the TypeScript kit writes for the v2 data: the standing a card shows")
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--out", default="data/lab/v2/migration.json")
    a = ap.parse_args(argv)
    v1, v2 = json.loads(Path(a.v1).read_text()), json.loads(Path(a.v2).read_text())
    out = build(v1, json.loads(Path(a.v1_display).read_text()), v2, a.input, a.season)
    # The standing a v2 card shows, as the TypeScript kit makes it (the percentile of the observed rank).
    shown = {x["id"]: x for x in json.loads(Path(a.v2_display).read_text()) if x["group"] == "qb"}
    for r in out["rows"]:
        r["v2"]["standing"] = shown[r["id"]]["standing"]
    Path(a.out).write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {a.out}; cutoff mismatches: {out['cutoffCheck']['mismatches']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
