#!/usr/bin/env python3
"""Refresh only the injury reports in data/lab/units.json.

The rest of units.json (grades, coaches, the slate) is rebuilt once a week by build_units.py. Injury reports move much
faster: the NFL posts them Wednesday to Saturday, and nflverse republishes them as they come out. This reads the same
nflverse injuries file, rebuilds each team's report the same way build_units.py does, and changes nothing else.

Run:    python scripts/lab/refresh_injuries.py --season 2026 --units data/lab/units.json

The file is written only when a team's report changed, so a scheduled run that finds nothing new makes no commit and
no deploy. When it does change, `injuriesUpdatedAt` records when, which the matchup pages show next to the report.

nflverse keeps only each player's latest practice status, not the Wednesday and Thursday ones, so each player also gets
a `trail`: an entry the first time this script sees him and another every time his status changes. Run every few hours
through the week, that gives "Wed DNP, Thu Limited, Fri Full" from our own looks at the file.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_units as b  # noqa: E402


def load(season: int, folder: str | None) -> dict:
    """The three files the report needs: the injuries themselves, the roster (to match ids) and snap counts (who starts)."""
    names = {"injuries": f"injuries_{season}.csv", "roster": f"roster_{season}.csv", "snaps": f"snap_counts_{season}.csv"}
    out = {}
    for key, fname in names.items():
        where = str(Path(folder) / fname) if folder else b.URLS[key].format(season=season)
        out[key] = b._read(where)
    return out


def refresh(units: dict, src: dict, now: str) -> tuple[dict, list[str]]:
    """The units data with each team's injury report replaced by the latest one, and the teams whose report changed."""
    report = b.injury_report(src["injuries"], src["roster"], b.snap_shares(src["snaps"]))
    changed: list[str] = []
    teams = {}
    for team, data in units["teams"].items():
        new = b.carry_trails(data.get("injuries"), report.get(team, {"week": None, "players": []}), now)
        if data.get("injuries") != new:
            changed.append(team)
        teams[team] = {**data, "injuries": new}
    out = {**units, "teams": teams}
    if changed:
        out["injuriesUpdatedAt"] = now
    return out, changed


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--units", default="data/lab/units.json")
    ap.add_argument("--input", help="folder with the source files instead of downloading them")
    args = ap.parse_args(argv)

    path = Path(args.units)
    if not path.exists():
        print(f"{path} does not exist; run build_units.py first", file=sys.stderr)
        return 1
    units = json.loads(path.read_text())
    if units.get("season") != args.season:
        print(f"{path} is for season {units.get('season')}, not {args.season}; leaving it alone", file=sys.stderr)
        return 0

    src = load(args.season, args.input)
    if src["injuries"].empty:
        # A download that came back empty is not a report with nobody on it. Keep what we have.
        print("the injuries file is empty; leaving the existing reports alone", file=sys.stderr)
        return 0

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out, changed = refresh(units, src, now)
    if not changed:
        print("injury reports unchanged")
        return 0
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"updated the injury reports for {len(changed)} teams: {', '.join(sorted(changed))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
