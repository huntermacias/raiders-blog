#!/usr/bin/env python3
"""Build the player movers behind /lab/players: who is playing better or worse than he was, in numbers the box score hides.

Sources (nflverse, CC BY 4.0): play-by-play, PFR advanced stats, snap counts, rosters.
Run:    python scripts/lab/build_players.py --season 2026 --out data/lab/players.json

Every player in the league is measured the same way, so each Raiders number comes with the league's yardstick next to it.

    season   every finished game so far
    form     the player's team's last FORM_GAMES finished games
    earlier  everything before that

A stat is a numerator over a denominator (EPA over targets, say), so any slice of games is a sum over a sum and not an average
of averages. Each slice is graded against the league's players at the same position who had enough volume in that slice, on the
scouting scale: 50 is the average, every 10 points is one standard deviation, and for a stat where lower is better the scale is
flipped so a higher grade is always better. A mover is the average change in grade from `earlier` to `form`. Grading against the
league means a player has to move against everyone else, not only against himself, and a league-wide quiet week cannot look
like a collapse. The grade has no ceiling, so a player already at the top can still be seen getting better. The season
percentile (100 is best) is kept beside it to read a single number against the league.
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

import numpy as np
import pandas as pd

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
URLS = {
    "pbp": BASE + "/pbp/play_by_play_{season}.csv.gz",
    "roster": BASE + "/rosters/roster_{season}.csv",
    "snaps": BASE + "/snap_counts/snap_counts_{season}.csv",
    "pass": BASE + "/pfr_advstats/advstats_week_pass_{season}.csv",
    "rush": BASE + "/pfr_advstats/advstats_week_rush_{season}.csv",
    "rec": BASE + "/pfr_advstats/advstats_week_rec_{season}.csv",
    "defense": BASE + "/pfr_advstats/advstats_week_def_{season}.csv",
}
FILES = {
    "pbp": "play_by_play_{season}.csv.gz", "roster": "roster_{season}.csv", "snaps": "snap_counts_{season}.csv",
    "pass": "advstats_week_pass_{season}.csv", "rush": "advstats_week_rush_{season}.csv",
    "rec": "advstats_week_rec_{season}.csv", "defense": "advstats_week_def_{season}.csv",
}
LICENSE = "nflverse data (play-by-play, PFR advanced stats, snap counts, rosters), CC BY 4.0. Calculations by Raiders Rundown."

SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}

# How many of a team's latest games make up "form".
FORM_GAMES = 2

POS_GROUP = {
    "QB": "qb",
    "WR": "rec", "TE": "rec",
    "RB": "run", "FB": "run", "HB": "run",
    "DE": "rush", "DT": "rush", "NT": "rush", "DL": "rush", "EDGE": "rush", "OLB": "rush",
    "LB": "rund", "ILB": "rund", "MLB": "rund",
    "CB": "cov", "S": "cov", "FS": "cov", "SS": "cov", "DB": "cov",
}
# Offense plays on offense snaps, everyone else on defense snaps.
SIDE = {"qb": "off", "rec": "off", "run": "off", "rush": "def", "rund": "def", "cov": "def"}

# key: (numerator, denominator, higher is better or None for a style stat, volume needed: season, form, earlier, scale, counts)
# A style stat (how deep he is thrown to) is shown but is neither good nor bad, so it never moves a player up or down.
# `scale` multiplies the ratio into the number the page shows (a rate per 100 snaps, for instance).
# `counts` is False for a stat that is shown and graded but left out of the mover score, because it is mostly zeros (drops).
Stat = tuple


def S(num, den, higher, season, form, earlier, scale=1.0, counts=True):
    return (num, den, higher, season, form, earlier, scale, counts)


STATS: dict[str, dict[str, Stat]] = {
    "qb": {
        "epaDb": S("epa", "db", True, 40, 25, 20),
        "success": S("succ", "db", True, 40, 25, 20),
        "cpoe": S("cpoe", "cpoe_n", True, 40, 25, 20),
        "badThrow": S("bad", "att_p", False, 40, 25, 20),
        "adot": S("air", "air_n", None, 40, 25, 20),
    },
    "rec": {
        "epaTgt": S("epa", "tgt", True, 12, 5, 6),
        "croe": S("croe", "croe_n", True, 12, 5, 6),
        "yacOe": S("yacoe", "yacoe_n", True, 8, 3, 4),
        "drop": S("drop", "tgt_p", False, 12, 5, 6, counts=False),
        "share": S("tgt", "team_att", True, 12, 5, 6),
        "adot": S("air", "air_n", None, 12, 5, 6),
    },
    "run": {
        "epaRush": S("epa", "car", True, 20, 8, 10),
        "success": S("succ", "car", True, 20, 8, 10),
        "explosive": S("expl", "car", True, 20, 8, 10),
        "yco": S("yco", "pfr_car", True, 20, 8, 10),
        "broken": S("broken", "pfr_car", True, 20, 8, 10),
        "ybc": S("ybc", "pfr_car", None, 20, 8, 10),
    },
    "rush": {
        "pressRate": S("press_s", "snaps_s", True, 80, 40, 40, 100.0),
        "missedPct": S("missed", "tackle_chances", False, 10, 5, 5),
    },
    "rund": {
        "missedPct": S("missed", "tackle_chances", False, 10, 5, 5),
        "tackleRate": S("tackles_s", "snaps_s", True, 80, 40, 40, 100.0),
    },
    "cov": {
        "yardsTgt": S("yds", "tgts", False, 10, 6, 6),
        "rating": S("rating_num", "tgts", False, 10, 6, 6),
        "missedPct": S("missed", "tackle_chances", False, 10, 5, 5),
    },
}
# The stat the weekly line on a player's card follows.
HEADLINE = {"qb": "epaDb", "rec": "epaTgt", "run": "epaRush", "rush": "pressRate", "rund": "missedPct", "cov": "yardsTgt"}
# A player needs this many measured stats in both windows before he can be called a riser or a faller.
MIN_STATS = {"qb": 2, "rec": 2, "run": 2, "rush": 1, "rund": 1, "cov": 2}

PBP_COLS = [
    "game_id", "play_id", "week", "season_type", "posteam", "defteam", "play_type", "epa", "success", "yards_gained",
    "pass_attempt", "complete_pass", "qb_dropback", "qb_scramble", "interception", "sack", "air_yards", "yards_after_catch",
    "receiver_player_id", "passer_player_id", "rusher_player_id", "cpoe", "cp", "xyac_mean_yardage", "penalty", "desc",
]


# ---------------------------------------------------------------------------------------------- small helpers


def site(df: pd.DataFrame, cols: tuple[str, ...]) -> pd.DataFrame:
    df = df.copy()
    for c in cols:
        if c in df:
            df[c] = df[c].replace(SITE_ABBR)
    return df


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


def percentiles(values: dict[str, float], higher: bool) -> dict[str, float]:
    """{id: 0-100} with 100 the best value. Ties share the average place, except a tie for the best value: nobody is
    better than a player with no drops, so every one of them is 100 and a quiet week cannot look like a slide."""
    if len(values) < 2:
        return {}
    s = pd.Series(values, dtype=float)
    place = s.rank(method="average", ascending=higher)  # best ends up highest
    best = s.max() if higher else s.min()
    return {k: 100.0 if s[k] == best else round(float((v - 1) / (len(s) - 1) * 100), 1) for k, v in place.items()}


def grades(values: dict[str, float], higher: bool) -> dict[str, float]:
    """{id: grade} on the 20-80 scouting scale: 50 is the average of `values`, each 10 points one standard deviation, and a
    higher grade is always better. No ceiling, so a player already at the top can still get better."""
    if len(values) < 3:
        return {}
    s = pd.Series(values, dtype=float)
    sd = float(s.std(ddof=0))
    if sd == 0:
        return {k: 50.0 for k in s.index}
    z = (s - s.mean()) / sd
    return {k: round(float(50 + 10 * (v if higher else -v)), 1) for k, v in z.items()}


def ratio(num: float, den: float, scale: float = 1.0) -> float | None:
    if not den or pd.isna(den):
        return None
    return float(num) / float(den) * scale


def count(df: pd.DataFrame, keys: list[str], name: str) -> pd.DataFrame:
    return df.groupby(keys).size().rename(name).reset_index()


def merge_all(frames: list[pd.DataFrame], keys: list[str]) -> pd.DataFrame:
    out = frames[0]
    for f in frames[1:]:
        out = out.merge(f, on=keys, how="outer")
    return out


# ---------------------------------------------------------------------------------------------- weekly components


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


def offense_components(pbp: pd.DataFrame, pos: dict[str, str], pfr: dict[str, pd.DataFrame], pfr_ok: set[tuple[str, int]]) -> dict[str, pd.DataFrame]:
    """Per player per game for the offensive groups. Play-by-play lands within hours of the final whistle and the PFR tables a day
    or two later, so a rate that divides a PFR count by a play-by-play count (bad throws per attempt, drops per target) counts a
    play only in a game PFR has posted. Without that the newest game would dilute the rate."""
    plays = pbp[pbp["play_type"].isin(["pass", "run"]) & pbp["epa"].notna()].copy()
    plays["success"] = plays["success"].fillna(0)
    keys = lambda who: [who, "posteam", "week"]  # noqa: E731
    out: dict[str, pd.DataFrame] = {}

    # Quarterbacks.
    drops = plays[(plays["qb_dropback"] == 1) & plays["passer_player_id"].map(pos).eq("QB")]
    k = keys("passer_player_id")
    q = merge_all([
        drops.groupby(k).agg(db=("epa", "size"), epa=("epa", "sum"), succ=("success", "sum")).reset_index(),
        drops[drops["cpoe"].notna()].groupby(k).agg(cpoe=("cpoe", "sum"), cpoe_n=("cpoe", "size")).reset_index(),
        drops[(drops["pass_attempt"] == 1)].groupby(k).agg(att=("epa", "size")).reset_index(),
        drops[(drops["pass_attempt"] == 1) & drops["air_yards"].notna()].groupby(k).agg(air=("air_yards", "sum"), air_n=("air_yards", "size")).reset_index(),
    ], k).rename(columns={"passer_player_id": "id", "posteam": "team"})
    bad = pfr["pass"][["id", "team", "week", "passing_bad_throws"]]
    bad = bad.dropna(subset=["id"]).groupby(["id", "team", "week"], as_index=False)["passing_bad_throws"].sum().rename(columns={"passing_bad_throws": "bad"})
    q = q.merge(bad, on=["id", "team", "week"], how="left")
    q["att_p"] = np.where([(t, w) in pfr_ok for t, w in zip(q["team"], q["week"])], q["att"], 0)
    out["qb"] = q

    # Receivers: every target. A completion is measured against the catch the play was expected to be.
    tg = plays[(plays["pass_attempt"] == 1) & plays["receiver_player_id"].map(pos).isin(["WR", "TE"])].copy()
    tg["croe_v"] = tg["complete_pass"] - tg["cp"]
    comp = tg[(tg["complete_pass"] == 1) & tg["yards_after_catch"].notna() & tg["xyac_mean_yardage"].notna()].copy()
    comp["yacoe_v"] = comp["yards_after_catch"] - comp["xyac_mean_yardage"]
    k = keys("receiver_player_id")
    r = merge_all([
        tg.groupby(k).agg(tgt=("epa", "size"), epa=("epa", "sum")).reset_index(),
        tg[tg["croe_v"].notna()].groupby(k).agg(croe=("croe_v", "sum"), croe_n=("croe_v", "size")).reset_index(),
        comp.groupby(k).agg(yacoe=("yacoe_v", "sum"), yacoe_n=("yacoe_v", "size")).reset_index(),
        tg[tg["air_yards"].notna()].groupby(k).agg(air=("air_yards", "sum"), air_n=("air_yards", "size")).reset_index(),
    ], k).rename(columns={"receiver_player_id": "id", "posteam": "team"})
    team_att = plays[plays["pass_attempt"] == 1].groupby(["posteam", "week"]).size().rename("team_att").reset_index().rename(columns={"posteam": "team"})
    drop = pfr["rec"][["id", "team", "week", "receiving_drop"]]
    drop = drop.dropna(subset=["id"]).groupby(["id", "team", "week"], as_index=False)["receiving_drop"].sum().rename(columns={"receiving_drop": "drop"})
    r = r.merge(team_att, on=["team", "week"], how="left").merge(drop, on=["id", "team", "week"], how="left")
    r["tgt_p"] = np.where([(t, w) in pfr_ok for t, w in zip(r["team"], r["week"])], r["tgt"], 0)
    out["rec"] = r

    # Runners: designed carries, so a scramble is the quarterback's.
    rn = plays[(plays["play_type"] == "run") & (plays["qb_scramble"].fillna(0) != 1) & plays["rusher_player_id"].map(pos).isin(["RB", "FB", "HB"])].copy()
    rn["expl"] = (rn["yards_gained"] >= 10).astype(int)
    k = keys("rusher_player_id")
    u = rn.groupby(k).agg(car=("epa", "size"), epa=("epa", "sum"), succ=("success", "sum"), expl=("expl", "sum")).reset_index()
    u = u.rename(columns={"rusher_player_id": "id", "posteam": "team"})
    pr = pfr["rush"].dropna(subset=["id"]).groupby(["id", "team", "week"], as_index=False).agg(
        pfr_car=("carries", "sum"), ybc=("rushing_yards_before_contact", "sum"), yco=("rushing_yards_after_contact", "sum"),
        broken=("rushing_broken_tackles", "sum"))
    out["run"] = u.merge(pr, on=["id", "team", "week"], how="left")
    return out


def defense_components(pfr_def: pd.DataFrame, snaps: pd.DataFrame) -> pd.DataFrame:
    """Per defender per game. `snaps` already carries the player's `id`.

    A rate per snap needs the snap count and the PFR line from the same game. Snap counts for the newest game can arrive a day
    after the PFR table, so the snap-based numerators are zeroed for a team-week with no snap data, which leaves that game out of
    those rates and out of nothing else.
    """
    d = pfr_def.dropna(subset=["id"]).copy()
    out = d.groupby(["id", "team", "week"], as_index=False).agg(
        press=("def_pressures", "sum"), tackles=("def_tackles_combined", "sum"), missed=("def_missed_tackles", "sum"),
        tgts=("def_targets", "sum"), cmp=("def_completions_allowed", "sum"), yds=("def_yards_allowed", "sum"),
        td=("def_receiving_td_allowed", "sum"), ints=("def_ints", "sum"))
    out["tackle_chances"] = out["tackles"] + out["missed"]
    # The passer rating against him is not a sum. It is stored as a rating times targets, so a slice of games still divides back out.
    out["rating_num"] = [
        (passer_rating(r.tgts, r.cmp, r.yds, r.td, r.ints) or 0.0) * r.tgts for r in out.itertuples()
    ]
    sn = snaps.dropna(subset=["id"]).groupby(["id", "team", "week"], as_index=False).agg(snaps=("defense_snaps", "sum"))
    out = out.merge(sn, on=["id", "team", "week"], how="outer")
    for c in out.columns:
        if c not in ("id", "team"):
            out[c] = out[c].fillna(0)
    have = {(t, w) for t, w in zip(snaps["team"], snaps["week"])}
    ok = np.array([(t, w) in have for t, w in zip(out["team"], out["week"])])
    out["snaps_s"] = np.where(ok, out["snaps"], 0.0)
    out["press_s"] = np.where(ok, out["press"], 0.0)
    out["tackles_s"] = np.where(ok, out["tackles"], 0.0)
    return out


# ---------------------------------------------------------------------------------------------- the build


def window_of(team_games: dict[int, str]) -> tuple[set[int], set[int]]:
    """(form weeks, earlier weeks) for one team."""
    weeks = sorted(team_games)
    form = set(weeks[-FORM_GAMES:])
    return form, set(weeks) - form


def stat_value(rows: pd.DataFrame, stat: Stat) -> tuple[float | None, float]:
    num, den, _h, _s, _f, _e, scale, _c = stat
    if rows.empty or num not in rows or den not in rows:
        return None, 0.0
    d = float(rows[den].fillna(0).sum())
    return ratio(float(rows[num].fillna(0).sum()), d, scale), d


def snap_share(snaps: pd.DataFrame, side: str, weeks: list[int], pid: str, team: str) -> float | None:
    """Mean share of the team's snaps over the `weeks` that have snap counts; a counted game he did not play is zero."""
    counted = sorted(set(snaps.loc[snaps["team"] == team, "week"]) & set(weeks))
    if not counted:
        return None
    col = "offense_pct" if side == "off" else "defense_pct"
    mine = snaps[(snaps["id"] == pid) & (snaps["team"] == team) & snaps["week"].isin(counted)]
    return round(float(mine[col].fillna(0).sum()) / len(counted), 3)


