#!/usr/bin/env python3
"""Build the history behind "Will it last?".

Source: nflverse play-by-play (CC BY 4.0), https://github.com/nflverse/nflverse-data
Run:    python scripts/lab/build_history.py --from 1999 --to 2025 --out data/lab/history.json
        (add --cache <folder> to reuse play_by_play_<season>.csv.gz files you already have)

For every team in every finished season since 1999, and for each point early in the year (after 3, 4, ...
12 games), this records a handful of team stats over those first games and the same stats over the rest of
that season. The page lines the 2026 Raiders up against that history: teams that started the way they did,
and what happened to them next.

The numbers are the ones the scouting reports use (build_scouting.team_side), so a stat means the same
thing in both places. Those seasons are finished, so this file does not need a weekly refresh. It only needs
another year added when a season ends.

File layout, to keep it small (it is read on the server only):
  teams[i]            "2007 NE": the row every list below is indexed by
  po[i], wins[i]      made the playoffs (0/1), final regular-season wins
  stats               the stat keys, "off.epaPass" ...
  losses[i]           final regular-season losses (a season with ties has wins + losses below the games played)
  n["4"].w[i], .l[i]  wins and losses after 4 games
  n["4"].s[key][i]    the stat over the first 4 games, times 1000, rounded; null when it could not be measured
  n["4"].r[key][i]    the same stat over the rest of the season
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_scouting as bs  # noqa: E402

LICENSE = "nflverse play-by-play data, CC BY 4.0. Calculations by Raiders Rundown."

# The stats worth asking "will it last?" about. Each is a stat build_scouting already ranks; whether higher is
# better for it comes from there too.
STATS = [
    ("off", "epa"), ("off", "epaPass"), ("off", "epaRush"), ("off", "third"), ("off", "redZone"), ("off", "turnovers"), ("off", "sackRate"), ("off", "explosive"), ("off", "points"),
    ("def", "epa"), ("def", "epaPass"), ("def", "epaRush"), ("def", "third"), ("def", "redZone"), ("def", "turnovers"), ("def", "sackRate"), ("def", "explosive"), ("def", "points"),
]
KEYS = [f"{side}.{k}" for side, k in STATS]
# Early-season checkpoints: games played. The rest of the season is at least four games after the last one.
CHECKPOINTS = list(range(3, 13))
SCALE = 1000


def _scaled(v: float | None) -> int | None:
    if v is None or v != v:  # None or NaN
        return None
    return int(round(v * SCALE))


COLS = bs.COLS + ["home_score", "away_score"]


def game_scores(reg_all: pd.DataFrame) -> pd.DataFrame:
    """One row per team per finished game: points for and against.

    Older seasons are missing the closing "END GAME" row for some games, which build_scouting.final_scores
    needs, so this reads the final score nflverse stamps on every play of a game when it is there.
    """
    if not {"home_score", "away_score"} <= set(reg_all.columns):
        return bs.final_scores(reg_all)
    g = reg_all.dropna(subset=["home_score", "away_score"]).groupby("game_id").agg(
        home=("home_team", "first"), away=("away_team", "first"), hs=("home_score", "first"), a_s=("away_score", "first")
    )
    rows = []
    for gid, r in g.iterrows():
        rows.append({"team": r["home"], "game": gid, "for": int(r["hs"]), "against": int(r["a_s"])})
        rows.append({"team": r["away"], "game": gid, "for": int(r["a_s"]), "against": int(r["hs"])})
    return pd.DataFrame(rows, columns=["team", "game", "for", "against"])


def team_rows(season_df: pd.DataFrame) -> list[dict]:
    """One dict per team in one finished season: playoffs, wins, and per-checkpoint start/rest stats."""
    df = season_df.copy()
    for col in ("home_team", "away_team", "posteam", "defteam"):
        if col in df:
            df[col] = df[col].replace(bs.SITE_ABBR)
    post_teams = set(df[df["season_type"] == "POST"]["posteam"].dropna())
    reg_all = df[df["season_type"] == "REG"]
    scores = game_scores(reg_all)
    if scores.empty:
        return []
    reg = reg_all[reg_all["penalty"].fillna(0) != 1] if "penalty" in reg_all else reg_all
    week_of = reg_all.groupby("game_id")["week"].first()
    out: list[dict] = []
    for team in sorted(set(scores["team"])):
        tg = scores[scores["team"] == team].copy()
        tg["week"] = tg["game"].map(week_of)
        tg = tg.sort_values("week").reset_index(drop=True)
        if len(tg) < max(CHECKPOINTS) + 4:
            continue
        mine = reg[(reg["posteam"] == team) | (reg["defteam"] == team)]
        won = (tg["for"] > tg["against"]).astype(int)
        lost = (tg["for"] < tg["against"]).astype(int)
        row = {"team": team, "po": int(team in post_teams), "wins": int(won.sum()), "losses": int(lost.sum()), "n": {}}
        for n in CHECKPOINTS:
            first, rest = tg.iloc[:n], tg.iloc[n:]
            start = {s: bs.team_side(mine[mine["game_id"].isin(set(first["game"]))], n, first, s, team) for s in ("off", "def")}
            end = {s: bs.team_side(mine[mine["game_id"].isin(set(rest["game"]))], len(rest), rest, s, team) for s in ("off", "def")}
            row["n"][n] = {
                "w": int(won.iloc[:n].sum()),
                "l": int(lost.iloc[:n].sum()),
                "s": {f"{s}.{k}": _scaled(start[s][k]) for s, k in STATS},
                "r": {f"{s}.{k}": _scaled(end[s][k]) for s, k in STATS},
            }
        out.append(row)
    return out


def assemble(seasons: dict[int, list[dict]]) -> dict:
    labels: list[str] = []
    po: list[int] = []
    wins: list[int] = []
    losses: list[int] = []
    n_block: dict[str, dict] = {str(n): {"w": [], "l": [], "s": {k: [] for k in KEYS}, "r": {k: [] for k in KEYS}} for n in CHECKPOINTS}
    for season in sorted(seasons):
        for r in seasons[season]:
            labels.append(f"{season} {r['team']}")
            po.append(r["po"])
            wins.append(r["wins"])
            losses.append(r["losses"])
            for n in CHECKPOINTS:
                b, src = n_block[str(n)], r["n"][n]
                b["w"].append(src["w"])
                b["l"].append(src["l"])
                for k in KEYS:
                    b["s"][k].append(src["s"][k])
                    b["r"][k].append(src["r"][k])
    return {
        "source": LICENSE,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "first": min(seasons) if seasons else None,
        "last": max(seasons) if seasons else None,
        "scale": SCALE,
        "teams": labels,
        "po": po,
        "wins": wins,
        "losses": losses,
        "stats": KEYS,
        "n": n_block,
    }


def load_season(season: int, cache: str | None) -> pd.DataFrame:
    if cache:
        path = Path(cache) / f"play_by_play_{season}.csv.gz"
        if path.exists():
            return pd.read_csv(path, low_memory=False, usecols=lambda c: c in COLS)
    url = bs.SOURCE_URL.format(season=season)
    with urllib.request.urlopen(url, timeout=300) as resp:  # noqa: S310 - fixed https URL
        data = gzip.decompress(resp.read())
    return pd.read_csv(io.BytesIO(data), low_memory=False, usecols=lambda c: c in COLS)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="first", type=int, default=1999)
    ap.add_argument("--to", dest="last", type=int, required=True, help="the last finished season")
    ap.add_argument("--cache", help="folder with play_by_play_<season>.csv.gz files to use before downloading")
    ap.add_argument("--out", default="data/lab/history.json")
    args = ap.parse_args(argv)

    seasons: dict[int, list[dict]] = {}
    for season in range(args.first, args.last + 1):
        seasons[season] = team_rows(load_season(season, args.cache))
        print(f"{season}: {len(seasons[season])} teams", file=sys.stderr)
    result = assemble(seasons)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {out} ({len(result['teams'])} team-seasons, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
