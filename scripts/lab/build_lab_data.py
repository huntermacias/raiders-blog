#!/usr/bin/env python3
"""Build the JSON that powers the /lab replays from nflverse play-by-play data.

Source: nflverse play-by-play (CC BY 4.0), https://github.com/nflverse/nflverse-data
Run:    python scripts/lab/build_lab_data.py --season 2026 --team LV --out data/lab/season.json

Only finished games are written (the final row of a finished game is "END GAME").
The output is deterministic apart from `generatedAt`, so a weekly run only
produces a git diff when a new game has finished.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SOURCE_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
LICENSE = "nflverse play-by-play data, CC BY 4.0. Charts and edits by Raiders Rundown."

TEAM_NAMES = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers",
    "CHI": "Bears", "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos",
    "DET": "Lions", "GB": "Packers", "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars",
    "KC": "Chiefs", "LA": "Rams", "LAC": "Chargers", "LV": "Raiders", "MIA": "Dolphins",
    "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants", "NYJ": "Jets",
    "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers",
    "TEN": "Titans", "WAS": "Commanders",
}

SCRIMMAGE = {"run", "pass", "punt", "field_goal", "qb_kneel", "qb_spike", "no_play"}
REGULATION_SECONDS = 3600
OT_SECONDS = 600


def _num(value, default=None):
    """NaN-safe number."""
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value, default=0):
    n = _num(value)
    return default if n is None else int(round(n))


def _text(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value)


def elapsed_seconds(qtr: int, quarter_seconds_remaining: float) -> int:
    """Seconds of game time elapsed. Overtime continues past 3600."""
    q = max(1, int(qtr))
    left = max(0.0, float(quarter_seconds_remaining))
    if q <= 4:
        return int(round((q - 1) * 900 + (900 - left)))
    return int(round(REGULATION_SECONDS + (q - 5) * OT_SECONDS + (OT_SECONDS - left)))


def clean_desc(desc: str) -> str:
    """Drop the leading clock and shotgun/no-huddle tags; keep the sentence."""
    text = re.sub(r"^\(\d{0,2}:\d{2}\)\s*", "", desc.strip())
    text = re.sub(r"^\((?:Shotgun|No Huddle|No Huddle, Shotgun)\)\s*", "", text)
    # "6-T.Shough" -> "T.Shough": jersey numbers are noise on a fan-facing page.
    text = re.sub(r"(?<![\w])\d{1,2}-(?=[A-Z]\.[A-Za-z])", "", text)
    return re.sub(r"\s+", " ", text).strip()


def lv_wp(row, team: str, when: str = "pre"):
    """Win probability from the chosen team's point of view."""
    home = row["home_team"] == team
    col = ("home_wp" if home else "away_wp") if when == "pre" else ("home_wp_post" if home else "away_wp_post")
    return _num(row.get(col))


LANES = {"left": "L", "middle": "M", "right": "R"}
GAPS = {"end": "E", "tackle": "T", "guard": "G"}


def lane_fields(row, ptype: str) -> dict:
    """Which third of the field a play went to, from the play log (no player-location data is involved).

    nflverse records run_location / pass_location as left, middle or right from the offense's
    point of view, and for runs a gap (end, tackle, guard). Passes also carry air yards and
    yards after the catch. Keys are left out when the log has no value.
    """
    out: dict = {}
    if ptype == "run":
        lane = LANES.get(_text(row.get("run_location")))
        gap = GAPS.get(_text(row.get("run_gap")))
        if lane:
            out["loc"] = lane
        if gap:
            out["gap"] = gap
    elif ptype == "pass":
        lane = LANES.get(_text(row.get("pass_location")))
        if lane:
            out["loc"] = lane
        ay = _num(row.get("air_yards"))
        if ay is not None:
            out["ay"] = int(round(ay))
        yac = _num(row.get("yards_after_catch"))
        if yac is not None:
            out["yac"] = int(round(yac))
    return out