def name_key(name) -> str:
    return "".join(ch for ch in str(name).lower() if ch.isalnum())


def attach_ids(df: pd.DataFrame, name_col: str, to_gsis: dict[str, str], by_name: dict[tuple[str, str], str]) -> pd.DataFrame:
    """Give a PFR-keyed table the nflverse player id. A player the roster file has no PFR id for (a recent signing) is matched
    by name within his team instead."""
    df = df.copy()
    df["id"] = df["pfr_player_id"].map(to_gsis)
    miss = df["id"].isna()
    if miss.any():
        df.loc[miss, "id"] = [by_name.get((name_key(n), t)) for n, t in zip(df.loc[miss, name_col], df.loc[miss, "team"])]
    return df


def build(src: dict[str, pd.DataFrame], season: int, team: str = "LV") -> dict:
    raw = site(src["pbp"], ("posteam", "defteam"))
    raw = raw[raw["season_type"] == "REG"]
    games = finished_games(raw)
    weeks_of = team_weeks(games)
    if team not in weeks_of:
        return {"season": season, "players": []}
    # A game counts once its last play is in, and every table is cut down to the games that count, so the stats, the snap
    # shares and the windows all describe the same games.
    done = {(t, w) for t, ws in weeks_of.items() for w in ws}
    pbp = raw[raw["penalty"].fillna(0) != 1] if "penalty" in raw else raw
    pbp = pbp[[(t, w) in done for t, w in zip(pbp["posteam"], pbp["week"])]]

    roster = site(src["roster"], ("team",)).drop_duplicates("gsis_id", keep="last")
    pos = dict(zip(roster["gsis_id"], roster["position"]))
    names = dict(zip(roster["gsis_id"], roster["full_name"]))
    to_gsis = {k: v for k, v in zip(roster["pfr_id"], roster["gsis_id"]) if isinstance(k, str)}
    by_name = {(name_key(n), t): i for n, t, i in zip(roster["full_name"], roster["team"], roster["gsis_id"])}

    def keep(df: pd.DataFrame, name_col: str) -> pd.DataFrame:
        df = site(df, ("team", "opponent"))
        df = df[df["game_type"] == "REG"] if "game_type" in df else df
        df = df[[(t, w) in done for t, w in zip(df["team"], df["week"])]]
        return attach_ids(df, name_col, to_gsis, by_name)

    pfr = {k: keep(src[k], "pfr_player_name") for k in ("pass", "rush", "rec", "defense")}
    snaps = keep(src["snaps"], "player")

    # The weeks PFR has posted, per team; the defensive groups are built only from these.
    pfr_ok = {(t, w) for t, w in zip(pfr["defense"]["team"], pfr["defense"]["week"])}
    pfr_weeks: dict[str, dict[int, str]] = {}
    for t, w in pfr_ok:
        if t in weeks_of and w in weeks_of[t]:
            pfr_weeks.setdefault(t, {})[w] = weeks_of[t][w]

    comps = offense_components(pbp, pos, pfr, pfr_ok)
    dfn = defense_components(pfr["defense"], snaps)
    dfn["group"] = dfn["id"].map(lambda i: POS_GROUP.get(pos.get(i, ""), ""))
    for g in ("rush", "rund", "cov"):
        comps[g] = dfn[dfn["group"] == g]

    windows = {"off": {t: window_of(ws) for t, ws in weeks_of.items()}, "def": {t: window_of(ws) for t, ws in pfr_weeks.items()}}
    for g, df in comps.items():
        win = windows[SIDE[g]]
        df["slice"] = ["form" if w in win.get(t, (set(), set()))[0] else "earlier" for t, w in zip(df["team"], df["week"])]

    players: list[dict] = []
    league_n: dict[str, int] = {}
    tg = weeks_of[team]
    for g, stats in STATS.items():
        df = comps.get(g)
        if df is None or df.empty:
            continue
        latest = df.sort_values("week").groupby("id")["team"].last()
        by_player = {pid: rows for pid, rows in df.groupby("id")}
        # Value and volume for every player in the league, per stat and slice.
        table = {
            pid: {key: {"season": stat_value(rows, stat), "form": stat_value(rows[rows["slice"] == "form"], stat),
                        "earlier": stat_value(rows[rows["slice"] == "earlier"], stat)} for key, stat in stats.items()}
            for pid, rows in by_player.items()
        }
        pct: dict[str, dict[str, dict[str, float]]] = {}
        grade: dict[str, dict[str, dict[str, float]]] = {}
        qualified = 0
        for key, stat in stats.items():
            need = {"season": stat[3], "form": stat[4], "earlier": stat[5]}
            pct[key], grade[key] = {}, {}
            for sl in ("season", "form", "earlier"):
                vals = {pid: table[pid][key][sl][0] for pid in by_player
                        if table[pid][key][sl][0] is not None and table[pid][key][sl][1] >= need[sl]}
                pct[key][sl] = percentiles(vals, stat[2]) if stat[2] is not None else {}
                grade[key][sl] = grades(vals, stat[2]) if stat[2] is not None else {}
                if sl == "season":
                    qualified = max(qualified, len(vals))
        league_n[g] = qualified

        head = stats[HEADLINE[g]]
        for pid, rows in by_player.items():
            if latest[pid] != team or not names.get(pid):
                continue
            entries, deltas = [], []
            for key, stat in stats.items():
                need = {"season": stat[3], "form": stat[4], "earlier": stat[5]}
                one: dict = {"k": key}
                for sl in ("season", "form", "earlier"):
                    v, n = table[pid][key][sl]
                    ok = n >= need[sl]
                    one[sl] = None if v is None else {
                        "v": round(v, 4), "n": round(n, 1), "pct": pct[key][sl].get(pid) if ok else None,
                        "g": grade[key][sl].get(pid) if ok else None}
                # A stat with too little volume over the season says nothing; a style stat is only description, so it stays.
                if stat[2] is not None and (one["season"] is None or one["season"]["pct"] is None):
                    continue
                f, e = one["form"], one["earlier"]
                if stat[2] is not None and f and e and f["g"] is not None and e["g"] is not None:
                    one["delta"] = round(f["g"] - e["g"], 1)
                    if stat[7]:
                        # How far to trust the change: half at the volume the stat needs to count at all, three quarters at triple it.
                        deltas.append((key, one["delta"], f["n"] / (f["n"] + stat[4])))
                entries.append(one)
            if not any(STATS[g][e["k"]][2] is not None for e in entries):
                continue

            mover = None
            if len(deltas) >= MIN_STATS[g]:
                # The outcome stat counts double: a quarterback whose EPA is up should not be a faller because of one throw-quality number.
                # A small recent sample pulls the score toward zero, because a stat over a handful of plays swings on a few plays.
                weights = [2.0 if k == HEADLINE[g] else 1.0 for k, _, _ in deltas]
                score = round(float(sum(w * c * d for w, (_, d, c) in zip(weights, deltas)) / sum(weights)), 1)
                driver = max(deltas, key=lambda kdc: abs(kdc[1]))[0]
                agree = sum(1 for _, d, _ in deltas if d * score > 0)
                mover = {"score": score, "driver": driver, "stats": len(deltas), "agree": agree}

            form_w, earlier_w = windows[SIDE[g]].get(team, (set(), set()))
            weekly = []
            for w in sorted(tg):
                v, n = stat_value(rows[rows["week"] == w], head)
                weekly.append({"w": w, "opp": tg[w], "v": None if v is None else round(v, 4), "n": round(n, 1)})
            share = {sl: snap_share(snaps, SIDE[g], sorted(ws), pid, team)
                     for sl, ws in (("season", set(tg)), ("form", form_w), ("earlier", earlier_w))}
            players.append({
                "id": pid, "name": names[pid], "pos": pos.get(pid, ""), "group": g, "games": int(rows["week"].nunique()),
                "stats": entries, "mover": mover, "weekly": weekly, "snaps": share,
            })

    players.sort(key=lambda p: (p["group"], p["name"]))
    off_form, _ = windows["off"][team]
    def_form, _ = windows["def"].get(team, (set(), set()))
    return {
        "season": season,
        "week": max(tg),
        "team": team,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "formGames": FORM_GAMES,
        "formWeeks": sorted(off_form),
        "defFormWeeks": sorted(def_form),
        "defWeek": max(pfr_weeks.get(team, {0: ""})),
        "games": [{"w": w, "opp": tg[w]} for w in sorted(tg)],
        "leagueN": league_n,
        "players": players,
    }


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
        kw = {"usecols": lambda c: c in PBP_COLS} if key == "pbp" else {}
        src[key] = _read(where, **kw)
    return src


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--team", default="LV")
    ap.add_argument("--input", help="folder with the source files instead of downloading them")
    ap.add_argument("--out", default="data/lab/players.json")
    args = ap.parse_args(argv)

    result = build(load(args.season, args.input), args.season, args.team)
    if not result.get("players"):
        print("no finished games with player data yet; leaving the existing file alone", file=sys.stderr)
        return 0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    old = None
    if out.exists():
        try:
            old = json.loads(out.read_text())
        except json.JSONDecodeError:
            pass
    if old is not None and {**old, "generatedAt": ""} == {**result, "generatedAt": ""}:
        print("data unchanged")
        return 0
    out.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"wrote {out} ({len(result['players'])} players, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
