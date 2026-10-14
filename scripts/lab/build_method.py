#!/usr/bin/env python3
"""Measure the fixed constants of the Player Lab grading method (version 2) from many seasons of real games.

Run (once, and again only when the method or the stat catalog changes; past seasons do not change):
    python scripts/lab/build_method.py --seasons 2018 2019 2020 2021 2022 2023 2024 2025 --input <nflverse folder> --out data/lab/method-v2.json

For every stat that has a better and a worse end, over the player-seasons with at least half a starter's volume, it measures:

    talentSd     how far apart players truly are on the stat: the covariance of odd-game and even-game rates (two independent
                 measurements of one latent level share only that level), so no assumption about play-level noise is needed
    playSd       the noise per unit of volume, from how far the two halves disagree beyond what talent explains
    drift        how far one player's true level moves in a year: the spread of year-to-year changes beyond what noise explains
    reliability  the whole season's agreement with itself (the halves' correlation, stepped up by Spearman-Brown)
    stability    this season against the next, for the same player

The grade scale uses `talentSd` (ten grade points = one of them), the standard errors use `playSd`, and a veteran's earlier seasons are
discounted by `drift`. It reads the games exactly as build_players.py does (`prepare`), so a stat is measured the way it is graded.
Every number is in the stat's displayed units. Tracking-data stats (Next Gen Stats) exist from 2018; charting (FTN) stats from 2022 and are
never graded.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_players as bp  # noqa: E402
import method as mth  # noqa: E402
import validate_methodology as vm  # noqa: E402
import validate_positions as vp  # noqa: E402

# The reference population for a stat: player-seasons with at least this many times the volume that earns the stat a place on a card
# (`Stat.need[0]`), so the spread measured is the spread among players who played a real part of a season, not among a few snaps.
GATE_TIMES = 3
# The least a half-season must hold of the stat's own denominator before it counts (a half with three samples measures nothing).
MIN_HALF = 0.25


def gather(folder: str, seasons: list[int]) -> dict[str, pd.DataFrame]:
    """{group: per-game components for every season, with a `season` column}."""
    frames: dict[str, list[pd.DataFrame]] = {}
    for s in seasons:
        print(f"reading {s}", file=sys.stderr)
        ctx = bp.prepare(bp.load(s, folder), s)
        if ctx is None:
            continue
        for g, df in ctx["comps"].items():
            if df is None or len(df) == 0:
                continue
            frames.setdefault(g, []).append(df.assign(season=s))
    return {g: pd.concat(fs, ignore_index=True) for g, fs in frames.items()}


def measure(units: pd.DataFrame, group: str, key: str, st: bp.Stat) -> dict | None:
    """The constants of one stat, in the stat's displayed units, or None when there is too little data to say."""
    if st.calc or st.num not in units or st.den not in units:
        return None
    gate = st.gate or st.den
    if gate not in units:
        return None
    min_gate = st.need[0] * GATE_TIMES
    min_half = max(1.0, st.need[0] * MIN_HALF)
    sp = vp.half_spread(units, st.num, st.den, gate, min_gate, min_half)
    if not sp or not sp.get("talentSd"):
        return None
    sc = st.scale
    talent_raw = sp["talentSd"]
    out = {"n": sp["n"], "mean": vm.r4(sp["mean"] * sc), "talentSd": vm.r4(talent_raw * sc), "playSd": vm.r4(sp["playSd"] * sc),
           "reliability": sp["reliability"], "halfSeasonSd": vm.r4(sp["halfSeasonSd"] * sc), "shareReal": sp["shareReal"]}
    # Season to season: the correlation, and how far the true level moves in a year (the spread of changes beyond what noise explains).
    T = vm.season_table(units, {"_v": (st.num, st.den)}, min_gate, gate)
    key = "_v"  # the table's own name for the ratio: a stat named like its numerator ("broken", "cpoe") would overwrite it
    if len(T) >= 30:
        y = vm.yoy(T[["season", "id", key]].dropna(), [key])[key]
        out["stability"], out["stabilityCi"], out["stabilityN"] = y["r"], y["ci"], y["n"]
        out["label"] = vm.signal_label(y["r"])
        nx = T[["season", "id", key, st.den]].copy()
        nx["season"] -= 1
        m = T.merge(nx, on=["season", "id"], suffixes=("", "_n"))
        m = m[(m[st.den] > 0) & (m[st.den + "_n"] > 0)]
        if len(m) >= 30:
            # Centre each season on its own average so a league-wide shift is not read as players changing.
            ctr = T.groupby("season")[key].mean()
            d = (m[key] - m["season"].map(ctr)) - (m[key + "_n"] - (m["season"] + 1).map(ctr))
            sigma2 = sp["playSd"] ** 2
            noise = float((sigma2 * (1.0 / m[st.den] + 1.0 / m[st.den + "_n"])).mean())
            drift = max(float((d ** 2).mean()) - noise, 0.1 * talent_raw ** 2)
            out["drift"] = float(f"{min(drift, 2 * talent_raw ** 2) * sc * sc:.6g}")
    out.setdefault("drift", float(f"{0.3 * (talent_raw * sc) ** 2:.6g}"))
    return out


def build_method(folder: str, seasons: list[int]) -> dict:
    units = gather(folder, seasons)
    groups: dict[str, dict] = {}
    for g, grp in bp.GROUPS.items():
        if g == "ol" or g not in units:
            continue
        stats: dict[str, dict] = {}
        for key, st in grp.stats.items():
            if st.higher is None:
                continue
            m = measure(units[g], g, key, st)
            if m:
                stats[key] = m
        if stats:
            groups[g] = {"stats": stats}
    return {
        "version": mth.METHOD_VERSION,
        "name": mth.METHOD_NAME,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": bp.LICENSE,
        "referenceSeasons": sorted(seasons),
        "population": f"Player-seasons with at least {GATE_TIMES} times the volume that earns a stat a place on a player's card.",
        "note": "All numbers are in the stat's displayed units. talentSd is how far apart players truly are, playSd the noise per unit of volume, "
                "drift the variance of a player's true-level change in a year.",
        "groups": groups,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="folder with the source files (the layout build_players.py --input reads)")
    ap.add_argument("--seasons", type=int, nargs="+", default=list(range(2018, 2026)))
    ap.add_argument("--out", default="data/lab/method-v2.json")
    args = ap.parse_args(argv)
    payload = build_method(args.input, sorted(args.seasons))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False, default=float) + "\n")
    n = sum(len(g["stats"]) for g in payload["groups"].values())
    print(f"wrote {out} ({n} stats in {len(payload['groups'])} groups)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
