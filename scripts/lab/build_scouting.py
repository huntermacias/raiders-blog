#!/usr/bin/env python3
"""Build the league-wide team tendencies behind the scouting reports.

Source: nflverse play-by-play (CC BY 4.0), https://github.com/nflverse/nflverse-data
Run:    python scripts/lab/build_scouting.py --season 2026 --out data/lab/scouting.json

Every team gets the same offense and defense numbers from the regular season so far, each with its
rank in the league (1 is best). Early in the year the samples are small, so the file records how many
games each team has played and the pages say so.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import math
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SOURCE_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
LICENSE = "nflverse play-by-play data, CC BY 4.0. Calculations by Raiders Rundown."

# key -> (label, higher is better for the side being measured)
OFFENSE = {
    "epa": True, "epaPass": True, "epaRush": True, "success": True, "explosive": True,
    "third": True, "redZone": True, "sackRate": False, "turnovers": False, "points": True, "pass": None,
}
DEFENSE = {
    "epa": False, "epaPass": False, "epaRush": False, "success": False, "explosive": False,
    "third": False, "redZone": False, "sackRate": True, "turnovers": True, "points": False, "pass": None,
}

COLS = [
    "game_id", "week", "season_type", "home_team", "away_team", "posteam", "defteam", "play_type", "down",
    "epa", "success", "yards_gained", "pass_attempt", "rush_attempt", "qb_dropback", "sack", "qb_scramble",
    "third_down_converted", "third_down_failed", "fixed_drive", "fixed_drive_result", "yardline_100",
    "interception", "fumble_lost", "wp", "half_seconds_remaining", "total_home_score", "total_away_score",
    "play_id", "desc", "two_point_attempt", "penalty",
]


def _safe(num: float, den: float) -> float | None:
    return None if not den else float(num) / float(den)


def team_side(plays: pd.DataFrame, games: int, finished: pd.DataFrame, side: str, team: str) -> dict:
    """One side of one team's numbers. `side` is 'off' (the team has the ball) or 'def' (it is defending)."""
    col = "posteam" if side == "off" else "defteam"
    mine = plays[plays[col] == team]
    scrim = mine[mine["play_type"].isin(["pass", "run"]) & mine["epa"].notna()]
    passes = scrim[scrim["play_type"] == "pass"]
    rushes = scrim[scrim["play_type"] == "run"]
    explosive = ((rushes["yards_gained"] >= 10).sum() + (passes["yards_gained"] >= 20).sum())
    third = mine[(mine["third_down_converted"] == 1) | (mine["third_down_failed"] == 1)]
    dropbacks = mine[mine["qb_dropback"] == 1]
    neutral = scrim[(scrim["down"].isin([1, 2])) & scrim["wp"].between(0.2, 0.8) & (scrim["half_seconds_remaining"] > 120)]
    # Red zone: drives that got inside the 20, and how many of them ended in a touchdown.
    rz = mine[mine["yardline_100"] <= 20].drop_duplicates(["game_id", "fixed_drive"])
    rz_td = (rz["fixed_drive_result"] == "Touchdown").sum()
    giveaways = int(((mine["interception"] == 1) | (mine["fumble_lost"] == 1)).sum())
    pts = finished["for"].sum() if side == "off" else finished["against"].sum()
    return {
        "epa": _safe(scrim["epa"].sum(), len(scrim)),
        "epaPass": _safe(passes["epa"].sum(), len(passes)),
        "epaRush": _safe(rushes["epa"].sum(), len(rushes)),
        "success": _safe(scrim["success"].sum(), len(scrim)),
        "explosive": _safe(explosive, len(scrim)),
        "third": _safe((third["third_down_converted"] == 1).sum(), len(third)),
        "redZone": _safe(rz_td, len(rz)),
        "sackRate": _safe((dropbacks["sack"] == 1).sum(), len(dropbacks)),
        "turnovers": _safe(giveaways, games),
        "points": _safe(pts, games),
        "pass": _safe((neutral["play_type"] == "pass").sum(), len(neutral)),
        "plays": int(len(scrim)),
    }


def final_scores(df: pd.DataFrame) -> pd.DataFrame:
    """One row per team per finished game: points for and against."""
    rows = []
    for gid, g in df.groupby("game_id"):
        g = g.sort_values("play_id")
        last = g.iloc[-1]
        if "END GAME" not in str(last.get("desc", "")).upper():
            continue
        h, a = int(last["total_home_score"]), int(last["total_away_score"])
        rows.append({"team": last["home_team"], "game": gid, "for": h, "against": a})
        rows.append({"team": last["away_team"], "game": gid, "for": a, "against": h})
    return pd.DataFrame(rows, columns=["team", "game", "for", "against"])


# nflverse writes the Rams as LA; the site uses LAR.
SITE_ABBR = {"LA": "LAR"}


def build(df: pd.DataFrame, season: int) -> dict:
    df = df.copy()
    for col in ("home_team", "away_team", "posteam", "defteam"):
        if col in df:
            df[col] = df[col].replace(SITE_ABBR)
    reg = df[df["season_type"] == "REG"]
    reg = reg[reg["penalty"].fillna(0) != 1] if "penalty" in reg else reg
    scores = final_scores(df[df["season_type"] == "REG"])
    teams = sorted(set(scores["team"]))
    out: dict = {}
    for t in teams:
        finished = scores[scores["team"] == t]
        games = int(len(finished))
        out[t] = {
            "g": games,
            "off": team_side(reg, games, finished, "off", t),
            "def": team_side(reg, games, finished, "def", t),
        }
    # Ranks (1 = best), and league averages.
    league = {"off": {}, "def": {}}
    for side, spec in (("off", OFFENSE), ("def", DEFENSE)):
        for key, higher_better in spec.items():
            vals = {t: out[t][side][key] for t in teams if out[t][side].get(key) is not None}
            if higher_better is None:
                order = sorted(vals, key=lambda t: -vals[t])  # pass rate: 1 = most pass-heavy
            else:
                order = sorted(vals, key=lambda t: -vals[t] if higher_better else vals[t])
            for i, t in enumerate(order):
                out[t][side][key] = {"v": round(vals[t], 4), "rank": i + 1}
            league[side][key] = round(float(np.mean(list(vals.values()))), 4) if vals else None
        for t in teams:
            out[t][side].pop("plays", None)
            for key in spec:
                if not isinstance(out[t][side].get(key), dict):
                    out[t][side][key] = None
    return {
        "season": season,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "league": league,
        "teams": out,
    }


def load_pbp(season: int, path: str | None) -> pd.DataFrame:
    if path:
        return pd.read_csv(path, low_memory=False, usecols=lambda c: c in COLS)
    with urllib.request.urlopen(SOURCE_URL.format(season=season), timeout=180) as resp:  # noqa: S310 - fixed https URL
        data = gzip.decompress(resp.read())
    return pd.read_csv(io.BytesIO(data), low_memory=False, usecols=lambda c: c in COLS)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--input", help="local play-by-play csv or csv.gz instead of downloading")
    ap.add_argument("--out", default="data/lab/scouting.json")
    args = ap.parse_args(argv)

    result = build(load_pbp(args.season, args.input), args.season)
    if not result["teams"]:
        print("no finished games found; leaving the existing file alone", file=sys.stderr)
        return 0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        try:
            old = json.loads(out.read_text())
            if {**old, "generatedAt": ""} == {**result, "generatedAt": ""}:
                print("data unchanged")
                return 0
        except json.JSONDecodeError:
            pass
    out.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {out} ({len(result['teams'])} teams, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
