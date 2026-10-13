#!/usr/bin/env python3
"""Build the player pages behind /lab/players: every qualifying player in the league, measured the same way.

Sources (nflverse, CC BY 4.0): play-by-play, FTN charting, PFR advanced stats, snap counts, rosters.
Run:    python scripts/lab/build_players.py --season 2026 --out data/lab/players.json

Writes two files. `players.json` holds one row per player per role (a quarterback, a punt returner) with everything a card needs:
the value, how much volume is behind it, how uncertain it is, where it ranks, and the league's yardstick for it. `player-logs.json`
holds the game-by-game trail for the progression charts, which only the player pages need.

A player is only ever compared with players who do the same job. Every stat is a numerator over a denominator (EPA over dropbacks,
say), so any slice of games is a sum over a sum and not an average of averages. Three slices:

    season   every finished game so far
    form     the player's team's last FORM_GAMES finished games
    earlier  everything before that

Each slice is graded against the league's players in the same group who had enough volume in that slice, on the scouting scale: 50
is the average, every 10 points is one standard deviation, and for a stat where lower is better the scale is flipped so a higher
grade is always better. The grade has no ceiling, so a player already at the top can still be seen getting better.

Every number also carries its own uncertainty (a standard error from the kind of stat it is) and every change is tested against
it, so a swing that a handful of plays could produce is labelled as noise instead of being sold as a trend.

A mover is the volume-weighted average change in grade from `earlier` to `form`. Style stats (how deep he throws, how often he
runs to the edge) are shown with the same league yardstick but are neither good nor bad, so they never move a player up or down.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import re
import sys
import unicodedata
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from situations import build_situations

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
URLS = {
    "pbp": BASE + "/pbp/play_by_play_{season}.csv.gz",
    "roster": BASE + "/rosters/roster_{season}.csv",
    "snaps": BASE + "/snap_counts/snap_counts_{season}.csv",
    "pass": BASE + "/pfr_advstats/advstats_week_pass_{season}.csv",
    "rush": BASE + "/pfr_advstats/advstats_week_rush_{season}.csv",
    "rec": BASE + "/pfr_advstats/advstats_week_rec_{season}.csv",
    "defense": BASE + "/pfr_advstats/advstats_week_def_{season}.csv",
    "ftn": BASE + "/ftn_charting/ftn_charting_{season}.csv",
}
FILES = {
    "pbp": "play_by_play_{season}.csv.gz", "roster": "roster_{season}.csv", "snaps": "snap_counts_{season}.csv",
    "pass": "advstats_week_pass_{season}.csv", "rush": "advstats_week_rush_{season}.csv",
    "rec": "advstats_week_rec_{season}.csv", "defense": "advstats_week_def_{season}.csv",
    "ftn": "ftn_charting_{season}.csv",
}
# The charting file is a bonus: a tendency or two disappear without it, nothing else does.
OPTIONAL = {"ftn"}
LICENSE = "nflverse data (play-by-play, FTN charting, PFR advanced stats, snap counts, rosters), CC BY 4.0. Calculations by Raiders Rundown."

SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}

# How many of a team's latest games make up "form": at least two, and about a third of the games played, so that late in the year
# "lately" means a real stretch of the season rather than a pair of games, and the move reads as the season's growth or slide.
FORM_GAMES = 2


def form_size(played: int) -> int:
    return max(FORM_GAMES, round(played / 3))
SLICES = ("season", "form", "earlier")
# Two players this close in grade on the stats they share are "comparable".
LIKE_N = 4

# depth-chart position -> group. The depth chart tells a three-technique from an edge rusher; the coarse position does not.
DEPTH_GROUP = {
    "QB": "qb", "RB": "rb", "FB": "rb", "HB": "rb", "WR": "wr", "TE": "te",
    "DE": "edge", "OLB": "edge", "EDGE": "edge", "DT": "idl", "NT": "idl",
    "ILB": "lb", "MLB": "lb", "LB": "lb", "CB": "cb", "FS": "saf", "SS": "saf", "S": "saf", "K": "k", "P": "p",
    "T": "ol", "G": "ol", "C": "ol", "OT": "ol", "OG": "ol", "OL": "ol", "LT": "ol", "RT": "ol", "LG": "ol", "RG": "ol",
}
# The same for the coarse roster/snap-count positions; DL and DB say too little and are left for the snap-count position to settle.
COARSE_GROUP = {k: v for k, v in DEPTH_GROUP.items()}

SIDE_OF = {
    "qb": "off", "rb": "off", "wr": "off", "te": "off", "ol": "off",
    "edge": "def", "idl": "def", "lb": "def", "cb": "def", "saf": "def",
    "k": "st", "p": "st", "pr": "st", "kr": "st",
}
GROUP_ORDER = ["qb", "rb", "wr", "te", "ol", "edge", "idl", "lb", "cb", "saf", "k", "p", "pr", "kr"]


@dataclass(frozen=True)
class Stat:
    """One number on a card.

    num / den    columns of the per-game component table; the stat is sum(num) / sum(den) * scale over any slice of games
    higher       True when more is better, False when less is better, None for a style stat that is neither
    need         volume (of `den`) a player needs to be graded: whole season, recent form, earlier games
    counts       False when the stat is shown and graded but left out of the mover score (it is mostly zeros, or a unit's)
    unit         True when the number belongs to a whole unit, not to him: it is also left out of the similar-player match
    gate         a column to measure the volume by instead of `den`, when `den` is not what a reader would call the sample
                 (a receiver's share of the team's passes is over the team's attempts, but it is his targets that make it a sample)
    calc         a name in CALC for a stat that is not num / den. Passer rating has caps on each part, so a season's rating is the
                 rating of the season's summed line, never an average of the weekly ratings
    se           how to size the uncertainty: "binom" (a rate), "poisson" (a count per opportunity), or a number, the
                 standard deviation of one play, so the standard error is that over the square root of the volume
    """

    num: str
    den: str
    higher: bool | None
    need: tuple[float, float, float]
    scale: float = 1.0
    counts: bool = True
    unit: bool = False
    se: object = "binom"
    gate: str | None = None
    calc: str | None = None


@dataclass(frozen=True)
class Group:
    stats: dict
    headline: str
    min_stats: int


QB_V = (40, 25, 20)
REC_V = (12, 5, 6)
RUN_V = (20, 8, 10)
SNAP_V = (80, 40, 40)
MISS_V = (10, 5, 5)
TGT_V = (10, 6, 6)
FGA_V = (6, 3, 3)
XP_V = (8, 4, 4)
KO_V = (10, 5, 5)
PUNT_V = (8, 4, 4)
RET_V = (5, 3, 3)
OL_V = (150, 60, 60)
LINE_PASS_V = (60, 30, 30)
LINE_RUN_V = (40, 20, 20)


def _rec_stats() -> dict:
    return {
        "epaTgt": Stat("epa", "tgt", True, REC_V, se=1.55),
        "croe": Stat("croe", "croe_n", True, REC_V, se=0.44),
        "yacOe": Stat("yacoe", "yacoe_n", True, (8, 3, 4), se=6.0),
        "drop": Stat("drop", "tgt_p", False, REC_V, counts=False),
        "share": Stat("tgt", "team_att", True, REC_V, gate="tgt"),
        "adot": Stat("air", "air_n", None, REC_V, se=10.5),
        "deepRate": Stat("deep", "air_n", None, REC_V),
        "contested": Stat("contested", "ftn_t", None, REC_V),
        "screen": Stat("screen", "ftn_t", None, REC_V),
    }


def _edge_stats() -> dict:
    return {
        "pressRate": Stat("press_s", "snaps_s", True, SNAP_V, scale=100.0, se="poisson"),
        "sackRate": Stat("sacks_s", "snaps_s", True, SNAP_V, scale=100.0, counts=False, se="poisson"),
        "tflRate": Stat("tfl_s", "snaps_s", True, SNAP_V, scale=100.0, se="poisson"),
        "missedPct": Stat("missed", "tackle_chances", False, MISS_V),
    }


def _db_stats() -> dict:
    return {
        "yardsTgt": Stat("yds", "tgts", False, TGT_V, se=9.5),
        "rating": Stat("tgts", "tgts", False, TGT_V, se=55.0, calc="rating"),
        "compPct": Stat("cmp", "tgts", False, TGT_V),
        "pbuRate": Stat("pbu_p", "tgts", True, TGT_V),
        "missedPct": Stat("missed", "tackle_chances", False, MISS_V),
        "adotAgainst": Stat("adot_sum", "tgts", None, TGT_V, se=10.5),
    }


GROUPS: dict[str, Group] = {
    "qb": Group({
        "epaDb": Stat("epa", "db", True, QB_V, se=1.54),
        "success": Stat("succ", "db", True, QB_V),
        "cpoe": Stat("cpoe", "cpoe_n", True, QB_V, se=43.9),
        "badThrow": Stat("bad", "att_p", False, QB_V),
        "sackRate": Stat("sck", "db", False, QB_V, counts=False),
        "adot": Stat("air", "air_n", None, QB_V, se=10.5),
        "deepRate": Stat("deep", "air_n", None, QB_V),
        "paRate": Stat("pa", "ftn_n", None, QB_V),
        "blitzSeen": Stat("blz", "ftn_n", None, QB_V),
        "oopRate": Stat("oop", "ftn_n", None, QB_V),
    }, "epaDb", 2),
    "rb": Group({
        "epaRush": Stat("epa", "car", True, RUN_V, se=0.98),
        "success": Stat("succ", "car", True, RUN_V),
        "explosive": Stat("expl", "car", True, RUN_V),
        "yco": Stat("yco", "pfr_car", True, RUN_V, se=3.0),
        "broken": Stat("broken", "pfr_car", True, RUN_V, se="poisson"),
        "stuffRate": Stat("stuff", "car", False, RUN_V, counts=False),
        "ybc": Stat("ybc", "pfr_car", None, RUN_V, se=2.5),
        "edgeRate": Stat("edge", "gap_n", None, RUN_V),
        "gunRate": Stat("gun", "car", None, RUN_V),
    }, "epaRush", 2),
    # Offensive linemen. The public data has no blocking results for a single player, so this group is built from what it does have:
    # who was flagged, and what his whole line did in the games he started. The line's two numbers are shared by the five who start
    # together, and the page says so.
    "ol": Group({
        # The line's two numbers are graded (they are shown, ranked on their board and tracked by week) but never counted toward a
        # lineman's own movement or overall: the five who start together share them, so they grade the unit, not the man.
        "sackRate": Stat("u_sck", "u_db", False, LINE_PASS_V, counts=False, unit=True),
        "runSucc": Stat("u_rs", "u_run", True, LINE_RUN_V, counts=False, unit=True),
        "penRate": Stat("pen", "snaps", False, OL_V, scale=1000.0, se="poisson"),
        "holdRate": Stat("hold", "snaps", False, OL_V, scale=1000.0, counts=False, se="poisson"),
        "fsRate": Stat("fs", "snaps", False, OL_V, scale=1000.0, counts=False, se="poisson"),
        "snapShare": Stat("snaps", "tsn", None, OL_V),
    }, "runSucc", 2),
    "wr": Group(_rec_stats(), "epaTgt", 2),
    "te": Group(_rec_stats(), "epaTgt", 2),
    "edge": Group(_edge_stats(), "pressRate", 2),
    "idl": Group(_edge_stats(), "pressRate", 2),
    "lb": Group({
        "missedPct": Stat("missed", "tackle_chances", False, MISS_V),
        "tackleRate": Stat("tackles_s", "snaps_s", True, SNAP_V, scale=100.0, se="poisson"),
        "tflRate": Stat("tfl_s", "snaps_s", True, SNAP_V, scale=100.0, se="poisson"),
        "pressRate": Stat("press_s", "snaps_s", None, SNAP_V, scale=100.0, se="poisson"),
        "yardsTgt": Stat("yds", "tgts", False, (12, 6, 6), se=9.5),
    }, "missedPct", 2),
    "cb": Group(_db_stats(), "yardsTgt", 2),
    "saf": Group(_db_stats(), "yardsTgt", 2),
    "k": Group({
        "fgOe": Stat("fg_oe", "fga", True, FGA_V, scale=100.0, se=0.33),
        "fgPct": Stat("fgm", "fga", True, FGA_V, counts=False),
        "xpPct": Stat("xpm", "xpa", True, XP_V, counts=False),
        "koEpa": Stat("ko_epa", "kos", True, KO_V, se=0.7),
        "fgDist": Stat("fg_yds", "fga", None, FGA_V, se=9.0),
        "longRate": Stat("fg50", "fga", None, FGA_V),
        "koTb": Stat("ko_tb", "kos", None, KO_V),
    }, "fgOe", 1),
    "p": Group({
        "epaPunt": Stat("epa", "pnt", True, PUNT_V, se=0.92),
        "net": Stat("net", "pnt", True, PUNT_V, se=10.5),
        "in20": Stat("in20", "pnt", True, PUNT_V),
        "tbRate": Stat("tb", "pnt", False, PUNT_V),
        "gross": Stat("gross", "pnt", None, PUNT_V, se=9.0),
        "fcRate": Stat("fc", "pnt", None, PUNT_V),
    }, "epaPunt", 2),
    "pr": Group({
        "epaRet": Stat("epa_r", "rets", True, RET_V, se=0.8),
        "retAvg": Stat("ret_yds", "ret_run", True, RET_V, se=8.0),
        "fcRate": Stat("fc", "rets", None, RET_V),
    }, "epaRet", 1),
    "kr": Group({
        "epaRet": Stat("epa_r", "rets", True, RET_V, se=0.8),
        "retAvg": Stat("ret_yds", "rets", True, RET_V, se=9.0),
    }, "epaRet", 1),
}
HEADLINE = {g: grp.headline for g, grp in GROUPS.items()}

# The box score, kept beside the advanced stats so a reader can sort by either: key -> the component column to add up over the season.
_DEF_BOX = {"tackles": "tk", "solo": "solo", "ast": "ast", "tfl": "tfl", "sacks": "sacks", "press": "press", "pbu": "pbu", "ints": "ints", "missed": "missed"}
BOX: dict[str, dict[str, str]] = {
    "qb": {"att": "att", "cmp": "cmp", "yds": "pyds", "td": "ptd", "int": "int_t", "sacks": "sck"},
    "rb": {"car": "car", "yds": "ryds", "td": "rtd"},
    "wr": {"tgt": "tgt", "rec": "rec", "yds": "ryds", "td": "rtd"},
    "te": {"tgt": "tgt", "rec": "rec", "yds": "ryds", "td": "rtd"},
    "ol": {"snaps": "snaps", "gs": "started", "pen": "pen", "hold": "hold", "fs": "fs"},
    "edge": _DEF_BOX, "idl": _DEF_BOX, "lb": _DEF_BOX, "cb": _DEF_BOX, "saf": _DEF_BOX,
    "k": {"fga": "fga", "fgm": "fgm", "xpa": "xpa", "xpm": "xpm"},
    "p": {"punts": "pnt", "in20": "in20"},
    "pr": {"rets": "rets", "yds": "ret_yds"},
    "kr": {"rets": "rets", "yds": "ret_yds"},
}

PBP_COLS = [
    "game_id", "play_id", "week", "season_type", "posteam", "defteam", "play_type", "epa", "success", "yards_gained",
    "pass_attempt", "complete_pass", "qb_dropback", "qb_scramble", "interception", "sack", "air_yards", "yards_after_catch",
    "receiver_player_id", "passer_player_id", "rusher_player_id", "cpoe", "cp", "xyac_mean_yardage", "penalty", "desc",
    "run_gap", "shotgun", "kicker_player_id", "punter_player_id", "kickoff_returner_player_id", "punt_returner_player_id",
    "field_goal_result", "extra_point_result", "kick_distance", "return_yards", "punt_inside_twenty", "punt_fair_catch",
    "touchback", "tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id", "pass_defense_1_player_id",
    "pass_defense_2_player_id", "pass_touchdown", "rush_touchdown", "solo_tackle_1_player_id", "solo_tackle_2_player_id",
    "assist_tackle_1_player_id", "assist_tackle_2_player_id", "assist_tackle_3_player_id", "assist_tackle_4_player_id",
    "home_team", "away_team", "total_home_score", "total_away_score",
    "penalty_team", "penalty_player_id", "penalty_type",
    "down", "ydstogo", "yardline_100", "qtr", "first_down", "touchdown", "fumble_lost",
]
FTN_COLS = ["nflverse_game_id", "nflverse_play_id", "is_play_action", "is_screen_pass", "is_qb_out_of_pocket", "is_contested_ball", "n_blitzers"]


# ---------------------------------------------------------------------------------------------- small helpers


def site(df: pd.DataFrame, cols: tuple[str, ...]) -> pd.DataFrame:
    df = df.copy()
    for c in cols:
        if c in df:
            df[c] = df[c].replace(SITE_ABBR)
    return df


def col(df: pd.DataFrame, name: str, default=0) -> pd.Series:
    """A column, or a constant one when the source file does not have it."""
    return df[name] if name in df else pd.Series(default, index=df.index)


def flag(df: pd.DataFrame, name: str) -> pd.Series:
    """A 0/1 float column; missing is 0."""
    return pd.to_numeric(col(df, name, 0), errors="coerce").fillna(0).astype(float)


def truthy(s: pd.Series) -> pd.Series:
    """A charting column that may arrive as TRUE/FALSE text, booleans, 0/1, or NaN where the play was not charted."""
    return s.map(lambda x: 1.0 if (x is True or str(x).strip().upper() in ("TRUE", "1", "1.0")) else 0.0)


def passer_rating(att: float, cmp_: float, yds: float, td: float, ints: float) -> float | None:
    """The NFL passer rating formula."""
    if not att:
        return None
    clamp = lambda x: max(0.0, min(2.375, x))  # noqa: E731
    a = clamp((cmp_ / att - 0.3) * 5)
    b = clamp((yds / att - 3) * 0.25)
    c = clamp(td / att * 20)
    d = clamp(2.375 - ints / att * 25)
    return (a + b + c + d) / 6 * 100


# Stats that are a function of several summed components. Each takes a mapping with those columns and returns the value or None.
CALC: dict = {"rating": lambda r: passer_rating(r["tgts"], r["cmp"], r["yds"], r["td"], r["ints"])}
CALC_COLS: dict = {"rating": ("tgts", "cmp", "yds", "td", "ints")}


def percentiles(values: dict[str, float], higher: bool) -> dict[str, float]:
    """{id: 0-100} with 100 the best value. Ties share the average place, except a tie for the best value: nobody is
    better than a player with no drops, so every one of them is 100 and a quiet week cannot look like a slide."""
    if len(values) < 2:
        return {}
    s = pd.Series(values, dtype=float)
    place = s.rank(method="average", ascending=higher)  # best ends up highest
    best = s.max() if higher else s.min()
    return {k: 100.0 if s[k] == best else round(float((v - 1) / (len(s) - 1) * 100), 1) for k, v in place.items()}


# A rate over a handful of plays is mostly luck: a cornerback who missed none of 16 tackles has not shown he never misses. Ranks and grades
# are therefore made on a "stabilized" value, the raw value pulled toward the league's average by how little volume is behind it. A player
# with a lot of volume keeps nearly all of his number, a player with a little keeps part of it, so a 0% on 16 chances no longer ties for
# first with every other zero. The raw number is still what is shown; the stabilized one only orders players and sets the grade.
# At least this share of the spread between players is treated as real, so early in a season, when nearly all of it is luck, the ordering
# still leans on the numbers instead of collapsing to "everyone is average".
FLOOR_REL = 0.25
# A stat whose between-player spread is all noise still counts a little toward a "mover", so a player is never left with no score.
MOVER_REL_FLOOR = 0.15


def stabilize(items: dict[str, tuple[float, float | None]]) -> tuple[dict[str, float], float, float]:
    """({id: stabilized value}, reliability, observed sd) from {id: (value, standard error)} over the qualifiers.

    Reliability is the share of the differences between players that is not sampling noise (0 to 1): 0.5 means half of what separates
    these players on this stat is real so far. It is what the pages use to say "mostly luck so far" or "a real signal"."""
    ids = list(items)
    v = np.array([items[i][0] for i in ids], dtype=float)
    se = np.array([items[i][1] if items[i][1] is not None else 0.0 for i in ids], dtype=float)
    var = float(v.var()) if len(v) else 0.0
    if len(v) < 3 or var <= 0:
        return {i: float(x) for i, x in zip(ids, v)}, 0.0, float(np.sqrt(var))
    noise = float(np.mean(se ** 2))
    rel = max(0.0, min(1.0, (var - noise) / var))
    tau2 = max(var - noise, FLOOR_REL * var)
    w = tau2 / (tau2 + se ** 2)
    mu = float(v.mean())
    return {i: float(mu + wi * (x - mu)) for i, x, wi in zip(ids, v, w)}, rel, float(np.sqrt(var))


def grades(values: dict[str, float], higher: bool, sd: float | None = None) -> dict[str, float]:
    """{id: grade} on the 20-80 scouting scale: 50 is the average of `values`, each 10 points one standard deviation, and a
    higher grade is always better. No ceiling, so a player already at the top can still get better. `sd` is the spread of the raw
    values when `values` have been stabilized, so a pulled-in value earns a grade nearer 50 instead of being stretched back out."""
    if len(values) < 3:
        return {}
    s = pd.Series(values, dtype=float)
    sd = float(sd) if sd else float(s.std(ddof=0))
    if sd == 0:
        return {k: 50.0 for k in s.index}
    z = (s - s.mean()) / sd
    return {k: round(float(50 + 10 * (v if higher else -v)), 1) for k, v in z.items()}


def ranks(values: dict[str, float], higher: bool) -> dict[str, int]:
    """{id: 1 = best}. Players tied on a value share the better place."""
    if not values:
        return {}
    s = pd.Series(values, dtype=float)
    return {k: int(v) for k, v in s.rank(method="min", ascending=not higher).items()}


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "player"


def name_key(name) -> str:
    return "".join(ch for ch in str(name).lower() if ch.isalnum())


def short_key(name) -> str:
    """Last name and first initial, for the player who goes by a nickname in one file and his given name in another ("DJ Glaze",
    "Delmar Glaze")."""
    parts = str(name).replace(".", " ").split()
    return f"{name_key(parts[-1])}:{name_key(parts[0])[:1]}" if len(parts) >= 2 else name_key(name)


def fit_fg(pbp: pd.DataFrame):
    """The make probability of a field goal from its distance, fitted on this season's attempts. Without it a kicker's
    percentage says more about his schedule of kicks than about his leg."""
    fg = pbp[(pbp["play_type"] == "field_goal") & col(pbp, "kick_distance", np.nan).notna() & col(pbp, "field_goal_result", np.nan).notna()]
    if len(fg) < 25:
        base = float((fg["field_goal_result"] == "made").mean()) if len(fg) else 0.84
        return lambda d: np.full(np.shape(d), base, dtype=float)
    x = (fg["kick_distance"].astype(float).to_numpy() - 40.0) / 10.0
    y = (fg["field_goal_result"] == "made").astype(float).to_numpy()
    X = np.column_stack([np.ones_like(x), x])
    b = np.zeros(2)
    for _ in range(30):  # a few Newton steps with a whisper of ridge so a perfect season cannot blow the fit up
        p = 1 / (1 + np.exp(-(X @ b)))
        w = p * (1 - p) + 1e-9
        step = np.linalg.solve((X.T * w) @ X + 0.01 * np.eye(2), X.T @ (y - p) - 0.01 * b)
        b = b + step
        if np.max(np.abs(step)) < 1e-8:
            break
    return lambda d: 1 / (1 + np.exp(-(b[0] + b[1] * (np.asarray(d, dtype=float) - 40.0) / 10.0)))


def merge_all(frames: list[pd.DataFrame], keys: list[str]) -> pd.DataFrame:
    out = frames[0]
    for f in frames[1:]:
        out = out.merge(f, on=keys, how="outer")
    return out


# ---------------------------------------------------------------------------------------------- games and weeks


def finished_games(pbp: pd.DataFrame) -> pd.DataFrame:
    """One row per finished game: its id, week and the two teams. A game counts once its last play is in."""
    rows = []
    for gid, g in pbp.groupby("game_id"):
        last = g.sort_values("play_id").iloc[-1]
        if "END GAME" not in str(last.get("desc", "")).upper():
            continue
        teams = sorted(set(g["posteam"].dropna()) | set(g["defteam"].dropna()))
        rows.append({"game_id": gid, "week": int(g["week"].iloc[0]), "teams": teams})
    return pd.DataFrame(rows, columns=["game_id", "week", "teams"])


def team_weeks(games: pd.DataFrame) -> dict[str, dict[int, str]]:
    """{team: {week: opponent}} for every finished game."""
    out: dict[str, dict[int, str]] = {}
    for r in games.itertuples():
        if len(r.teams) != 2:
            continue
        a, b = r.teams
        out.setdefault(a, {})[r.week] = b
        out.setdefault(b, {})[r.week] = a
    return out


def game_results(pbp: pd.DataFrame, games: pd.DataFrame) -> dict[str, dict[int, list[int]]]:
    """{team: {week: [points for, points against]}} for every finished game, read off the last play's running score."""
    out: dict[str, dict[int, list[int]]] = {}
    need = {"home_team", "away_team", "total_home_score", "total_away_score"}
    if not need <= set(pbp.columns) or games.empty:
        return out
    last = pbp[pbp["game_id"].isin(set(games["game_id"]))].sort_values("play_id").groupby("game_id").tail(1)
    for r in last.itertuples():
        try:
            h, a = int(r.total_home_score), int(r.total_away_score)
        except (TypeError, ValueError):
            continue
        out.setdefault(r.home_team, {})[int(r.week)] = [h, a]
        out.setdefault(r.away_team, {})[int(r.week)] = [a, h]
    return out


def win_translation(logs: dict, rows: list[dict], results: dict[str, dict[int, list[int]]]) -> dict:
    """How a good game by a player at one job lines up with his team winning: for each graded stat, the share of games his team won
    when his number was in the worst, middle and best third of all the games league-wide at that job. {group: {stat: {"n", "t": [lo, mid, hi]}}}."""
    team_of = {r["id"]: r["team"] for r in rows}
    out: dict[str, dict] = {}
    for g in GROUP_ORDER:
        for key, st in GROUPS[g].stats.items():
            if st.higher is None:
                continue
            games: list[tuple[float, float]] = []
            for (pid, grp), entry in logs.items():
                if grp != g:
                    continue
                for w, val, vol, _ in entry["g"].get(key, []):
                    if vol < st.need[2]:
                        continue
                    team = entry.get("t", {}).get(w, team_of.get(pid))
                    pf_pa = results.get(team, {}).get(w)
                    if not pf_pa:
                        continue
                    win = 1.0 if pf_pa[0] > pf_pa[1] else 0.5 if pf_pa[0] == pf_pa[1] else 0.0
                    games.append((val if st.higher else -val, win))
            if len(games) < 30:
                continue
            games.sort(key=lambda x: x[0])
            cut = len(games) // 3
            thirds = [games[:cut], games[cut:len(games) - cut], games[len(games) - cut:]]
            out.setdefault(g, {})[key] = {"n": len(games), "t": [round(sum(w for _, w in t) / len(t), 3) for t in thirds]}
    return out


def bios_of(roster: pd.DataFrame, ids: set[str], season: int) -> dict[str, dict]:
    """What the roster file says about each person: number, size, age, college, draft, years in the league, and his ESPN id."""
    out: dict[str, dict] = {}
    now = datetime.now(timezone.utc).date()

    def num(v):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return None if np.isnan(f) else f

    for r in roster[roster["gsis_id"].isin(ids)].itertuples():
        b: dict = {}
        n = num(getattr(r, "jersey_number", None))
        if n is not None:
            b["no"] = int(n)
        h = num(getattr(r, "height", None))
        if h:
            b["ht"] = int(h)
        w = num(getattr(r, "weight", None))
        if w:
            b["wt"] = int(w)
        born = str(getattr(r, "birth_date", "") or "")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", born):
            b["born"] = born
        col_ = getattr(r, "college", None)
        if isinstance(col_, str) and col_:
            b["college"] = col_
        club, pick = getattr(r, "draft_club", None), num(getattr(r, "draft_number", None))
        if isinstance(club, str) and club and pick:
            b["draft"] = [club, int(pick), int(num(getattr(r, "entry_year", None)) or 0) or None]
        exp = num(getattr(r, "years_exp", None))
        if exp is not None:
            b["exp"] = int(exp)
        e = num(getattr(r, "espn_id", None))
        if e:
            b["espn"] = int(e)
        else:
            # The roster file has no ESPN id for most linemen; the league's own headshot (a short image id) stands in.
            url = getattr(r, "headshot_url", None)
            m = re.search(r"/league/([A-Za-z0-9]+)$", url) if isinstance(url, str) else None
            if m:
                b["shot"] = m.group(1)
        if b:
            out[r.gsis_id] = b
    return out


def window_of(team_games: dict[int, str]) -> tuple[set[int], set[int]]:
    """(form weeks, earlier weeks) for one team."""
    weeks = sorted(team_games)
    form = set(weeks[-form_size(len(weeks)):])
    return form, set(weeks) - form


# ---------------------------------------------------------------------------------------------- weekly components


def _by(df: pd.DataFrame, who: str, team: str, **sums) -> pd.DataFrame:
    """Sum the named columns per player per team per week. `sums` maps output name to the column to add up."""
    spec = {out: (src, "sum") for out, src in sums.items()}
    g = df.groupby([who, team, "week"]).agg(**spec).reset_index()
    return g.rename(columns={who: "id", team: "team"})


def charted(plays: pd.DataFrame, ftn: pd.DataFrame | None) -> pd.DataFrame:
    """Join the charting file onto the plays. `ftn_seen` marks the plays it covers, so every charted rate is over charted plays only
    and a game the charters have not reached yet cannot dilute it."""
    plays = plays.copy()
    if ftn is not None and len(ftn):
        f = ftn[[c for c in FTN_COLS if c in ftn]].rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
        f = f.drop_duplicates(["game_id", "play_id"]).copy()
        f["ftn_seen"] = 1.0
        plays = plays.merge(f, on=["game_id", "play_id"], how="left")
    seen = flag(plays, "ftn_seen")
    plays["ftn_seen"] = seen
    plays["f_pa"] = truthy(col(plays, "is_play_action", False)) * seen
    plays["f_scr"] = truthy(col(plays, "is_screen_pass", False)) * seen
    plays["f_oop"] = truthy(col(plays, "is_qb_out_of_pocket", False)) * seen
    plays["f_con"] = truthy(col(plays, "is_contested_ball", False)) * seen
    plays["f_blz"] = (pd.to_numeric(col(plays, "n_blitzers", 0), errors="coerce").fillna(0) > 0).astype(float) * seen
    return plays


def offense_components(pbp: pd.DataFrame, grp: dict[str, str], pfr: dict[str, pd.DataFrame], pfr_ok: set[tuple[str, int]],
                       ftn: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    """Per player per game for the offensive groups. Play-by-play lands within hours of the final whistle and the PFR tables a day
    or two later, so a rate that divides a PFR count by a play-by-play count (bad throws per attempt, drops per target) counts a
    play only in a game PFR has posted. Without that the newest game would dilute the rate."""
    plays = pbp[pbp["play_type"].isin(["pass", "run"]) & pbp["epa"].notna()].copy()
    plays["succ"] = flag(plays, "success")
    plays["one"] = 1.0
    plays = charted(plays, ftn)
    att = flag(plays, "pass_attempt")
    air = pd.to_numeric(col(plays, "air_yards", np.nan), errors="coerce")
    plays["att"] = att
    plays["air_v"] = air.fillna(0) * att
    plays["air_n"] = (air.notna() & (att == 1)).astype(float)
    plays["deep"] = ((air >= 20) & (att == 1)).astype(float)
    cpoe = pd.to_numeric(col(plays, "cpoe", np.nan), errors="coerce")
    plays["cpoe_v"] = cpoe.fillna(0)
    plays["cpoe_n"] = cpoe.notna().astype(float)
    in_pfr = lambda t, w: np.array([(a, b) in pfr_ok for a, b in zip(t, w)], dtype=bool)  # noqa: E731
    out: dict[str, pd.DataFrame] = {}

    # Quarterbacks: every dropback, so a sack and a scramble are his as well.
    q = plays[(flag(plays, "qb_dropback") == 1) & plays["passer_player_id"].map(grp).eq("qb")].copy()
    q["sck"] = flag(q, "sack")
    q["cmp"] = flag(q, "complete_pass")
    q["pyds"] = pd.to_numeric(col(q, "yards_gained", 0), errors="coerce").fillna(0) * q["att"]
    q["ptd"] = flag(q, "pass_touchdown")
    q["int_t"] = flag(q, "interception")
    q["pa"], q["oop"], q["blz"], q["ftn_n"] = q["f_pa"], q["f_oop"], q["f_blz"], q["ftn_seen"]
    q = _by(q, "passer_player_id", "posteam", db="one", epa="epa", succ="succ", cpoe="cpoe_v", cpoe_n="cpoe_n", att="att", air="air_v",
            air_n="air_n", deep="deep", sck="sck", pa="pa", oop="oop", blz="blz", ftn_n="ftn_n", cmp="cmp", pyds="pyds", ptd="ptd", int_t="int_t")
    bad = pfr["pass"][["id", "team", "week", "passing_bad_throws"]].dropna(subset=["id"])
    bad = bad.groupby(["id", "team", "week"], as_index=False)["passing_bad_throws"].sum().rename(columns={"passing_bad_throws": "bad"})
    q = q.merge(bad, on=["id", "team", "week"], how="left")
    q["att_p"] = np.where(in_pfr(q["team"], q["week"]), q["att"], 0)
    out["qb"] = q

    # Receivers: every target. A completion is measured against the catch the play was expected to be.
    t = plays[(att == 1) & plays["receiver_player_id"].map(grp).isin(["wr", "te"])].copy()
    t["croe_v"] = pd.to_numeric(col(t, "complete_pass", np.nan), errors="coerce") - pd.to_numeric(col(t, "cp", np.nan), errors="coerce")
    t["croe_n"] = t["croe_v"].notna().astype(float)
    t["croe_v"] = t["croe_v"].fillna(0)
    caught = (flag(t, "complete_pass") == 1) & col(t, "yards_after_catch", np.nan).notna() & col(t, "xyac_mean_yardage", np.nan).notna()
    yac = pd.to_numeric(col(t, "yards_after_catch", np.nan), errors="coerce") - pd.to_numeric(col(t, "xyac_mean_yardage", np.nan), errors="coerce")
    t["yacoe_v"] = yac.where(caught, 0).fillna(0)
    t["yacoe_n"] = caught.astype(float)
    t["tgt"] = 1.0
    t["rec"] = flag(t, "complete_pass")
    t["ryds"] = pd.to_numeric(col(t, "yards_gained", 0), errors="coerce").fillna(0) * t["rec"]
    t["rtd"] = flag(t, "pass_touchdown") * t["rec"]
    t["contested"], t["screen"], t["ftn_t"] = t["f_con"], t["f_scr"], t["ftn_seen"]
    r = _by(t, "receiver_player_id", "posteam", tgt="tgt", epa="epa", croe="croe_v", croe_n="croe_n", yacoe="yacoe_v", yacoe_n="yacoe_n",
            air="air_v", air_n="air_n", deep="deep", contested="contested", screen="screen", ftn_t="ftn_t", rec="rec", ryds="ryds", rtd="rtd")
    team_att = plays[att == 1].groupby(["posteam", "week"]).size().rename("team_att").reset_index().rename(columns={"posteam": "team"})
    drop = pfr["rec"][["id", "team", "week", "receiving_drop"]].dropna(subset=["id"])
    drop = drop.groupby(["id", "team", "week"], as_index=False)["receiving_drop"].sum().rename(columns={"receiving_drop": "drop"})
    r = r.merge(team_att, on=["team", "week"], how="left").merge(drop, on=["id", "team", "week"], how="left")
    r["tgt_p"] = np.where(in_pfr(r["team"], r["week"]), r["tgt"], 0)
    r["group"] = r["id"].map(grp)
    out["wr"], out["te"] = r[r["group"] == "wr"], r[r["group"] == "te"]

    # Runners: designed carries, so a scramble is the quarterback's.
    n = plays[(plays["play_type"] == "run") & (flag(plays, "qb_scramble") != 1) & plays["rusher_player_id"].map(grp).eq("rb")].copy()
    n["car"] = 1.0
    n["expl"] = (pd.to_numeric(col(n, "yards_gained", 0), errors="coerce").fillna(0) >= 10).astype(float)
    n["stuff"] = (pd.to_numeric(col(n, "yards_gained", 0), errors="coerce").fillna(0) <= 0).astype(float)
    gap = col(n, "run_gap", np.nan)
    n["gap_n"] = gap.notna().astype(float)
    n["edge"] = (gap == "end").astype(float)
    n["gun"] = flag(n, "shotgun")
    n["ryds"] = pd.to_numeric(col(n, "yards_gained", 0), errors="coerce").fillna(0)
    n["rtd"] = flag(n, "rush_touchdown")
    u = _by(n, "rusher_player_id", "posteam", car="car", epa="epa", succ="succ", expl="expl", stuff="stuff", gap_n="gap_n", edge="edge", gun="gun", ryds="ryds", rtd="rtd")
    pr = pfr["rush"].dropna(subset=["id"]).groupby(["id", "team", "week"], as_index=False).agg(
        pfr_car=("carries", "sum"), ybc=("rushing_yards_before_contact", "sum"), yco=("rushing_yards_after_contact", "sum"),
        broken=("rushing_broken_tackles", "sum"))
    out["rb"] = u.merge(pr, on=["id", "team", "week"], how="left")
    return out


def line_components(raw: pd.DataFrame, pbp: pd.DataFrame, snaps: pd.DataFrame, grp: dict[str, str], done: set[tuple[str, int]]) -> pd.DataFrame:
    """Per offensive lineman per game: the snaps he played, whether he started, the penalties charged to him, and what his whole line
    did in the games he started (the team's dropbacks and sacks, its designed runs and the ones that succeeded). The last four are the
    unit's, not his: five linemen who start together carry the same ones. There is no public per-player blocking result to use instead.

    `raw` still has the penalty plays; `pbp` does not, so a sack and a run success are counted the usual way."""
    s = snaps.dropna(subset=["id"]).copy()
    s = s[s["id"].map(grp).eq("ol")]
    if s.empty:
        return s
    s["pct"] = pd.to_numeric(s["offense_pct"], errors="coerce").fillna(0)
    s["sn"] = pd.to_numeric(s["offense_snaps"], errors="coerce").fillna(0)
    s = s[s["sn"] > 0]
    # The team's snaps in a game, read back from any player's count and share.
    s["tsn_one"] = np.where(s["pct"] > 0, s["sn"] / s["pct"].where(s["pct"] > 0, np.nan), np.nan)
    tsn = s.groupby(["team", "week"])["tsn_one"].median().rename("tsn").reset_index()
    out = s.groupby(["id", "team", "week"], as_index=False).agg(snaps=("sn", "sum"), pct=("pct", "max"))
    out = out.merge(tsn, on=["team", "week"], how="left")
    out["tsn"] = out["tsn"].fillna(out["snaps"])
    out["started"] = (out["pct"] >= 0.5).astype(float)

    pen = raw[(flag(raw, "penalty") == 1) & raw["penalty_player_id"].notna() & (raw["penalty_team"] == raw["posteam"])]
    pen = pen[~pen["desc"].astype(str).str.contains("declined", case=False)]
    pen = pen[[(t, w) in done for t, w in zip(pen["posteam"], pen["week"])]]
    pen = pen.assign(pen=1.0, hold=(pen["penalty_type"] == "Offensive Holding").astype(float), fs=(pen["penalty_type"] == "False Start").astype(float))
    pen = pen.groupby(["penalty_player_id", "posteam", "week"], as_index=False)[["pen", "hold", "fs"]].sum().rename(columns={"penalty_player_id": "id", "posteam": "team"})
    out = out.merge(pen, on=["id", "team", "week"], how="left")
    for c in ("pen", "hold", "fs"):
        out[c] = out[c].fillna(0.0)

    plays = pbp[pbp["play_type"].isin(["pass", "run"]) & pbp["epa"].notna()]
    drop = plays[flag(plays, "qb_dropback") == 1]
    unit = drop.assign(db=1.0, sck=flag(drop, "sack")).groupby(["posteam", "week"], as_index=False)[["db", "sck"]].sum()
    runs = plays[(plays["play_type"] == "run") & (flag(plays, "qb_scramble") != 1)]
    run = runs.assign(run=1.0, rs=flag(runs, "success")).groupby(["posteam", "week"], as_index=False)[["run", "rs"]].sum()
    unit = unit.merge(run, on=["posteam", "week"], how="outer").fillna(0.0).rename(columns={"posteam": "team"})
    out = out.merge(unit, on=["team", "week"], how="left")
    for src, dst in (("db", "u_db"), ("sck", "u_sck"), ("run", "u_run"), ("rs", "u_rs")):
        out[dst] = out[src].fillna(0.0) * out["started"]
    return out.drop(columns=["pct", "db", "sck", "run", "rs"])


def defense_components(pbp: pd.DataFrame, pfr_def: pd.DataFrame, snaps: pd.DataFrame, pfr_ok: set[tuple[str, int]]) -> pd.DataFrame:
    """Per defender per game. `snaps` already carries the player's `id`.

    A rate per snap needs the snap count and the PFR line from the same game. Snap counts for the newest game can arrive a day
    after the PFR table, so the snap-based numerators are zeroed for a team-week with no snap data, which leaves that game out of
    those rates and out of nothing else. The same goes for the plays play-by-play charges to a defender (tackles for loss, passes
    defended) when they are divided by something PFR counts.
    """
    d = pfr_def.dropna(subset=["id"]).copy()
    d["adot_sum"] = pd.to_numeric(col(d, "def_adot", 0), errors="coerce").fillna(0) * pd.to_numeric(col(d, "def_targets", 0), errors="coerce").fillna(0)
    out = d.groupby(["id", "team", "week"], as_index=False).agg(
        press=("def_pressures", "sum"), sacks=("def_sacks", "sum"), tackles=("def_tackles_combined", "sum"), missed=("def_missed_tackles", "sum"),
        tgts=("def_targets", "sum"), cmp=("def_completions_allowed", "sum"), yds=("def_yards_allowed", "sum"),
        td=("def_receiving_td_allowed", "sum"), ints=("def_ints", "sum"), adot_sum=("adot_sum", "sum"))
    out["tackle_chances"] = out["tackles"] + out["missed"]
    # The passer rating against him is not a sum, so it is not stored: the stat (calc="rating") makes it from the summed line of any slice.
    sn = snaps.dropna(subset=["id"]).groupby(["id", "team", "week"], as_index=False).agg(snaps=("defense_snaps", "sum"))
    # What play-by-play charges to a defender: tackles for loss and passes defended.
    ev = []
    for c, name in (("tackle_for_loss_1_player_id", "tfl"), ("tackle_for_loss_2_player_id", "tfl"),
                    ("pass_defense_1_player_id", "pbu"), ("pass_defense_2_player_id", "pbu")):
        if c in pbp:
            e = pbp[pbp[c].notna()][[c, "defteam", "week"]].rename(columns={c: "id", "defteam": "team"})
            e[name] = 1.0
            ev.append(e.groupby(["id", "team", "week"], as_index=False)[name].sum())
    scrim = pbp[pbp["play_type"].isin(["pass", "run"])]
    for cols_, name in ((("solo_tackle_1_player_id", "solo_tackle_2_player_id"), "solo"),
                        (("assist_tackle_1_player_id", "assist_tackle_2_player_id", "assist_tackle_3_player_id", "assist_tackle_4_player_id"), "ast")):
        for c in cols_:
            if c in scrim:
                e = scrim[scrim[c].notna()][[c, "defteam", "week"]].rename(columns={c: "id", "defteam": "team"})
                e[name] = 1.0
                ev.append(e.groupby(["id", "team", "week"], as_index=False)[name].sum())
    for name in ("tfl", "pbu", "solo", "ast"):
        part = [e for e in ev if name in e]
        if part:
            out = out.merge(pd.concat(part).groupby(["id", "team", "week"], as_index=False)[name].sum(), on=["id", "team", "week"], how="outer")
        else:
            out[name] = 0.0
    out = out.merge(sn, on=["id", "team", "week"], how="outer")
    for c in out.columns:
        if c not in ("id", "team"):
            out[c] = out[c].fillna(0)
    out["tk"] = out["solo"] + out["ast"]
    have = {(t, w) for t, w in zip(snaps["team"], snaps["week"])}
    ok = np.array([(t, w) in have for t, w in zip(out["team"], out["week"])], dtype=bool)
    posted = np.array([(t, w) in pfr_ok for t, w in zip(out["team"], out["week"])], dtype=bool)
    out["snaps_s"] = np.where(ok, out["snaps"], 0.0)
    for src, dst in (("press", "press_s"), ("sacks", "sacks_s"), ("tackles", "tackles_s"), ("tfl", "tfl_s")):
        out[dst] = np.where(ok, out[src], 0.0)
    out["pbu_p"] = np.where(posted, out["pbu"], 0.0)
    return out


def special_components(pbp: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Kickers, punters and returners, all from play-by-play. The sign of an expected-points number depends on who had the ball:
    on a punt the offense is the punting team, on a kickoff it is the receiving team."""
    out: dict[str, pd.DataFrame] = {}
    d = pbp[pbp["epa"].notna()].copy()
    d["one"] = 1.0
    dist = pd.to_numeric(col(d, "kick_distance", np.nan), errors="coerce")
    ret = pd.to_numeric(col(d, "return_yards", 0), errors="coerce").fillna(0)
    tb = flag(d, "touchback")
    p_fg = fit_fg(pbp)

    fg = d[(d["play_type"] == "field_goal") & col(d, "kicker_player_id", np.nan).notna() & dist.notna()].copy()
    fg["fga"] = 1.0
    fg["fgm"] = (col(fg, "field_goal_result", None) == "made").astype(float)
    fg["fg_oe"] = fg["fgm"] - p_fg(pd.to_numeric(col(fg, "kick_distance", np.nan), errors="coerce").to_numpy())
    fg["fg_yds"] = pd.to_numeric(col(fg, "kick_distance", np.nan), errors="coerce")
    fg["fg50"] = (fg["fg_yds"] >= 50).astype(float)
    parts = [_by(fg, "kicker_player_id", "posteam", fga="fga", fgm="fgm", fg_oe="fg_oe", fg_yds="fg_yds", fg50="fg50")] if len(fg) else []
    xp = d[(d["play_type"] == "extra_point") & col(d, "kicker_player_id", np.nan).notna()].copy()
    xp["xpa"] = 1.0
    xp["xpm"] = (col(xp, "extra_point_result", None) == "good").astype(float)
    if len(xp):
        parts.append(_by(xp, "kicker_player_id", "posteam", xpa="xpa", xpm="xpm"))
    ko = d[(d["play_type"] == "kickoff") & col(d, "kicker_player_id", np.nan).notna()].copy()
    ko["kos"] = 1.0
    ko["ko_epa"] = -ko["epa"]  # the kicking team is the defense on a kickoff
    ko["ko_tb"] = flag(ko, "touchback")
    if len(ko):
        parts.append(_by(ko, "kicker_player_id", "defteam", kos="kos", ko_epa="ko_epa", ko_tb="ko_tb"))
    if parts:
        # A kicker's team: the team he kicked for in that game, which his field goals and kickoffs both name.
        k = pd.concat(parts)
        out["k"] = k.groupby(["id", "team", "week"], as_index=False).sum()

    pu = d[(d["play_type"] == "punt") & col(d, "punter_player_id", np.nan).notna() & dist.notna()].copy()
    if len(pu):
        pu["pnt"] = 1.0
        pu["gross"] = pd.to_numeric(col(pu, "kick_distance", np.nan), errors="coerce")
        pu["tb"] = flag(pu, "touchback")
        pu["net"] = pu["gross"] - pd.to_numeric(col(pu, "return_yards", 0), errors="coerce").fillna(0) - 20 * pu["tb"]
        pu["in20"] = flag(pu, "punt_inside_twenty")
        pu["fc"] = flag(pu, "punt_fair_catch")
        out["p"] = _by(pu, "punter_player_id", "posteam", pnt="pnt", epa="epa", gross="gross", net="net", in20="in20", tb="tb", fc="fc")

    pr = d[(d["play_type"] == "punt") & col(d, "punt_returner_player_id", np.nan).notna()].copy()
    if len(pr):
        pr["rets"] = 1.0
        pr["epa_r"] = -pr["epa"]  # the returner's team is the defense on a punt
        pr["fc"] = flag(pr, "punt_fair_catch")
        pr["ret_run"] = 1.0 - pr["fc"]
        pr["ret_yds"] = pd.to_numeric(col(pr, "return_yards", 0), errors="coerce").fillna(0) * pr["ret_run"]
        out["pr"] = _by(pr, "punt_returner_player_id", "defteam", rets="rets", epa_r="epa_r", fc="fc", ret_run="ret_run", ret_yds="ret_yds")

    kr = d[(d["play_type"] == "kickoff") & col(d, "kickoff_returner_player_id", np.nan).notna()].copy()
    if len(kr):
        kr["rets"] = 1.0
        kr["epa_r"] = kr["epa"]  # the returner's team has the ball on a kickoff
        kr["ret_yds"] = pd.to_numeric(col(kr, "return_yards", 0), errors="coerce").fillna(0)
        out["kr"] = _by(kr, "kickoff_returner_player_id", "posteam", rets="rets", epa_r="epa_r", ret_yds="ret_yds")
    return out


# ---------------------------------------------------------------------------------------------- statistics


def spread(values: list[float]) -> dict:
    """The league's yardstick for one stat: what typical and what elite look like, so a number never stands alone."""
    a = np.asarray(values, dtype=float)
    q = np.percentile(a, [10, 25, 50, 75, 90])
    return {"n": int(len(a)), "mean": round(float(a.mean()), 4), "sd": round(float(a.std(ddof=0)), 4), "q": [round(float(x), 4) for x in q]}


def standard_error(st: Stat, num: float, den: float) -> float | None:
    """How far this player's value could be from his true level on the volume behind it, in the stat's own units."""
    if den <= 0:
        return None
    if st.se == "binom":
        p = (num + 1) / (den + 2)  # a hair of shrinkage so 0 for 8 is not "exactly 0%, with no doubt"
        return float(np.sqrt(p * (1 - p) / den) * st.scale)
    if st.se == "poisson":
        return float(np.sqrt(max(num, 1.0)) / den * st.scale)
    return float(st.se) * st.scale / float(np.sqrt(den))


def slice_values(tot: pd.DataFrame, st: Stat) -> dict[str, tuple[float, float, float, float]]:
    """{id: (value, volume, numerator, denominator)} for one stat over one slice's summed components."""
    if st.calc:
        need = CALC_COLS[st.calc]
        if any(c not in tot for c in need):
            return {}
        out = {}
        for pid, row in tot[list(need)].astype(float).iterrows():
            v = CALC[st.calc](row)
            if row["tgts"] > 0 and v is not None:
                out[pid] = (v * st.scale, row["tgts"], v * row["tgts"], row["tgts"])
        return out
    if st.num not in tot or st.den not in tot:
        return {}
    num = tot[st.num].to_numpy(dtype=float)
    den = tot[st.den].to_numpy(dtype=float)
    vol = tot[st.gate].to_numpy(dtype=float) if st.gate and st.gate in tot else den
    return {pid: (n / d * st.scale, v, n, d) for pid, n, d, v in zip(tot.index, num, den, vol) if d > 0}


def snap_share(snaps: pd.DataFrame, side: str, weeks: list[int], pid: str, team: str) -> list | None:
    """[mean share of the team's snaps, games he played, games counted] over the `weeks` that have snap counts. A counted game he
    did not play is a zero in the mean, which is why the other two numbers ride along: 40% over four games can be a part-time role
    or a full one with two games missed, and the page has to be able to tell them apart."""
    counted = sorted(set(snaps.loc[snaps["team"] == team, "week"]) & set(weeks))
    if not counted:
        return None
    c = "offense_pct" if side == "off" else "defense_pct"
    mine = snaps[(snaps["id"] == pid) & (snaps["team"] == team) & snaps["week"].isin(counted)]
    share = mine[c].fillna(0)
    return [round(float(share.sum()) / len(counted), 3), int((share > 0).sum()), len(counted)]


def attach_ids(df: pd.DataFrame, name_col: str, to_gsis: dict[str, str], by_name: dict[tuple[str, str], str]) -> pd.DataFrame:
    """Give a PFR-keyed table the nflverse player id. A player the roster file has no PFR id for (a recent signing) is matched
    by name within his team instead."""
    df = df.copy()
    df["id"] = df["pfr_player_id"].map(to_gsis)
    miss = df["id"].isna()
    if miss.any():
        df.loc[miss, "id"] = [by_name.get((name_key(n), t)) or by_name.get(("~" + short_key(n), t)) for n, t in zip(df.loc[miss, name_col], df.loc[miss, "team"])]
    return df


def r4(x) -> float:
    return round(float(x), 4)


def r1(x) -> float:
    return round(float(x), 1)


@dataclass
class Grouped:
    rows: list = field(default_factory=list)
    yard: dict = field(default_factory=dict)
    logs: dict = field(default_factory=dict)
    qualifiers: int = 0


# Defensive box totals that come from Pro Football Reference's table, which posts a day or two after play-by-play. For a game it has not
# posted, a missing line is "not in yet", not a zero, so the game log leaves the cell blank instead of printing a 0 that never happened.
PFR_BOX = {"sacks", "press", "ints", "missed"}


def posted(weeks_of: dict[str, dict[int, str]], team: str, week: int) -> bool:
    """True when the PFR table for this team's game that week has been posted (for defense, `weeks_of` holds only those weeks)."""
    return week in weeks_of.get(team, {})


def grade_group(g: str, df: pd.DataFrame, side_windows: dict, weeks_all: list[int], names: dict, pos: dict, snaps: pd.DataFrame,
                weeks_of: dict[str, dict[int, str]], last_week: int) -> Grouped:
    """Everything for one group: every player's slices, grades, ranks, uncertainty, movers, the yardstick and the game-by-game trail."""
    spec = GROUPS[g]
    stats = spec.stats
    side = SIDE_OF[g]
    res = Grouped()
    if df is None or df.empty:
        return res
    df = df.copy()
    win = side_windows["def" if side == "def" else "off"]
    df["slice"] = ["form" if w in win.get(t, (set(), set()))[0] else "earlier" for t, w in zip(df["team"], df["week"])]
    box_cols = BOX.get(g, {})
    cols = sorted({c for s in stats.values() for c in (s.num, s.den, s.gate, *CALC_COLS.get(s.calc or "", ())) if c and c in df.columns} | {c for c in box_cols.values() if c in df.columns})
    tot = {sl: (df if sl == "season" else df[df["slice"] == sl]).groupby("id")[cols].sum() for sl in SLICES}
    latest = df.sort_values("week").groupby("id")["team"].last()

    # Value, volume and numerator for every player in the league, per stat and slice; then the grades and ranks among qualifiers.
    val: dict[str, dict[str, dict]] = {}
    grade: dict[str, dict[str, dict]] = {}
    rank: dict[str, dict] = {}
    adj: dict[str, dict[str, float]] = {}
    reliab: dict[str, float] = {}
    for key, st in stats.items():
        val[key], grade[key] = {}, {}
        for sl, need in zip(SLICES, st.need):
            val[key][sl] = slice_values(tot[sl], st)
            qual = {pid: t[0] for pid, t in val[key][sl].items() if t[1] >= need}
            if sl == "season" and st.higher is not None:
                # The season grade and rank are made on stabilized values; the last two games stay raw, because pulling a two-game
                # sample toward the league would make every good player look like he is slipping.
                items = {pid: (t[0], standard_error(st, t[2], t[3])) for pid, t in val[key][sl].items() if t[1] >= need}
                shr, rel, sd = stabilize(items)
                adj[key] = {pid: r4(x) for pid, x in shr.items()}
                grade[key][sl] = grades(shr, st.higher, sd)
                rank[key] = ranks(shr, st.higher)
                reliab[key] = rel
            else:
                grade[key][sl] = grades(qual, st.higher) if st.higher is not None else {}
                if sl == "season":
                    rank[key] = {}
            if sl == "season":
                if len(qual) >= 3:
                    res.yard[key] = spread(list(qual.values()))
                    if st.higher is not None:
                        res.yard[key]["rel"] = r4(reliab[key])
                if key == spec.headline:
                    res.qualifiers = len(qual)

    form_weeks_last = {t: w[0] for t, w in win.items()}
    for pid in tot["season"].index:
        if not names.get(pid):
            continue
        team = latest[pid]
        entries, deltas = [], []
        for key, st in stats.items():
            s_season = val[key]["season"].get(pid)
            if s_season is None or s_season[1] < st.need[0]:
                continue  # a stat with too little volume over the season says nothing
            one: dict = {"k": key}
            se_of = {}
            for sl, need in zip(SLICES, st.need):
                t = val[key][sl].get(pid)
                if t is None:
                    one[sl] = None
                    continue
                v, n, num, den = t
                d = {"v": r4(v), "n": r1(n)}
                se_of[sl] = standard_error(st, num, den)
                if sl == "season":
                    d["se"] = r4(se_of[sl]) if se_of[sl] is not None else None
                if n >= need and st.higher is not None:
                    d["g"] = grade[key][sl].get(pid)
                    if sl == "season":
                        d["r"] = rank[key].get(pid)
                        d["a"] = adj[key].get(pid)
                one[sl] = d
            f, e = one.get("form"), one.get("earlier")
            if st.higher is not None and f and e and f.get("g") is not None and e.get("g") is not None:
                one["delta"] = r1(f["g"] - e["g"])
                sf, se_ = se_of.get("form"), se_of.get("earlier")
                if sf is not None and se_ is not None and (sf * sf + se_ * se_) > 0:
                    z = (f["v"] - e["v"]) / float(np.sqrt(sf * sf + se_ * se_))
                    one["z"] = r1(z if st.higher else -z)
                if st.counts:
                    # How far to trust the change: half at the volume the stat needs to count at all, three quarters at triple it.
                    deltas.append((key, one["delta"], f["n"] / (f["n"] + st.need[1]), one.get("z"), max(MOVER_REL_FLOOR, reliab.get(key, 0.0))))
            entries.append(one)
        head = next((e for e in entries if e["k"] == spec.headline), None)
        if head is None or head["season"].get("g") is None:
            continue  # no card without the stat the card is about

        mover = None
        if len(deltas) >= spec.min_stats:
            # The outcome stat counts double: a quarterback whose EPA is up should not be a faller because of one throw-quality number.
            # A small recent sample pulls the score toward zero, because a stat over a handful of plays swings on a few plays.
            # A stat that is mostly luck so far moves the score less: its change is more likely noise than a real change.
            wts = [(2.0 if k == spec.headline else 1.0) * rl for k, _, _, _, rl in deltas]
            score = round(float(sum(w * c * d for w, (_, d, c, _, _) in zip(wts, deltas)) / sum(wts)), 1)
            zs = [(w, z) for w, (_, _, _, z, _) in zip(wts, deltas) if z is not None]
            driver = max(deltas, key=lambda x: abs(x[1]) * x[2] * x[4])[0]
            mover = {"score": score, "driver": driver, "stats": len(deltas), "agree": sum(1 for _, d, _, _, _ in deltas if d * score > 0)}
            if zs:
                mover["z"] = r1(sum(w * z for w, z in zs) / sum(w for w, _ in zs))

        form_w, earlier_w = win.get(team, (set(), set()))
        snap_side = "def" if side == "def" else "off"
        tg = weeks_of.get(team, {})
        if side == "st":
            share = {sl: None for sl in SLICES}
        else:
            share = {sl: snap_share(snaps, snap_side, sorted(ws), pid, team) for sl, ws in (("season", set(tg)), ("form", form_w), ("earlier", earlier_w))}
        rows_p = df[df["id"] == pid]
        res.rows.append({
            "id": pid, "name": names[pid], "team": team, "pos": pos.get(pid, ""), "group": g,
            "games": int(rows_p["week"].nunique()), "snaps": share, "stats": entries, "mover": mover,
            "box": {k: round(float(tot["season"].at[pid, c]), 1) if float(tot["season"].at[pid, c]) % 1 else int(tot["season"].at[pid, c])
                    for k, c in box_cols.items() if c in tot["season"]},
        })

    # The game-by-game trail, with the season-to-date percentile after each week: where he ranked then, among players with the same
    # share of a full season's volume behind them.
    kept = {r["id"]: r for r in res.rows}
    if kept:
        weekly = df.groupby(["id", "week"])[cols].sum()
        week_team = {(i, w): t for i, w, t in zip(df["id"], df["week"], df["team"])}
        top = max(last_week, 1)
        cum_pct: dict[str, dict[int, dict[str, float]]] = {}
        for k in weeks_all:
            part = df[df["week"] <= k].groupby("id")[cols].sum()
            frac = k / top
            for key, st in stats.items():
                if st.higher is None:
                    continue
                items = {pid: (t[0], standard_error(st, t[2], t[3])) for pid, t in slice_values(part, st).items() if t[1] >= max(1.0, st.need[0] * max(frac, 0.6))}
                # The same stabilized values the season rank is made on, so the last point of the line is where the season rank is.
                vals = stabilize(items)[0] if len(items) >= 3 else {pid: x[0] for pid, x in items.items()}
                for pid, p in percentiles(vals, st.higher).items():
                    cum_pct.setdefault(key, {}).setdefault(pid, {})[k] = p
        for pid, row in kept.items():
            mine = weekly.loc[pid] if pid in weekly.index.get_level_values(0) else None
            if mine is None:
                continue
            trail: dict[str, list] = {}
            last_team = row["team"]
            moved = {}
            for key, st in stats.items():
                pts = []
                for w, vals in mine.iterrows():
                    if st.num not in vals or st.den not in vals or vals[st.den] <= 0:
                        continue
                    if st.calc:
                        one = CALC[st.calc](vals)
                        if one is None:
                            continue
                    pct = cum_pct.get(key, {}).get(pid, {}).get(int(w))
                    # The volume is what a reader would call the sample (a receiver's targets), not necessarily the stat's denominator
                    # (his team's pass attempts, for target share).
                    vol = vals[st.gate] if st.gate and st.gate in vals else vals[st.den]
                    pts.append([int(w), r4((one if st.calc else vals[st.num] / vals[st.den]) * st.scale), r1(vol), None if pct is None else r1(pct)])
                    if week_team.get((pid, w)) != last_team:
                        moved[int(w)] = week_team.get((pid, w))
                if pts:
                    trail[key] = pts
            if trail:
                entry = {"g": trail}
                if moved:
                    entry["t"] = moved
                # The box score game by game, for the game log: [[week, value], ...] per total.
                bx = {}
                for k, c in box_cols.items():
                    if c in mine.columns:
                        bx[k] = [[int(w), int(v) if float(v).is_integer() else round(float(v), 1)] for w, v in mine[c].items()
                                 if not (side == "def" and k in PFR_BOX and not posted(weeks_of, week_team.get((pid, w), row["team"]), int(w)))]
                if bx:
                    entry["b"] = bx
                if side != "st":
                    # His share of the team's snaps in every game that has snap counts, a game he did not play being 0, so a reader
                    # can tell "he missed two games" from "he played less".
                    tg = weeks_of.get(row["team"], {})
                    counted = sorted(set(snaps.loc[snaps["team"] == row["team"], "week"]) & set(tg))
                    mine_s = snaps[(snaps["id"] == pid) & (snaps["team"] == row["team"])]
                    got = dict(zip(mine_s["week"], mine_s["defense_pct" if side == "def" else "offense_pct"].fillna(0)))
                    entry["s"] = [[int(w), round(float(got.get(w, 0.0)), 3)] for w in counted]
                res.logs[pid] = entry
    return res


def comparables(rows: list[dict], group: str) -> dict[str, list[str]]:
    """For each player the few most like him in the same group: the smallest typical gap in grade over the graded stats they share.
    A unit's numbers (a line's run success) are left out: linemen who start together share them, so they would match teammates, not styles."""
    graded = [k for k, s in GROUPS[group].stats.items() if s.higher is not None and not s.unit]
    ids = [r["id"] for r in rows]
    mat = np.full((len(rows), len(graded)), np.nan)
    for i, r in enumerate(rows):
        have = {s["k"]: s["season"].get("g") for s in r["stats"]}
        for j, k in enumerate(graded):
            if have.get(k) is not None:
                mat[i, j] = have[k]
    out: dict[str, list[str]] = {}
    need = min(3, len(graded))
    for i, pid in enumerate(ids):
        diff = (mat - mat[i]) ** 2
        shared = np.sum(~np.isnan(diff), axis=1)
        total = np.nansum(diff, axis=1)
        dist = np.sqrt(total / np.maximum(shared, 1))
        dist[shared < need] = np.inf
        dist[i] = np.inf
        order = [j for j in np.argsort(dist, kind="stable") if np.isfinite(dist[j])][:LIKE_N]
        out[pid] = [ids[j] for j in order]
    return out


# ---------------------------------------------------------------------------------------------- the build


def build(src: dict[str, pd.DataFrame], season: int, team: str = "LV") -> dict:
    raw = site(src["pbp"], ("posteam", "defteam", "home_team", "away_team", "penalty_team"))
    raw = raw[raw["season_type"] == "REG"]
    games = finished_games(raw)
    weeks_of = team_weeks(games)
    results = game_results(raw, games)
    if not weeks_of:
        return {"season": season, "players": []}
    # A game counts once its last play is in, and every table is cut down to the games that count, so the stats, the snap
    # shares and the windows all describe the same games.
    done = {(t, w) for t, ws in weeks_of.items() for w in ws}
    pbp = raw[raw["penalty"].fillna(0) != 1] if "penalty" in raw else raw
    pbp = pbp[[(p, w) in done if isinstance(p, str) else (d, w) in done for p, d, w in zip(pbp["posteam"], pbp["defteam"], pbp["week"])]]

    roster = site(src["roster"], ("team",)).drop_duplicates("gsis_id", keep="last")
    pos = dict(zip(roster["gsis_id"], roster["position"]))
    names = dict(zip(roster["gsis_id"], roster["full_name"]))
    to_gsis = {k: v for k, v in zip(roster["pfr_id"], roster["gsis_id"]) if isinstance(k, str)}
    by_name = {(name_key(n), t): i for n, t, i in zip(roster["full_name"], roster["team"], roster["gsis_id"])}
    # The nickname fallback only when the last name and first initial are unique on the team.
    shorts: dict[tuple[str, str], set] = {}
    for n, t, i in zip(roster["full_name"], roster["team"], roster["gsis_id"]):
        shorts.setdefault(("~" + short_key(n), t), set()).add(i)
    by_name.update({k: next(iter(v)) for k, v in shorts.items() if len(v) == 1})

    def keep(df: pd.DataFrame, name_col: str) -> pd.DataFrame:
        df = site(df, ("team", "opponent"))
        df = df[df["game_type"] == "REG"] if "game_type" in df else df
        df = df[[(t, w) in done for t, w in zip(df["team"], df["week"])]]
        return attach_ids(df, name_col, to_gsis, by_name)

    pfr = {k: keep(src[k], "pfr_player_name") for k in ("pass", "rush", "rec", "defense")}
    snaps = keep(src["snaps"], "player")

    # Which group each player belongs to. The depth chart is the authority; the snap-count position settles a roster that only
    # says DL or DB.
    depth = dict(zip(roster["gsis_id"], col(roster, "depth_chart_position", None)))
    snap_pos = dict(zip(snaps["id"], snaps["position"])) if "position" in snaps else {}
    grp: dict[str, str] = {}
    for pid in set(roster["gsis_id"]) | set(snap_pos):
        g = DEPTH_GROUP.get(str(depth.get(pid)).upper()) or COARSE_GROUP.get(str(pos.get(pid)).upper()) or COARSE_GROUP.get(str(snap_pos.get(pid)).upper())
        if g:
            grp[pid] = g

    # The weeks PFR has posted, per team; the defensive groups are built only from these.
    pfr_ok = {(t, w) for t, w in zip(pfr["defense"]["team"], pfr["defense"]["week"])}
    pfr_weeks: dict[str, dict[int, str]] = {}
    for t, w in pfr_ok:
        if t in weeks_of and w in weeks_of[t]:
            pfr_weeks.setdefault(t, {})[w] = weeks_of[t][w]

    comps = offense_components(pbp, grp, pfr, pfr_ok, src.get("ftn"))
    comps.update(special_components(pbp))
    comps["ol"] = line_components(raw, pbp, snaps, grp, done)
    dfn = defense_components(pbp, pfr["defense"], snaps, pfr_ok)
    dfn["group"] = dfn["id"].map(grp)
    for g in ("edge", "idl", "lb", "cb", "saf"):
        comps[g] = dfn[dfn["group"] == g]

    windows = {"off": {t: window_of(ws) for t, ws in weeks_of.items()}, "def": {t: window_of(ws) for t, ws in pfr_weeks.items()}}
    all_weeks = sorted({w for ws in weeks_of.values() for w in ws})
    last_off = max(all_weeks)
    last_def = max((w for ws in pfr_weeks.values() for w in ws), default=0)

    rows: list[dict] = []
    yard: dict[str, dict] = {}
    logs: dict[str, dict] = {}
    league_n: dict[str, int] = {}
    like: dict[str, list[str]] = {}
    for g in GROUP_ORDER:
        side = SIDE_OF[g]
        weeks = [w for w in all_weeks if w <= (last_def if side == "def" else last_off)]
        res = grade_group(g, comps.get(g), windows, weeks, names, pos, snaps, pfr_weeks if side == "def" else weeks_of,
                          last_def if side == "def" else last_off)
        if not res.rows:
            continue
        rows += res.rows
        yard[g] = res.yard
        league_n[g] = res.qualifiers
        logs.update({(pid, g): v for pid, v in res.logs.items()})
        by_id = {r["id"]: r for r in res.rows}
        for pid, others in comparables(res.rows, g).items():
            by_id[pid]["_like"] = others

    bios = bios_of(roster, {r["id"] for r in rows}, season)

    # A slug for every person, stable between builds: his name, then his team, then a piece of his id when two share both.
    slug_of: dict[str, str] = {}
    taken: set[str] = set()
    for r in sorted(rows, key=lambda r: (r["name"], r["id"])):
        if r["id"] in slug_of:
            continue
        base = slugify(r["name"])
        slug = base
        if slug in taken:
            slug = f"{base}-{r['team'].lower()}"
        if slug in taken:
            slug = f"{base}-{r['id'][-4:].lower()}"
        taken.add(slug)
        slug_of[r["id"]] = slug
    for r in rows:
        r["slug"] = slug_of[r["id"]]
        r["like"] = [slug_of[i] for i in r.pop("_like", []) if i in slug_of]
    rows.sort(key=lambda r: (GROUP_ORDER.index(r["group"]), r["name"], r["id"]))

    for r in rows:
        r["espn"] = bios.get(r["id"], {}).get("espn")
        if r["espn"] is None:
            r.pop("espn")
            if bios.get(r["id"], {}).get("shot"):
                r["shot"] = bios[r["id"]]["shot"]
    people = {slug_of[i]: b for i, b in bios.items() if i in slug_of}
    for b in people.values():
        b.pop("espn", None)
        b.pop("shot", None)
    win = win_translation(logs, rows, results)
    groups_of: dict[str, set[str]] = {}
    for r in rows:
        groups_of.setdefault(r["id"], set()).add(r["group"])
    sit = build_situations(pbp, groups_of, slug_of)

    off_form, _ = windows["off"].get(team, (set(), set()))
    def_form, _ = windows["def"].get(team, (set(), set()))
    return {
        "season": season,
        "week": last_off,
        "team": team,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "formGames": form_size(len(weeks_of.get(team, {})) or 0),
        "weeks": all_weeks,
        "formWeeks": sorted(off_form),
        "defFormWeeks": sorted(def_form),
        "defWeek": last_def,
        "leagueN": league_n,
        "opp": {t: {str(w): o for w, o in sorted(ws.items())} for t, ws in sorted(weeks_of.items())},
        "yard": yard,
        "players": rows,
        "_logs": {"season": season, "week": last_off, "logs": _logs_by_slug(logs, rows, slug_of), "bio": people,
                  "res": {t: {str(w): v for w, v in sorted(ws.items())} for t, ws in sorted(results.items())}, "win": win},
        "_sit": {"season": season, "week": last_off, **sit},
    }


def _logs_by_slug(logs: dict, rows: list[dict], slug_of: dict[str, str]) -> dict:
    """{slug: {group: {"g": {stat: [[week, value, volume, percentile]]}, "t": {week: team}}}}."""
    out: dict[str, dict] = {}
    for (pid, g), v in logs.items():
        if pid in slug_of:
            out.setdefault(slug_of[pid], {})[g] = v
    return out


# ---------------------------------------------------------------------------------------------- loading


def _read(url_or_path: str, **kw) -> pd.DataFrame:
    if "://" not in url_or_path:
        return pd.read_csv(url_or_path, low_memory=False, **kw)
    with urllib.request.urlopen(url_or_path, timeout=180) as resp:  # noqa: S310 - fixed https URLs
        data = resp.read()
    if url_or_path.endswith(".gz"):
        data = gzip.decompress(data)
    return pd.read_csv(io.BytesIO(data), low_memory=False, **kw)


def load(season: int, folder: str | None) -> dict[str, pd.DataFrame]:
    src = {}
    for key, fname in FILES.items():
        where = str(Path(folder) / fname.format(season=season)) if folder else URLS[key].format(season=season)
        kw = {"usecols": lambda c: c in PBP_COLS} if key == "pbp" else {"usecols": lambda c: c in FTN_COLS} if key == "ftn" else {}
        try:
            src[key] = _read(where, **kw)
        except Exception as e:  # noqa: BLE001 - the optional charting file may simply not exist yet
            if key not in OPTIONAL:
                raise
            print(f"skipping {key}: {e}", file=sys.stderr)
    return src


def _write_if_changed(path: Path, payload: dict) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    old = None
    if path.exists():
        try:
            old = json.loads(path.read_text())
        except json.JSONDecodeError:
            pass
    if old is not None and {**old, "generatedAt": ""} == {**payload, "generatedAt": ""}:
        return False
    path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--team", default="LV")
    ap.add_argument("--input", help="folder with the source files instead of downloading them")
    ap.add_argument("--out", default="data/lab/players.json")
    ap.add_argument("--logs-out", help="where the game-by-game trail goes; defaults to player-logs.json beside --out")
    args = ap.parse_args(argv)

    result = build(load(args.season, args.input), args.season, args.team)
    if not result.get("players"):
        print("no finished games with player data yet; leaving the existing file alone", file=sys.stderr)
        return 0
    logs = result.pop("_logs")
    logs["generatedAt"] = result["generatedAt"]
    sit = result.pop("_sit")
    sit["generatedAt"] = result["generatedAt"]
    sit["source"] = LICENSE
    out = Path(args.out)
    logs_out = Path(args.logs_out) if args.logs_out else out.with_name("player-logs.json")
    changed = _write_if_changed(out, result)
    changed = _write_if_changed(logs_out, logs) or changed
    changed = _write_if_changed(out.with_name("player-situations.json"), sit) or changed
    if not changed:
        print("data unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
