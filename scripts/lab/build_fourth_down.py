#!/usr/bin/env python3
"""Grade the Raiders' fourth-down decisions against what usually happens in similar spots.

Source: nflverse play-by-play (CC BY 4.0), https://github.com/nflverse/nflverse-data
Run:    python scripts/lab/build_fourth_down.py --season 2026 --team LV --history 2019-2025 \
            --out data/lab/fourth-down.json

How it works (an estimate, not a verdict):
  For every fourth down, look at the same choice (go for it, punt, kick a field goal) across the
  history seasons and average what happened to the offense's win probability afterwards, weighting
  each past play by how close it was to this one: yards to go, field position, score and time left.
  Going for it and kicking are split into "worked" and "didn't" so that the chance of working comes
  from every try in that spot, not just the ones teams chose to take. Even so, teams go for it
  mostly when it looks good, so the go-for-it numbers lean a little optimistic, and the page says so.
  A choice with too few similar plays behind it is not graded.

Penalty plays and plays in games that are already decided are left out.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SOURCE_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
LICENSE = "nflverse play-by-play data, CC BY 4.0. Estimates and edits by Raiders Rundown."

COLS = [
    "game_id", "week", "season_type", "home_team", "away_team", "posteam", "qtr", "time", "down", "ydstogo",
    "yardline_100", "score_differential", "game_seconds_remaining", "quarter_seconds_remaining", "play_type",
    "penalty", "fourth_down_converted", "field_goal_result", "home_wp_post", "away_wp_post", "home_wp",
    "away_wp", "desc", "play_id", "qb_kneel", "qb_spike",
]

# The estimate needs at least this much effective weight behind a choice before it is shown.
MIN_EFFECTIVE = 12.0
# A decision is only called a mistake when the best choice beats the one taken by at least this much win probability.
TOSS_UP = 0.015
COSTLY = 0.04
DECIDED = 0.03  # games already decided (win probability below 3% or above 97%) are not graded

CHOICES = ("go", "punt", "fg")


def _num(v, default=None):
    try:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _text(v) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    return str(v)


def elapsed(qtr: int, qsr: float) -> int:
    q = max(1, int(qtr))
    left = max(0.0, float(qsr))
    if q <= 4:
        return int(round((q - 1) * 900 + (900 - left)))
    return int(round(3600 + (q - 5) * 600 + (600 - left)))


def clean_desc(desc: str) -> str:
    text = re.sub(r"^\(\d{0,2}:\d{2}\)\s*", "", desc.strip())
    text = re.sub(r"^\((?:Shotgun|No Huddle|No Huddle, Shotgun)\)\s*", "", text)
    text = re.sub(r"(?<![\w])\d{1,2}-(?=[A-Z]\.[A-Za-z])", "", text)
    return re.sub(r"\s+", " ", text).strip()


def load_pbp(season: int, directory: str | None) -> pd.DataFrame:
    if directory:
        path = Path(directory) / f"pbp_{season}.csv.gz"
        return pd.read_csv(path, low_memory=False, usecols=lambda c: c in COLS)
    url = SOURCE_URL.format(season=season)
    with urllib.request.urlopen(url, timeout=180) as resp:  # noqa: S310 - fixed https URL
        data = gzip.decompress(resp.read())
    return pd.read_csv(io.BytesIO(data), low_memory=False, usecols=lambda c: c in COLS)


def fourth_downs(df: pd.DataFrame) -> pd.DataFrame:
    """Every real fourth-down choice, with the choice, whether it worked, and the offense's win probability after."""
    d = df[(df["down"] == 4) & df["play_type"].isin(["run", "pass", "punt", "field_goal"])].copy()
    d = d[d["penalty"].fillna(0) != 1]
    d = d[d["qb_kneel"].fillna(0) != 1] if "qb_kneel" in d else d
    d = d[d["qb_spike"].fillna(0) != 1] if "qb_spike" in d else d
    d = d.dropna(subset=["ydstogo", "yardline_100", "score_differential", "game_seconds_remaining", "home_wp_post", "away_wp_post"])
    d["choice"] = np.select([d["play_type"] == "punt", d["play_type"] == "field_goal"], ["punt", "fg"], default="go")
    d["worked"] = np.select(
        [d["choice"] == "go", d["choice"] == "fg"],
        [d["fourth_down_converted"].fillna(0) == 1, d["field_goal_result"].fillna("") == "made"],
        default=True,
    ).astype(bool)
    is_away = d["posteam"] == d["away_team"]
    d["wp_after"] = np.where(is_away, d["away_wp_post"], d["home_wp_post"]).astype(float)
    d["wp_before"] = np.where(is_away, d["away_wp"], d["home_wp"]).astype(float)
    return d.reset_index(drop=True)