def build_game(g: pd.DataFrame, team: str) -> dict | None:
    g = g.sort_values("play_id").reset_index(drop=True)
    last = g.iloc[-1]
    if "END GAME" not in _text(last.get("desc")).upper():
        return None  # unfinished or not started

    home = last["home_team"]
    away = last["away_team"]
    is_home = home == team
    opp = away if is_home else home
    team_score = _int(last["home_score"] if is_home else last["away_score"])
    opp_score = _int(last["away_score"] if is_home else last["home_score"])

    plays = g[g["play_type"].notna()].reset_index(drop=True)

    # --- win probability series (team's perspective) -----------------------
    series = []
    prev_el = -1
    for _, r in plays.iterrows():
        wp = lv_wp(r, team, "pre")
        if wp is None:
            continue
        el = elapsed_seconds(_int(r["qtr"], 1), _num(r["quarter_seconds_remaining"], 900))
        el = max(el, prev_el)  # never go backwards
        series.append([el, round(wp, 4)])
        prev_el = el
    end_el = max(prev_el, REGULATION_SECONDS)
    final_wp = 1.0 if team_score > opp_score else (0.0 if team_score < opp_score else 0.5)
    series.append([end_el, final_wp])

    # --- events -------------------------------------------------------------
    prev_team, prev_opp = 0, 0
    events = []
    score_log = []  # [elapsed, team score, opponent score] every time either changes
    for idx, r in plays.iterrows():
        # Non-scrimmage rows (timeouts, quarter ends) can carry a stale score.
        # Scores never go down, so a running max keeps them honest.
        t_score = max(prev_team, _int(r["total_home_score"] if is_home else r["total_away_score"]))
        o_score = max(prev_opp, _int(r["total_away_score"] if is_home else r["total_home_score"]))
        pre = lv_wp(r, team, "pre")
        post = lv_wp(r, team, "post")
        kind = None
        scorer = None
        if t_score > prev_team:
            scorer = team
        elif o_score > prev_opp:
            scorer = opp
        if scorer:
            pts = (t_score - prev_team) if scorer == team else (o_score - prev_opp)
            if _int(r.get("touchdown")) == 1 or pts >= 6:
                kind = "TD"
            elif _text(r.get("field_goal_result")).lower() == "made" or pts == 3:
                kind = "FG"
            elif pts == 2:
                kind = "SAF" if _int(r.get("safety")) == 1 else "2PT"
        if kind is None and _text(r["play_type"]) not in ("extra_point", "kickoff"):
            if _int(r.get("interception")) == 1:
                kind = "INT"
            elif _int(r.get("fumble_lost")) == 1:
                kind = "FUM"
        if (t_score, o_score) != (prev_team, prev_opp):
            score_log.append([
                elapsed_seconds(_int(r["qtr"], 1), _num(r["quarter_seconds_remaining"], 900)),
                t_score,
                o_score,
            ])
        swing = None if pre is None or post is None else post - pre
        plays_ok = _text(r["play_type"]) in SCRIMMAGE
        events.append({
            "idx": int(idx), "kind": kind, "scorer": scorer, "swing": swing, "play": plays_ok,
            "row": r, "pre": pre, "post": post, "score": [t_score, o_score],
        })
        prev_team, prev_opp = t_score, o_score

    big = sorted(
        [e for e in events if e["swing"] is not None and e["play"] and e["kind"] is None],
        key=lambda e: abs(e["swing"]),
        reverse=True,
    )[:5]
    chosen = {e["idx"]: e for e in events if e["kind"] in ("TD", "FG", "SAF", "2PT", "INT", "FUM")}
    for e in big:
        if abs(e["swing"]) >= 0.08:
            e["kind"] = "BIG"
            chosen[e["idx"]] = e

    key_plays = []
    for idx in sorted(chosen):
        e = chosen[idx]
        r = e["row"]
        el = elapsed_seconds(_int(r["qtr"], 1), _num(r["quarter_seconds_remaining"], 900))
        key_plays.append({
            "el": el,
            "q": _int(r["qtr"], 1),
            "clock": _text(r["time"]),
            "kind": e["kind"],
            "team": e["scorer"] or _text(r["posteam"]) or None,
            "wpBefore": None if e["pre"] is None else round(e["pre"], 4),
            "wpAfter": None if e["post"] is None else round(e["post"], 4),
            "text": clean_desc(_text(r["desc"])),
            "score": e["score"],
        })

    if not score_log or score_log[-1][1:] != [team_score, opp_score]:
        score_log.append([end_el, team_score, opp_score])

    # --- drives -------------------------------------------------------------
    drives = []
    for _, d in plays[plays["play_type"].isin(SCRIMMAGE)].groupby("fixed_drive", sort=True):
        d = d[d["posteam"].notna()]
        if d.empty:
            continue
        rows = d.to_dict("records")
        out_plays = []
        for i, r in enumerate(rows):
            yl = _num(r.get("yardline_100"))
            if yl is None:
                continue
            x = round(100 - yl, 1)
            ptype = _text(r["play_type"])
            yds = _int(r.get("yards_gained"))
            nxt = _num(rows[i + 1].get("yardline_100")) if i + 1 < len(rows) else None
            if _int(r.get("touchdown")) == 1 and _text(r.get("posteam")) == _text(r.get("td_team")):
                xe = 100.0
            elif ptype in ("punt", "field_goal"):
                xe = None
            elif nxt is not None:
                xe = round(100 - nxt, 1)
            else:
                xe = round(min(100.0, max(0.0, x + yds)), 1)
            play = {
                "n": i + 1,
                "dn": _int(r.get("down"), 0) or None,
                "ytg": _int(r.get("ydstogo"), 0),
                "x": x,
                "xe": xe,
                "yds": yds,
                "type": ptype,
                "fd": _int(r.get("first_down")) == 1,
                "td": _int(r.get("touchdown")) == 1,
                "text": clean_desc(_text(r["desc"])),
            }
            play.update(lane_fields(r, ptype))
            out_plays.append(play)
        if not out_plays:
            continue
        first = rows[0]
        result = _text(first.get("fixed_drive_result")) or "Unknown"
        drives.append({
            "n": len(drives) + 1,
            "team": _text(first["posteam"]),
            "q": _int(first["qtr"], 1),
            "clock": _text(first["time"]),
            "result": result,
            "start": out_plays[0]["x"],
            "yards": sum(max(0, p["yds"]) for p in out_plays if p["type"] in ("run", "pass")),
            "plays": out_plays,
            "top": _text(first.get("drive_time_of_possession")) or None,
        })

    return {
        "id": _text(last["game_id"]),
        "week": _int(last["week"]),
        "date": _text(last.get("game_date")),
        "home": bool(is_home),
        "opp": opp,
        "oppName": TEAM_NAMES.get(opp, opp),
        "score": [team_score, opp_score],
        "result": "W" if team_score > opp_score else ("L" if team_score < opp_score else "T"),
        "spread": _num(last.get("spread_line")),  # nflverse: points the home team is favored by
        "roof": _text(last.get("roof")) or None,
        "wp": series,
        "scores": score_log,
        "keyPlays": key_plays,
        "drives": drives,
    }


