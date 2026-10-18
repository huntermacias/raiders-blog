"""Week-by-week trail for the "Will it last?" pages: each team's stats and league ranks after each game it has played.

scouting.json only ever holds the latest numbers, so the page could not say how a team's verdict has moved week to week. This keeps
one snapshot per team per games-played count in data/lab/trail.json, so "after 3 games" stays exactly what it was after the third game.

    python scripts/lab/build_trail.py                 # add the current scouting numbers
    python scripts/lab/build_trail.py --from-git      # also replay every earlier version of scouting.json in git history (run once)

While a team has played n games the snapshot for n is overwritten by each later refresh, so it ends as the last numbers seen before its
next game. Nothing is ever deleted and the file only grows by one snapshot per team per week.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCOUTING = ROOT / "data" / "lab" / "scouting.json"
TRAIL = ROOT / "data" / "lab" / "trail.json"

# Must match STAT_DEFS in lib/lab/history.ts (a vitest keeps them honest).
BOTH = ["epaPass", "epaRush", "third", "redZone", "turnovers", "sackRate", "epa", "explosive", "points"]
KEYS = [f"off.{s}" for s in BOTH] + [f"def.{s}" for s in BOTH] + ["net.points", "net.turnovers"]


def snapshot(scouting: dict) -> dict[str, dict[str, list[float]]]:
    """{team: {key: [value, rank]}} for every team that has played a game; rank 1 is best."""
    teams = scouting.get("teams", {})
    out: dict[str, dict[str, list[float]]] = {}
    for abbr, t in teams.items():
        row: dict[str, list[float]] = {}
        for side in ("off", "def"):
            for stat in BOTH:
                m = t.get(side, {}).get(stat)
                if m is not None and m.get("v") is not None and m.get("rank") is not None:
                    row[f"{side}.{stat}"] = [m["v"], m["rank"]]
        out[abbr] = row

    def net_points(t: dict):
        a, b = t.get("off", {}).get("points"), t.get("def", {}).get("points")
        return a["v"] - b["v"] if a and b else None

    def net_turnovers(t: dict):
        a, b = t.get("def", {}).get("turnovers"), t.get("off", {}).get("turnovers")
        return a["v"] - b["v"] if a and b else None

    for key, fn in (("net.points", net_points), ("net.turnovers", net_turnovers)):
        vals = {abbr: fn(t) for abbr, t in teams.items()}
        everyone = [v for v in vals.values() if v is not None]
        for abbr, v in vals.items():
            if v is not None:
                out[abbr][key] = [round(v, 4), 1 + sum(1 for w in everyone if w > v)]
    return out


def load_trail(path: Path = TRAIL) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"keys": KEYS, "seasons": {}}


def add(trail: dict, scouting: dict) -> bool:
    """Fold one scouting file into the trail. True when anything changed."""
    season = str(scouting.get("season"))
    snap = snapshot(scouting)
    changed = False
    by_team = trail.setdefault("seasons", {}).setdefault(season, {})
    for abbr, t in scouting.get("teams", {}).items():
        g = t.get("g")
        if not isinstance(g, int) or g < 1 or not snap.get(abbr):
            continue
        slot = by_team.setdefault(abbr, {})
        if slot.get(str(g)) != snap[abbr]:
            slot[str(g)] = snap[abbr]
            changed = True
    if changed:
        trail["keys"] = KEYS
        trail["generatedAt"] = scouting.get("generatedAt") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return changed


def git_versions(rel: str = "data/lab/scouting.json", rev: str = "HEAD") -> list[dict]:
    """Every committed version of scouting.json reachable from `rev`, oldest first."""
    revs = subprocess.run(["git", "log", "--reverse", "--format=%H", rev, "--", rel], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    out = []
    for r in revs:
        p = subprocess.run(["git", "show", f"{r}:{rel}"], cwd=ROOT, capture_output=True, text=True)
        if p.returncode == 0:
            try:
                out.append(json.loads(p.stdout))
            except json.JSONDecodeError:
                pass
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-git", action="store_true", help="replay earlier versions of scouting.json from git first")
    ap.add_argument("--rev", default="HEAD", help="with --from-git: the commit or branch whose history to replay, and whose scouting.json is the current one")
    ap.add_argument("--scouting", default=str(SCOUTING))
    ap.add_argument("--out", default=str(TRAIL))
    a = ap.parse_args()
    out = Path(a.out)
    trail = load_trail(out)
    changed = False
    if a.from_git:
        for s in git_versions(rev=a.rev):
            changed |= add(trail, s)
        # The newest version is the one at `rev`, already folded in above; the working-tree file is not used.
    else:
        changed |= add(trail, json.loads(Path(a.scouting).read_text()))
    if changed or not out.exists():
        out.write_text(json.dumps(trail, separators=(",", ":"), sort_keys=True) + "\n")
        print(f"trail: wrote {out}")
    else:
        print("trail: nothing changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
