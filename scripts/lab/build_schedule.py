#!/usr/bin/env python3
"""Build the full regular-season schedule, with the scores of every game already played.

Source: the nflverse "nfldata" games file (CC BY 4.0), the same file the position-group matchups use.
Run:    python scripts/lab/build_schedule.py --season 2026 --out data/lab/schedule.json

The Playoff Machine works from this file: finished games are locked to their real result and everything
else can be picked by the reader. Nothing is estimated here. The market spread is kept for every game that
has one, played or not, because the team-strength model reads strength out of the spreads of the games
already played as well as the ones coming up; a game with no line gets none, so nothing invents a favorite.
Games at a neutral site (international games) are flagged, since neither team has home field there.
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
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={season}&seasontype=2&week={week}&limit=100"
LICENSE = "nflverse nfldata games file, CC BY 4.0. Standings and tiebreakers calculated by Raiders Rundown."

# nflverse writes the Rams as LA; the site uses LAR.
SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}
# ESPN's abbreviations that differ from the site's.
ESPN_ABBR = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR", "OAK": "LV"}

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
        # Positive means the home team is favored. Kept for played games too, and left out when the file has no line.
        line = g.get("spread_line")
        if line is not None and not pd.isna(line):
            row["spread"] = float(line)
        elif hs is None or as_ is None:
            row["spread"] = None
        if g.get("location") == "Neutral":
            row["neutral"] = True
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


def _espn_abbr(code: str) -> str:
    code = (code or "").upper()
    return ESPN_ABBR.get(code, code)


def espn_finals(board: dict) -> dict[tuple[str, str], tuple[int, int]]:
    """Final scores in one ESPN scoreboard response, as {(home, away): (home score, away score)}.

    Only games ESPN itself calls over ("post") with two whole-number scores are returned; anything else is left out rather than guessed.
    """
    out: dict[tuple[str, str], tuple[int, int]] = {}
    for event in board.get("events") or []:
        comp = ((event or {}).get("competitions") or [{}])[0]
        status = ((comp.get("status") or event.get("status") or {}).get("type") or {})
        if status.get("state") != "post":
            continue
        sides = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        home, away = sides.get("home"), sides.get("away")
        if not home or not away:
            continue
        try:
            hs, as_ = int(home.get("score")), int(away.get("score"))
        except (TypeError, ValueError):
            continue
        if hs < 0 or as_ < 0:
            continue
        out[(_espn_abbr((home.get("team") or {}).get("abbreviation")), _espn_abbr((away.get("team") or {}).get("abbreviation")))] = (hs, as_)
    return out


def merge_espn(result: dict, boards: dict[int, dict]) -> list[str]:
    """Fills in the final score of games nflverse has not recorded yet, from ESPN's scoreboard for the same week.

    nflverse can trail a finished game by hours, and everything downstream (the standings, the Playoff Machine, the Rooting Guide) is
    only as current as the games it is given. A score is taken from ESPN only when the matchup (same home and away team, same week)
    matches a game with no score and ESPN says it is final; a game nflverse already has is never overwritten. Returns the ids filled in.
    """
    filled: list[str] = []
    finals = {week: espn_finals(board) for week, board in boards.items()}
    for row in result["games"]:
        if "homeScore" in row:
            continue
        hit = finals.get(row["week"], {}).get((row["home"], row["away"]))
        if hit is None:
            continue
        row["homeScore"], row["awayScore"] = hit
        if row.get("spread") is None:
            row.pop("spread", None)
        filled.append(row["id"])
    if filled:
        played = [r for r in result["games"] if "homeScore" in r]
        result["played"] = len(played)
        result["throughWeek"] = max(r["week"] for r in played)
    result["espnFinals"] = sorted(filled)
    return filled


def fetch_boards(result: dict, today: str, opener=None) -> dict[int, dict]:
    """ESPN's scoreboard for every week that has a game dated today or earlier with no score. A week that cannot be read is skipped."""
    opener = opener or (lambda url: json.loads(urllib.request.urlopen(url, timeout=20).read()))  # noqa: S310 - fixed https URL
    weeks = sorted({r["week"] for r in result["games"] if "homeScore" not in r and r["date"] <= today})
    boards: dict[int, dict] = {}
    for week in weeks:
        try:
            boards[week] = opener(ESPN_URL.format(season=result["season"], week=week))
        except Exception as err:  # noqa: BLE001 - any failure just means ESPN adds nothing this run
            print(f"ESPN week {week} not read: {err}", file=sys.stderr)
    return boards


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
    ap.add_argument("--espn", action="store_true", help="fill in final scores nflverse has not recorded yet from ESPN's scoreboard")
    args = ap.parse_args(argv)

    try:
        result = build(_read(args.input or GAMES_URL), args.season)
    except ValueError as err:
        print(f"not writing a schedule: {err}", file=sys.stderr)
        return 1
    if args.espn:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filled = merge_espn(result, fetch_boards(result, today))
        if filled:
            print(f"ESPN supplied {len(filled)} final score(s) nflverse does not have yet: {', '.join(sorted(filled))}")

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
