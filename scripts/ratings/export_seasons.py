#!/usr/bin/env python3
"""Export finished seasons from the nflverse games file as a small test fixture: every regular-season game with its score, and the
wild-card matchups that were actually played. tests/lib/rooting/seeding.test.ts replays the site's seeding and tiebreakers on these
seasons and checks they pick the same 14 playoff teams, the same top seeds and the same wild-card pairings as the NFL did.

Run:  python scripts/ratings/export_seasons.py --games games.csv --from 2020 --out tests/fixtures/seasons.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", required=True)
    ap.add_argument("--from", dest="first", type=int, default=2020)
    ap.add_argument("--out", default="tests/fixtures/seasons.json")
    args = ap.parse_args()

    g = pd.read_csv(args.games, low_memory=False)
    for c in ("home_team", "away_team"):
        g[c] = g[c].replace(SITE_ABBR)
    out = {}
    for season in sorted(g["season"].unique()):
        if season < args.first:
            continue
        reg = g[(g["season"] == season) & (g["game_type"] == "REG")]
        wc = g[(g["season"] == season) & (g["game_type"] == "WC")]
        if reg["home_score"].isna().any() or wc.empty:
            continue  # a season that is not over
        out[str(int(season))] = {
            "games": [
                {"id": r.game_id, "week": int(r.week), "home": r.home_team, "away": r.away_team, "homeScore": int(r.home_score), "awayScore": int(r.away_score)}
                for r in reg.sort_values(["week", "gameday", "game_id"]).itertuples()
            ],
            "wildCard": [{"home": r.home_team, "away": r.away_team} for r in wc.itertuples()],
        }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print("wrote", args.out, {k: len(v["games"]) for k, v in out.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
