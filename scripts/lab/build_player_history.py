#!/usr/bin/env python3
"""Build the player history behind /lab/players: the same grades as the current season, for each of the last few full seasons.

Run (once a year, after the season is over; past seasons do not change):
    python scripts/lab/build_player_history.py --seasons 2022 2023 2024 2025 --out data/lab/player-history.json
    python scripts/lab/build_player_history.py --seasons 2022 2023 2024 2025 --input <folder with the nflverse files>

It runs `build_players.build` once per season, so a past season is measured exactly the way the current one is (same stats, same
volume rules, same stabilizing, same grades against that season's league), and keeps the part of each player's line that other
pages need: his value, volume, uncertainty, grade and rank for each stat, and the league's yardstick for that season.

Two things are worked out across the seasons and stored beside them, because the current season's grading uses them to start a
veteran from his own history instead of the league's average (see `stabilize_with_prior` in build_players.py):

    talent  how far apart players really are on a stat: the spread of the values minus the noise the volume behind them makes
    drift   how much a player's true level moves from one season to the next, once the noise in both is taken out

The charting file (FTN) starts in 2022, so 2022 is the first season every stat exists for.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import build_players as bp

# A stat's drift is never taken as zero: even a stat that looks perfectly steady can change, and a prior that never ages would
# be trusted without limit. This is the smallest share of the talent variance a year of aging is allowed to be.
MIN_DRIFT = 0.1
# And a stat can only drift as far as no memory at all: next year's level is unrelated to this year's.
MAX_DRIFT = 2.0


def compact(result: dict) -> dict:
    """One season's `build` result cut down to what is kept: {id: [group, team, pos, games, [[k, v, n, se, g, r], ...]]} plus names and yard."""
    players: dict[str, list] = {}
    names: dict[str, str] = {}
    for p in result["players"]:
        stats = []
        for st in p["stats"]:
            s = st["season"]
            stats.append([st["k"], s["v"], s["n"], s.get("se"), s.get("g"), s.get("r")])
        names[p["id"]] = p["name"]
        players.setdefault(p["id"], []).append([p["group"], p["team"], p["pos"], p["games"], stats])
    return {"players": players, "names": names, "yard": result["yard"]}


def estimate(per_season: dict[int, dict]) -> dict[str, dict[str, dict[str, float]]]:
    """{group: {stat: {"talent": variance, "drift": variance per year}}} from the seasons' compact results."""
    # {(group, stat): {season: {id: (value, se)}}}
    table: dict[tuple[str, str], dict[int, dict[str, tuple[float, float]]]] = {}
    for season, comp in per_season.items():
        for pid, rows in comp["players"].items():
            for group, _, _, _, stats in rows:
                for k, v, _, se, g, _ in stats:
                    if se is None or g is None:  # a stat with no grade is a style stat: not good or bad, so nothing to carry forward
                        continue
                    table.setdefault((group, k), {}).setdefault(season, {})[pid] = (float(v), float(se))
    out: dict[str, dict[str, dict[str, float]]] = {}
    for (group, k), seasons in table.items():
        tvars, diffs, noises = [], [], []
        for season, vals in seasons.items():
            a = np.array([x[0] for x in vals.values()])
            n = np.array([x[1] for x in vals.values()])
            if len(a) >= 10:
                tvars.append(max(float(a.var()) - float(np.mean(n ** 2)), 0.0))
        for season, vals in seasons.items():
            before = seasons.get(season - 1)
            if not before:
                continue
            for pid, (v, se) in vals.items():
                if pid in before:
                    diffs.append(v - before[pid][0])
                    noises.append(se ** 2 + before[pid][1] ** 2)
        if not tvars:
            continue
        talent = float(np.mean(tvars))
        if talent <= 0:
            continue
        drift = talent * MIN_DRIFT
        if len(diffs) >= 30:
            drift = max(drift, float(np.var(diffs)) - float(np.mean(noises)))
        drift = min(drift, talent * MAX_DRIFT)
        out.setdefault(group, {})[k] = {"talent": float(f"{talent:.6g}"), "drift": float(f"{drift:.6g}")}
    return out


def build_history(seasons: list[int], folder: str | None) -> dict:
    per_season: dict[int, dict] = {}
    for season in sorted(seasons):
        print(f"building {season}", file=sys.stderr)
        result = bp.build(bp.load(season, folder), season)
        if not result.get("players"):
            raise SystemExit(f"no player data for {season}")
        per_season[season] = compact(result)
        per_season[season]["weeks"] = result["week"]
    players: dict[str, dict] = {}
    for season, comp in per_season.items():
        for pid, rows in comp["players"].items():
            entry = players.setdefault(pid, {"n": comp["names"][pid], "r": []})
            entry["n"] = comp["names"][pid]
            for group, team, pos, games, stats in rows:
                entry["r"].append([season, group, team, pos, games, stats])
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": bp.LICENSE,
        "seasons": sorted(seasons),
        "weeks": {str(s): c["weeks"] for s, c in per_season.items()},
        "yard": {str(s): c["yard"] for s, c in per_season.items()},
        "model": estimate(per_season),
        "players": players,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", type=int, nargs="+", required=True)
    ap.add_argument("--input", help="folder with the source files instead of downloading them")
    ap.add_argument("--out", default="data/lab/player-history.json")
    args = ap.parse_args(argv)
    payload = build_history(args.seasons, args.input)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(payload['players'])} players)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