class History:
    """The pool of past fourth downs the estimates are drawn from."""

    def __init__(self, plays: pd.DataFrame):
        self.p = plays
        self.ytg = plays["ydstogo"].to_numpy(float)
        self.yl = plays["yardline_100"].to_numpy(float)
        self.sd = plays["score_differential"].to_numpy(float)
        self.t = plays["game_seconds_remaining"].to_numpy(float)
        self.choice = plays["choice"].to_numpy()
        self.worked = plays["worked"].to_numpy(bool)
        self.wp = plays["wp_after"].to_numpy(float)

    def weights(self, ytg: float, yl: float, sd: float, t: float, full: bool) -> np.ndarray:
        """Kernel weights: how much each past play counts toward this spot.

        Yards to go and field position always count. The full version also matches the score and the
        time left. Time is compared on a square-root scale (the last minutes matter more than the
        minutes around them) and the score gets tighter as the clock runs down.
        """
        hy = 1.2 + 0.25 * ytg
        z = ((self.ytg - ytg) / hy) ** 2 + ((self.yl - yl) / 7.0) ** 2
        if full:
            hs = 3.0 + 5.0 * math.sqrt(max(t, 0.0) / 3600.0)
            z = z + ((self.sd - sd) / hs) ** 2 + ((np.sqrt(np.maximum(self.t, 0.0)) - math.sqrt(max(t, 0.0))) / 4.5) ** 2
        return np.exp(-0.5 * z)

    def estimate(self, choice: str, ytg: float, yl: float, sd: float, t: float) -> dict | None:
        """Expected win probability after `choice`, and how much history is behind it."""
        pick = self.choice == choice
        # Nobody punts while trailing in the last two and a half minutes; the few that do are not a
        # real option, so it is never offered there.
        if choice == "punt" and sd < 0 and t < 150:
            return None
        w_full = self.weights(ytg, yl, sd, t, True) * pick
        n_eff = float(w_full.sum() ** 2 / max(1e-9, (w_full**2).sum())) if w_full.sum() > 0 else 0.0
        if n_eff < MIN_EFFECTIVE or w_full.sum() < 3.0:
            return None
        # Most of the weight has to come from plays that really are like this one. Teams that are
        # behind late almost never punt, so a "punt" estimate there would be built from teams that
        # were ahead, which says nothing about the spot.
        hs = 3.0 + 5.0 * math.sqrt(max(t, 0.0) / 3600.0)
        near = (np.abs(self.sd - sd) <= 1.5 * hs) & (np.abs(np.sqrt(np.maximum(self.t, 0.0)) - math.sqrt(max(t, 0.0))) <= 1.5 * 4.5)
        if (near & pick).sum() < 8 or (w_full * near).sum() < 0.6 * w_full.sum():
            return None
        if choice == "punt":
            return {"wp": self._fit(w_full, ytg, yl, sd, t), "n": round(n_eff)}
        # go / fg: P(works) from every try in this spot (distance and field position only), then
        # the win probability after a success and after a failure from the fuller match.
        w_spot = self.weights(ytg, yl, sd, t, False) * pick
        if w_spot.sum() <= 0:
            return None
        p = float((w_spot * self.worked).sum() / w_spot.sum())
        ok = w_full * self.worked
        bad = w_full * ~self.worked
        # When one side is thin, widen to the spot-only weights for that side.
        wp_ok = self._mean(ok, w_spot * self.worked, ytg, yl, sd, t)
        wp_bad = self._mean(bad, w_spot * ~self.worked, ytg, yl, sd, t)
        if wp_ok is None or wp_bad is None:
            return None
        return {"wp": p * wp_ok + (1 - p) * wp_bad, "n": round(n_eff), "p": p}

    def _mean(self, w: np.ndarray, fallback: np.ndarray, ytg: float, yl: float, sd: float, t: float) -> float | None:
        use = w if w.sum() >= 1.5 else fallback
        return self._fit(use, ytg, yl, sd, t) if use.sum() > 0 else None

    def _fit(self, w: np.ndarray, ytg: float, yl: float, sd: float, t: float) -> float:
        """A weighted local-linear fit of win probability around this spot, read at the spot.

        A plain weighted average is pulled toward the neighbours' scores when they are not exactly
        this score (and late in a game one point is worth a lot), so the fit also learns how win
        probability slopes with the score, the clock and field position and reads off the middle.
        """
        keep = w > 1e-6
        if keep.sum() < 6:
            return float((w * self.wp).sum() / w.sum())
        ww = w[keep]
        hs = 3.0 + 5.0 * math.sqrt(max(t, 0.0) / 3600.0)
        X = np.column_stack([
            np.ones(keep.sum()),
            (self.sd[keep] - sd) / hs,
            (np.sqrt(np.maximum(self.t[keep], 0.0)) - math.sqrt(max(t, 0.0))) / 4.5,
            (self.yl[keep] - yl) / 7.0,
        ])
        y = self.wp[keep]
        A = X.T @ (X * ww[:, None]) + np.diag([0.0, 0.5, 0.5, 0.5]) * (ww.sum() * 0.02)
        try:
            beta = np.linalg.solve(A, X.T @ (ww * y))
        except np.linalg.LinAlgError:
            return float((ww * y).sum() / ww.sum())
        return float(min(1.0, max(0.0, beta[0])))


