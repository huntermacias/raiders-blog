#!/usr/bin/env python3
"""Build the full regular-season schedule, with the scores of every game already played.

Source: the nflverse "nfldata" games file (CC BY 4.0), the same file the position-group matchups use.
Run:    python scripts/lab/build_schedule.py --season 2026 --out data/lab/schedule.json

The Playoff Machine works from this file: finished games are locked to their real result and everything
else can be picked by the reader. Nothing is estimated here. The market spread is kept only for games that
have one, so a future "pick the favorites" tool never has to invent a favorite.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
LICENSE = "nflverse nfldata games file, CC BY 4.0. Standings and tiebreakers calculated by Raiders Rundown."

# nflverse writes the Rams as LA; the site uses LAR.
SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}

TEAMS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
}
GAMES_PER_TEAM = 17


def _abbr(code: str) -> str:
    return SITE_ABBR.get(code, code)


def _num(value):
    """A whole number from a spreadsheet cell, or None when it is empty."""
    if value is None or pd.isna(value) or value == "":
        return None
    return int(float(value))


def build(games: pd.DataFrame, season: int) -> dict:
    reg = games[(games["season"] == season) & (games["game_type"] == "REG")].copy()
    rows = []
    for _, g in reg.sort_values(["week", "gameday", "gametime", "game_id"]).iterrows():
        home, away = _abbr(g["home_team"]), _abbr(g["away_team"])
        hs, as_ = _num(g.get("home_score")), _num(g.get("away_score"))
        row = {
            "id": g["game_id"],
            "week": int(g["week"]),
            "away": away,
            "home": home,
            "date": str(g["gameday"]),
            "time": None if pd.isna(g.get("gametime")) else str(g["gametime"]),
        }
        if hs is not None and as_ is not None:
            row["awayScore"], row["homeScore"] = as_, hs
        else:
            # Positive means the home team is favored. Kept only for games that have not been played.
            line = g.get("spread_line")
            row["spread"] = None if line is None or pd.isna(line) else float(line)
        rows.append(row)

    check(rows)
    played = [r for r in rows if "homeScore" in r]
    return {
        "season": season,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "played": len(played),
        "throughWeek": max((r["week"] for r in played), default=0),
        "games": rows,
    }


def check(rows: list[dict]) -> None:
    """Refuse to write a schedule that cannot be right, so a bad download never replaces a good file."""
    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate game ids")
    seen: dict[str, int] = {}
    for r in rows:
        for t in (r["home"], r["away"]):
            if t not in TEAMS:
                raise ValueError(f"unknown team {t}")
            seen[t] = seen.get(t, 0) + 1
        if r["home"] == r["away"]:
            raise ValueError(f"{r['id']} has the same team on both sides")
    if set(seen) != TEAMS:
        raise ValueError("the schedule does not have all 32 teams")
    bad = {t: n for t, n in seen.items() if n != GAMES_PER_TEAM}
    if bad:
        raise ValueError(f"every team should play {GAMES_PER_TEAM} games: {bad}")


def _read(path_or_url: str) -> pd.DataFrame:
    if "://" not in path_or_url:
        return pd.read_csv(path_or_url, low_memory=False)
    with urllib.request.urlopen(path_or_url, timeout=120) as resp:  # noqa: S310 - fixed https URL
        return pd.read_csv(io.BytesIO(resp.read()), low_memory=False)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--input", help="a games.csv file instead of downloading it")
    ap.add_argument("--out", default="data/lab/schedule.json")
    args = ap.parse_args(argv)

    try:
        result = build(_read(args.input or GAMES_URL), args.season)
    except ValueError as err:
        print(f"not writing a schedule: {err}", file=sys.stderr)
        return 1

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
    print(f"wrote {out} ({len(result['games'])} games, {result['played']} played, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