def build_season(df: pd.DataFrame, team: str, season: int) -> dict:
    mine = df[(df["home_team"] == team) | (df["away_team"] == team)]
    games = []
    for _, g in mine.groupby("game_id", sort=True):
        built = build_game(g, team)
        if built:
            games.append(built)
    games.sort(key=lambda x: x["week"])
    return {
        "season": season,
        "team": team,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "games": games,
    }


def load_pbp(season: int, path: str | None) -> pd.DataFrame:
    if path:
        return pd.read_csv(path, low_memory=False)
    url = SOURCE_URL.format(season=season)
    with urllib.request.urlopen(url, timeout=120) as resp:  # noqa: S310 - fixed https URL
        import gzip
        import io
        return pd.read_csv(io.BytesIO(gzip.decompress(resp.read())), low_memory=False)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--team", default="LV")
    ap.add_argument("--input", help="local play-by-play csv or csv.gz instead of downloading")
    ap.add_argument("--out", default="data/lab/season.json")
    args = ap.parse_args(argv)

    df = load_pbp(args.season, args.input)
    season = build_season(df, args.team, args.season)
    if not season["games"]:
        print("no finished games found; leaving the existing file alone", file=sys.stderr)
        return 0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    # Keep the old timestamp when nothing else changed so a weekly run is a no-op diff.
    if out.exists():
        try:
            old = json.loads(out.read_text())
            if {**old, "generatedAt": ""} == {**season, "generatedAt": ""}:
                print("data unchanged")
                return 0
        except json.JSONDecodeError:
            pass
    out.write_text(json.dumps(season, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {out} ({len(season['games'])} games, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