def verdict(cost: float | None, chosen_ok: bool) -> str | None:
    if not chosen_ok or cost is None:
        return None
    if cost <= 0:
        return "best"
    if cost < TOSS_UP:
        return "toss-up"
    if cost < COSTLY:
        return "questionable"
    return "costly"


def grade_game(game: pd.DataFrame, team: str, hist: History) -> dict | None:
    last = game.sort_values("play_id").iloc[-1]
    if "END GAME" not in _text(last.get("desc")).upper():
        return None
    mine = fourth_downs(game)
    mine = mine[mine["posteam"] == team].sort_values("play_id")
    is_home = last["home_team"] == team
    opp = last["away_team"] if is_home else last["home_team"]
    decisions = []
    for _, r in mine.iterrows():
        ytg, yl, sd, t = float(r["ydstogo"]), float(r["yardline_100"]), float(r["score_differential"]), float(r["game_seconds_remaining"])
        qtr = int(r["qtr"])
        clk = _text(r.get("time"))
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", clk)
        clk = f"{int(m.group(1))}:{m.group(2)}" if m else clk
        qsr = _num(r.get("quarter_seconds_remaining"), 0.0)
        wp_before = float(r["wp_before"]) if not math.isnan(r["wp_before"]) else None
        decided = wp_before is not None and (wp_before < DECIDED or wp_before > 1 - DECIDED)
        options = {}
        for c in CHOICES:
            est = hist.estimate(c, ytg, yl, sd, t)
            if est:
                options[c] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in est.items()}
        chosen = r["choice"]
        if chosen == "go":
            result = "converted" if r["worked"] else "failed"
        elif chosen == "fg":
            result = "made" if r["worked"] else "missed"
        else:
            result = "punted"
        best = max(options, key=lambda k: options[k]["wp"]) if options else None
        chosen_ok = chosen in options and not decided
        cost = (options[best]["wp"] - options[chosen]["wp"]) if best and chosen_ok else None
        decisions.append({
            "q": qtr,
            "clk": clk,
            "el": elapsed(qtr, qsr),
            "ytg": int(ytg),
            "yl": int(round(yl)),
            "sd": int(sd),
            "wp": None if wp_before is None else round(wp_before, 3),
            "text": clean_desc(_text(r["desc"])),
            "chosen": chosen,
            "result": result,
            "options": options,
            "best": best if chosen_ok else None,
            "cost": None if cost is None else round(max(0.0, cost), 4),
            "verdict": verdict(cost, chosen_ok),
        })
    return {
        "id": _text(last["game_id"]),
        "week": int(last["week"]),
        "opp": {"LA": "LAR"}.get(opp, opp),
        "decisions": decisions,
    }


def summarize(decisions: list[dict]) -> dict:
    graded = [d for d in decisions if d["verdict"]]
    return {
        "decisions": len(decisions),
        "graded": len(graded),
        "bestOrClose": sum(1 for d in graded if d["verdict"] in ("best", "toss-up")),
        "leftOnTable": round(sum(d["cost"] or 0 for d in graded if d["verdict"] in ("questionable", "costly")), 4),
    }


def parse_history(spec: str) -> list[int]:
    if "-" in spec:
        a, b = spec.split("-", 1)
        return list(range(int(a), int(b) + 1))
    return [int(x) for x in spec.split(",")]


def build(season_df: pd.DataFrame, history_dfs: list[pd.DataFrame], team: str, season: int, years: list[int]) -> dict:
    pool = pd.concat([fourth_downs(h) for h in history_dfs], ignore_index=True)
    hist = History(pool)
    mine = season_df[(season_df["home_team"] == team) | (season_df["away_team"] == team)]
    games = []
    for _, g in mine.groupby("game_id", sort=True):
        built = grade_game(g, team, hist)
        if built:
            built["summary"] = summarize(built["decisions"])
            games.append(built)
    games.sort(key=lambda x: x["week"])
    return {
        "season": season,
        "team": team,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "history": {"from": min(years), "to": max(years), "plays": int(len(pool))},
        "games": games,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--team", default="LV")
    ap.add_argument("--history", default="2019-2025", help="seasons to learn from, e.g. 2019-2025")
    ap.add_argument("--pbp-dir", help="directory holding pbp_<season>.csv.gz files instead of downloading")
    ap.add_argument("--out", default="data/lab/fourth-down.json")
    args = ap.parse_args(argv)

    years = [y for y in parse_history(args.history) if y != args.season]
    season_df = load_pbp(args.season, args.pbp_dir)
    history = [load_pbp(y, args.pbp_dir) for y in years]
    result = build(season_df, history, args.team, args.season, years)
    if not result["games"]:
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
    print(f"wrote {out} ({len(result['games'])} games, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
