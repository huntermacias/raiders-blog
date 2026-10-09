#!/usr/bin/env python3
"""Build how every team stacks up, position group by position group.

Sources (all nflverse, CC BY 4.0): play-by-play, FTN charting, PFR advanced stats, snap counts, injury reports,
rosters and the nfldata games file (coaches, spreads, rest).
Run:    python scripts/lab/build_units.py --season 2026 --out data/lab/units.json

For every team this writes seven position-group grades (quarterback, offensive line, receivers, run game,
pass rush, run defense, coverage), each made of a few plain stats with a league rank (1 is best); how the
offense and defense like to play; the head coach's record, record against the spread and history against
the next opponent's coach; the latest injury report sorted by position group; and the coming week's slate.
Early in the season the samples are small, so the file records how many games each team has played.
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
    "injuries": BASE + "/injuries/injuries_{season}.csv",
    "ftn": BASE + "/ftn_charting/ftn_charting_{season}.csv",
    "pass": BASE + "/pfr_advstats/advstats_week_pass_{season}.csv",
    "rush": BASE + "/pfr_advstats/advstats_week_rush_{season}.csv",
    "rec": BASE + "/pfr_advstats/advstats_week_rec_{season}.csv",
    "defense": BASE + "/pfr_advstats/advstats_week_def_{season}.csv",
    "games": "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
}
LICENSE = "nflverse data (play-by-play, FTN charting, PFR advanced stats, snap counts, injuries, games), CC BY 4.0. Calculations by Raiders Rundown."

# nflverse writes the Rams as LA; the site uses LAR. The games file also keeps the old city names, so a
# franchise's history can be followed back.
SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}

# The nfldata games file has a few misspelled coaches.
COACH_FIX = {"Klint Kubliak": "Klint Kubiak"}

# group -> stat -> (higher is better)
GROUPS: dict[str, dict[str, bool]] = {
    "qb": {"epaDb": True, "cpoe": True, "intRate": False, "bigPass": True},
    "ol": {"sackRate": False, "pressure": False, "ybc": True, "stuffed": False},
    "rec": {"epaTgt": True, "yac": True, "drop": False, "broken": True},
    "run": {"epaRush": True, "success": True, "yco": True, "explosive": True},
    "rush": {"sackRate": True, "pressure": True, "hitRate": True},
    "rund": {"epaRush": False, "stuff": True, "explosive": False, "missed": False},
    "cov": {"epaAtt": False, "cpoe": False, "bigPass": False, "intRate": True, "rating": False},
}
OFFENSE_GROUPS = ("qb", "ol", "rec", "run")
DEFENSE_GROUPS = ("rush", "rund", "cov")

# Style stats are not good or bad; rank 1 is the highest rate.
STYLE = {
    "off": ("proe", "playAction", "motion", "noHuddle", "shotgun"),
    "def": ("blitz", "rushers", "loadedBox"),
}

# Injury report positions -> the group they belong to.
POS_GROUP = {
    "QB": "qb",
    "T": "ol", "G": "ol", "C": "ol", "OT": "ol", "OG": "ol", "OL": "ol",
    "WR": "rec", "TE": "rec",
    "RB": "run", "FB": "run", "HB": "run",
    "DE": "rush", "DT": "rush", "NT": "rush", "DL": "rush", "EDGE": "rush",
    "LB": "rund", "ILB": "rund", "MLB": "rund", "OLB": "rund",
    "CB": "cov", "S": "cov", "FS": "cov", "SS": "cov", "DB": "cov",
}

PBP_COLS = [
    "game_id", "play_id", "week", "season_type", "posteam", "defteam", "play_type", "down", "epa", "success",
    "yards_gained", "pass_attempt", "complete_pass", "qb_dropback", "sack", "qb_scramble", "qb_hit", "interception",
    "yards_after_catch", "receiver_player_id", "receiver_player_name", "passer_player_id", "passer_player_name",
    "rusher_player_id", "rusher_player_name", "cpoe", "pass_oe", "no_huddle", "shotgun", "penalty",
]
FTN_COLS = [
    "nflverse_game_id", "nflverse_play_id", "is_play_action", "is_motion", "n_blitzers", "n_pass_rushers", "n_defense_box",
]


# ---------------------------------------------------------------------------------------------- small helpers


def ratio(num: float, den: float) -> float | None:
    return None if not den or pd.isna(den) else float(num) / float(den)


def avg(series: pd.Series) -> float | None:
    s = series.dropna()
    return None if s.empty else float(s.mean())


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


def rank_stat(values: dict[str, float | None], higher_better: bool | None) -> dict[str, dict]:
    """{team: {v, rank}} with rank 1 best. `higher_better` None ranks by highest value (style stats)."""
    vals = {t: v for t, v in values.items() if v is not None and not pd.isna(v)}
    best_high = True if higher_better is None else higher_better
    order = sorted(vals, key=lambda t: (-vals[t] if best_high else vals[t], t))
    return {t: {"v": round(float(vals[t]), 4), "rank": i + 1} for i, t in enumerate(order)}


def grade(ranks: list[int], n: int) -> float | None:
    """Mean percentile of a group's stat ranks, 100 is best in the league."""
    if not ranks or n < 2:
        return None
    return round(float(np.mean([(n - r) / (n - 1) * 100 for r in ranks])), 1)


# ---------------------------------------------------------------------------------------------- play-by-play


def scrimmage(plays: pd.DataFrame) -> pd.DataFrame:
    return plays[plays["play_type"].isin(["pass", "run"]) & plays["epa"].notna()]


def pbp_side(plays: pd.DataFrame, team: str, side: str) -> dict:
    """Play-by-play stats for one team, as the offense (`off`) or as the defense (`def`)."""
    mine = plays[plays["posteam" if side == "off" else "defteam"] == team]
    scrim = scrimmage(mine)
    drops = scrim[scrim["qb_dropback"] == 1]
    atts = scrim[scrim["pass_attempt"] == 1]
    runs = scrim[(scrim["play_type"] == "run") & (scrim["qb_scramble"].fillna(0) != 1)]
    targets = atts[atts["receiver_player_id"].notna()]
    caught = atts[atts["complete_pass"] == 1]
    return {
        "dropbacks": int(len(drops)),
        "epaDb": avg(drops["epa"]),
        "epaAtt": avg(atts["epa"]),
        "cpoe": avg(atts["cpoe"]),
        "intRate": ratio((atts["interception"] == 1).sum(), len(atts)),
        "bigPass": ratio((atts["yards_gained"] >= 20).sum(), len(drops)),
        "sackRate": ratio((drops["sack"] == 1).sum(), len(drops)),
        "hitRate": ratio((drops["qb_hit"] == 1).sum(), len(drops)),
        "epaTgt": avg(targets["epa"]),
        "targets": int(len(targets)),
        "yac": avg(caught["yards_after_catch"]),
        "catches": int(len(caught)),
        "epaRush": avg(runs["epa"]),
        "success": avg(runs["success"]),
        "explosive": ratio((runs["yards_gained"] >= 10).sum(), len(runs)),
        "stuffed": ratio((runs["yards_gained"] <= 0).sum(), len(runs)),
        "epaPlay": avg(scrim["epa"]),
        "plays": int(len(scrim)),
    }


# ---------------------------------------------------------------------------------------------- PFR


def pfr_tables(frames: dict[str, pd.DataFrame]) -> dict[str, dict[str, dict]]:
    """Team totals from the PFR weekly files: offense by `team`, defense by `opponent`."""
    out: dict[str, dict[str, dict]] = {"off": {}, "def": {}}
    pas, rush, rec, dfn = (frames[k] for k in ("pass", "rush", "rec", "defense"))
    for team, g in pas.groupby("team"):
        out["off"].setdefault(team, {})["pressured"] = float(g["times_pressured"].fillna(0).sum())
    for team, g in rush.groupby("team"):
        carries = g["carries"].fillna(0).sum()
        out["off"].setdefault(team, {}).update(
            carries=float(carries),
            ybc=ratio(g["rushing_yards_before_contact"].fillna(0).sum(), carries),
            yco=ratio(g["rushing_yards_after_contact"].fillna(0).sum(), carries),
        )
    for team, g in rec.groupby("team"):
        out["off"].setdefault(team, {}).update(
            drops=float(g["receiving_drop"].fillna(0).sum()),
            brokenRec=float(g["receiving_broken_tackles"].fillna(0).sum()),
        )
    for opp, g in rush.groupby("opponent"):
        carries = g["carries"].fillna(0).sum()
        out["def"].setdefault(opp, {}).update(ybcAllowed=ratio(g["rushing_yards_before_contact"].fillna(0).sum(), carries))
    for team, g in dfn.groupby("team"):
        z = lambda c: float(g[c].fillna(0).sum())  # noqa: E731
        tackles, missed = z("def_tackles_combined"), z("def_missed_tackles")
        out["def"].setdefault(team, {}).update(
            pressures=z("def_pressures"),
            missed=ratio(missed, tackles + missed),
            rating=passer_rating(z("def_targets"), z("def_completions_allowed"), z("def_yards_allowed"),
                                 z("def_receiving_td_allowed"), z("def_ints")),
        )
    return out


# ---------------------------------------------------------------------------------------------- style


def style_side(plays: pd.DataFrame, team: str, side: str) -> dict:
    mine = plays[plays["posteam" if side == "off" else "defteam"] == team]
    scrim = scrimmage(mine)
    drops = scrim[(scrim["qb_dropback"] == 1) & scrim["ftn_seen"]]
    seen = scrim[scrim["ftn_seen"]]
    runs = seen[(seen["play_type"] == "run")]
    rushers = drops["n_pass_rushers"][drops["n_pass_rushers"] > 0]
    if side == "off":
        return {
            "proe": avg(mine["pass_oe"]),
            "playAction": ratio((drops["is_play_action"] == 1).sum(), len(drops)),
            "motion": ratio((seen["is_motion"] == 1).sum(), len(seen)),
            "noHuddle": ratio((scrim["no_huddle"] == 1).sum(), len(scrim)),
            "shotgun": ratio((scrim["shotgun"] == 1).sum(), len(scrim)),
        }
    return {
        "blitz": ratio((drops["n_blitzers"] >= 1).sum(), len(drops)),
        "rushers": avg(rushers),
        "loadedBox": ratio((runs["n_defense_box"] >= 8).sum(), len(runs)),
    }


# ---------------------------------------------------------------------------------------------- coaches


def coach_log(games: pd.DataFrame) -> pd.DataFrame:
    """One row per team per finished game with the coach, the result and the spread from that team's side."""
    g = games[games["home_score"].notna() & games["away_score"].notna()].copy()
    g = g[g["game_type"] == "REG"] if "game_type" in g else g
    rows = []
    for side, other in (("home", "away"), ("away", "home")):
        part = pd.DataFrame({
            "season": g["season"], "week": g["week"], "team": g[f"{side}_team"], "opp": g[f"{other}_team"],
            "coach": g[f"{side}_coach"].replace(COACH_FIX), "oppCoach": g[f"{other}_coach"].replace(COACH_FIX),
            "pf": g[f"{side}_score"], "pa": g[f"{other}_score"], "rest": g[f"{side}_rest"],
            # spread_line is how many points the home team was favoured by.
            "fav": g["spread_line"] if side == "home" else -g["spread_line"],
        })
        rows.append(part)
    log = pd.concat(rows, ignore_index=True)
    log["result"] = np.sign(log["pf"] - log["pa"]).astype(int)  # 1 win, 0 tie, -1 loss
    cover = (log["pf"] - log["pa"]) - log["fav"]
    log["ats"] = np.where(log["fav"].isna(), np.nan, np.sign(cover))
    return log


def record(rows: pd.DataFrame) -> dict:
    return {"w": int((rows["result"] == 1).sum()), "l": int((rows["result"] == -1).sum()), "t": int((rows["result"] == 0).sum())}


def ats_record(rows: pd.DataFrame) -> dict:
    s = rows["ats"].dropna()
    return {"w": int((s == 1).sum()), "l": int((s == -1).sum()), "p": int((s == 0).sum())}


def coaching(log: pd.DataFrame, team: str, opponents: list[str], season: int) -> dict | None:
    mine = log[(log["season"] == season) & (log["team"] == team)].sort_values("week")
    if mine.empty:
        return None
    name = str(mine.iloc[-1]["coach"])
    career = log[log["coach"] == name]
    here = career[career["team"] == team]
    franchise = log[log["team"] == team]
    vs = {}
    for opp in opponents:
        theirs = log[(log["team"] == opp) & (log["season"] == season)].sort_values("week")
        if theirs.empty or opp == team:
            continue
        other = str(theirs.iloc[-1]["coach"])
        coach_meet = career[career["oppCoach"] == other]
        team_meet = franchise[franchise["opp"] == opp].sort_values(["season", "week"])
        vs[opp] = {
            "coach": other,
            "coachMeet": {**record(coach_meet), "n": int(len(coach_meet))},
            "teamMeet": {**record(team_meet), "n": int(len(team_meet))},
            "recent": [
                {"season": int(r.season), "week": int(r.week), "pf": int(r.pf), "pa": int(r.pa)}
                for r in team_meet.tail(5).iloc[::-1].itertuples()
            ],
        }
    return {
        "name": name,
        "career": {**record(career), "n": int(len(career))},
        "withTeam": {**record(here), "since": int(here["season"].min())},
        "ats": {
            "season": ats_record(career[career["season"] == season]),
            "career": ats_record(career),
            "favorite": ats_record(career[career["fav"] > 0]),
            "underdog": ats_record(career[career["fav"] < 0]),
        },
        "bye": record(career[career["rest"] >= 13]),
        "vs": vs,
    }


def slate(games: pd.DataFrame, season: int) -> dict | None:
    g = games[(games["season"] == season) & (games["game_type"] == "REG")]
    pending = g[g["home_score"].isna() | g["away_score"].isna()]
    if pending.empty:
        return None
    week = int(pending["week"].min())
    rows = []
    for _, r in pending[pending["week"] == week].sort_values(["gameday", "gametime"]).iterrows():
        rows.append({
            "away": r["away_team"], "home": r["home_team"], "day": str(r["gameday"]), "time": None if pd.isna(r["gametime"]) else str(r["gametime"]),
            "spread": None if pd.isna(r["spread_line"]) else float(r["spread_line"]),
            "total": None if pd.isna(r["total_line"]) else float(r["total_line"]),
        })
    return {"week": week, "games": rows}


# ---------------------------------------------------------------------------------------------- injuries


def snap_shares(snaps: pd.DataFrame) -> dict:
    """Average share of the team's snaps in the games a player was in (offense or defense, whichever is bigger).

    Keyed by pfr id, and by (team, name) for players whose ids do not line up between files."""
    s = snaps.copy()
    s["share"] = s[["offense_pct", "defense_pct"]].max(axis=1)
    s = s[s["share"] > 0]
    out: dict = s.groupby("pfr_player_id")["share"].mean().to_dict()
    out.update(s.groupby(["team", "player"])["share"].mean().to_dict())
    return out


PRACTICE_RANK = {"DNP": 0, "Limited": 1, "Full": 2}


def practice_of(raw) -> str | None:
    """The practice report as DNP, Limited or Full; None when the player wasn't listed in practice."""
    text = str(raw) if isinstance(raw, str) else ""
    if text.startswith("Did Not"):
        return "DNP"
    if text.startswith("Limited"):
        return "Limited"
    if text.startswith("Full"):
        return "Full"
    return None


def injury_report(inj: pd.DataFrame, roster: pd.DataFrame, shares: dict[str, float]) -> dict[str, dict]:
    """Each team's latest report: who is on it, which group he plays in, and whether he normally starts.

    `status` is the game designation (Out, Doubtful, Questionable) once the team has issued one; before that it is
    how he practiced (DNP, Limited). A player who practiced fully is listed only if the report names an injury for
    him, as Full, so a player coming back from Limited to Full shows up rather than silently disappearing.
    `practice` is always how he practiced, whatever his game designation.
    """
    pfr_of = dict(zip(roster["gsis_id"], roster["pfr_id"])) if "pfr_id" in roster else {}
    out: dict[str, dict] = {}
    for team, g in inj.groupby("team"):
        week = int(g["week"].max())
        latest = g[g["week"] == week]
        players = []
        for _, r in latest.iterrows():
            group = POS_GROUP.get(str(r["position"]))
            if group is None:
                continue
            status = r["report_status"] if isinstance(r["report_status"], str) else None
            practice = practice_of(r["practice_status"])
            injury = next((r[c] for c in ("report_primary_injury", "practice_primary_injury") if c in r and isinstance(r[c], str)), None)
            if status is None:
                if practice in ("DNP", "Limited"):
                    status = practice
                elif practice == "Full" and injury:
                    status = "Full"
                else:
                    continue
            share = shares.get(pfr_of.get(r["gsis_id"], ""))
            if share is None:
                share = shares.get((team, str(r["full_name"])))
            players.append({
                "name": str(r["full_name"]), "pos": str(r["position"]), "group": group, "status": status, "practice": practice,
                "injury": injury,
                "starter": bool(share is not None and share >= 0.55),
                "snap": None if share is None else round(float(share), 2),
            })
        order = {"Out": 0, "Doubtful": 1, "Questionable": 2, "DNP": 3, "Limited": 4, "Full": 5}
        players.sort(key=lambda p: (order.get(p["status"], 9), not p["starter"], p["name"]))
        out[team] = {"week": week, "players": players}
    return out


def carry_trails(old: dict | None, new: dict, now: str) -> dict:
    """The new report with each player's trail: when his practice or game status changed, over the report week.

    nflverse keeps only the latest status per player, not Wednesday's and Thursday's. So the trail is built from our
    own look at the file every few hours: one entry the first time we see a player, another each time his status
    changes. It resets with each new report week. Players we see for the first time late in the week start late.
    """
    before = {}
    if old and old.get("week") == new.get("week"):
        before = {(p["name"], p["pos"]): p for p in old.get("players", [])}
    players = []
    for p in new["players"]:
        prev = before.get((p["name"], p["pos"]))
        trail = list(prev.get("trail", [])) if prev else []
        if not trail or (trail[-1]["practice"], trail[-1]["status"]) != (p["practice"], p["status"]):
            trail.append({"at": now, "practice": p["practice"], "status": p["status"]})
        players.append({**p, "trail": trail})
    return {**new, "players": players}


# ---------------------------------------------------------------------------------------------- leaders


def leaders(team: str, plays: pd.DataFrame, names: dict[str, str], frames: dict[str, pd.DataFrame], positions: dict[str, str],
            snaps: pd.DataFrame) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    mine = scrimmage(plays[plays["posteam"] == team])
    # Quarterback: the one with the most dropbacks.
    drops = mine[(mine["qb_dropback"] == 1) & mine["passer_player_id"].notna()]
    top = drops.groupby("passer_player_id").agg(n=("epa", "size"), v=("epa", "mean")).sort_values("n", ascending=False).head(1)
    out["qb"] = [{"name": names.get(i, ""), "pos": "QB", "stat": "epaDb", "v": round(float(r.v), 3), "n": int(r.n)} for i, r in top.iterrows() if names.get(i)]
    # Receivers: most targets.
    tg = mine[(mine["pass_attempt"] == 1) & mine["receiver_player_id"].notna()]
    top = tg.groupby("receiver_player_id").agg(n=("epa", "size"), v=("epa", "mean")).sort_values("n", ascending=False).head(3)
    out["rec"] = [{"name": names.get(i, ""), "pos": positions.get(i, ""), "stat": "epaTgt", "v": round(float(r.v), 3), "n": int(r.n)} for i, r in top.iterrows() if names.get(i)]
    # Run game: most designed carries.
    rn = mine[(mine["play_type"] == "run") & (mine["qb_scramble"].fillna(0) != 1) & mine["rusher_player_id"].notna()]
    top = rn.groupby("rusher_player_id").agg(n=("epa", "size"), v=("epa", "mean")).sort_values("n", ascending=False).head(2)
    out["run"] = [{"name": names.get(i, ""), "pos": positions.get(i, ""), "stat": "epaRush", "v": round(float(r.v), 3), "n": int(r.n)} for i, r in top.iterrows() if names.get(i)]
    # Offensive line: the five linemen who have played the most snaps.
    ts = snaps[(snaps["team"] == team) & snaps["position"].isin(["T", "G", "C", "OT", "OG", "OL"])]
    ts = ts.groupby(["pfr_player_id", "player"]).agg(n=("offense_snaps", "sum"), v=("offense_pct", "mean"), pos=("position", "last")).reset_index().sort_values("n", ascending=False).head(5)
    out["ol"] = [{"name": str(r.player), "pos": str(r.pos), "stat": "snapPct", "v": round(float(r.v), 3), "n": int(r.n)} for r in ts.itertuples()]
    # Defense, from PFR: pressures, tackles and coverage by player.
    d = frames["defense"]
    d = d[d["team"] == team].copy()
    d["pos"] = d["pfr_player_id"].map(lambda i: positions.get(i, ""))
    rush = d.groupby(["pfr_player_name", "pos"]).agg(v=("def_pressures", "sum"), x=("def_sacks", "sum")).reset_index().sort_values(["v", "x"], ascending=False).head(3)
    out["rush"] = [{"name": str(r.pfr_player_name), "pos": str(r.pos), "stat": "pressures", "v": float(r.v), "x": float(r.x)} for r in rush.itertuples() if r.v > 0]
    lbs = d[d["pos"].isin(["LB", "ILB", "MLB", "OLB"])]
    lbs = lbs.groupby(["pfr_player_name", "pos"]).agg(v=("def_tackles_combined", "sum"), x=("def_missed_tackles", "sum")).reset_index().sort_values("v", ascending=False).head(2)
    out["rund"] = [{"name": str(r.pfr_player_name), "pos": str(r.pos), "stat": "tackles", "v": float(r.v), "x": float(r.x)} for r in lbs.itertuples() if r.v > 0]
    dbs = d[d["pos"].isin(["CB", "S", "FS", "SS", "DB"])]
    dbs = dbs.groupby(["pfr_player_name", "pos"]).agg(
        t=("def_targets", "sum"), c=("def_completions_allowed", "sum"), y=("def_yards_allowed", "sum"),
        td=("def_receiving_td_allowed", "sum"), i=("def_ints", "sum")).reset_index().sort_values("t", ascending=False)
    cov = []
    for r in dbs.head(2).itertuples():
        rating = passer_rating(r.t, r.c, r.y, r.td, r.i)
        if rating is not None and r.t >= 4:
            cov.append({"name": str(r.pfr_player_name), "pos": str(r.pos), "stat": "rating", "v": round(rating, 1), "n": int(r.t)})
    out["cov"] = cov
    return out


# ---------------------------------------------------------------------------------------------- the build


def build(src: dict[str, pd.DataFrame], season: int) -> dict:
    pbp = site(src["pbp"], ("posteam", "defteam"))
    pbp = pbp[pbp["season_type"] == "REG"]
    if "penalty" in pbp:
        pbp = pbp[pbp["penalty"].fillna(0) != 1]
    ftn = src["ftn"].rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
    ftn = ftn[[c for c in ftn.columns if c in ("game_id", "play_id", "is_play_action", "is_motion", "n_blitzers", "n_pass_rushers", "n_defense_box")]].drop_duplicates(["game_id", "play_id"])
    ftn["ftn_seen"] = True
    pbp = pbp.merge(ftn, on=["game_id", "play_id"], how="left")
    pbp["ftn_seen"] = pbp["ftn_seen"].fillna(False).astype(bool)

    frames = {k: site(src[k], ("team", "opponent")) for k in ("pass", "rush", "rec", "defense")}
    games_all = site(src["games"], ("home_team", "away_team"))
    log = coach_log(games_all)
    snaps = site(src["snaps"], ("team", "opponent"))
    snaps = snaps[snaps["game_type"] == "REG"] if "game_type" in snaps else snaps
    roster = src["roster"]
    names = dict(zip(roster["gsis_id"], roster["full_name"]))
    positions = {**dict(zip(roster["pfr_id"], roster["position"])), **dict(zip(roster["gsis_id"], roster["position"]))}
    positions.update(dict(zip(snaps["pfr_player_id"], snaps["position"])))

    cur = games_all[(games_all["season"] == season) & (games_all["game_type"] == "REG") & games_all["home_score"].notna() & games_all["away_score"].notna()]
    teams = sorted(set(cur["home_team"]) | set(cur["away_team"]))
    if not teams:
        return {"season": season, "teams": {}}

    side = {t: {"off": pbp_side(pbp, t, "off"), "def": pbp_side(pbp, t, "def")} for t in teams}
    pfr = pfr_tables(frames)
    for t in teams:
        o, d = side[t]["off"], side[t]["def"]
        po, pd_ = pfr["off"].get(t, {}), pfr["def"].get(t, {})
        o["pressure"] = ratio(po.get("pressured", 0), o["dropbacks"]) if "pressured" in po else None
        o["ybc"], o["yco"] = po.get("ybc"), po.get("yco")
        o["drop"] = ratio(po.get("drops", 0), o["targets"]) if "drops" in po else None
        o["broken"] = ratio(po.get("brokenRec", 0), o["catches"]) if "brokenRec" in po else None
        d["pressure"] = ratio(pd_.get("pressures", 0), d["dropbacks"]) if "pressures" in pd_ else None
        d["ybcAllowed"] = pfr["def"].get(t, {}).get("ybcAllowed")
        d["missed"], d["rating"] = pd_.get("missed"), pd_.get("rating")
        # Run defense is the opponent's rushing seen from the defense; "stuff" is the same runs turned around.
        d["stuff"] = d["stuffed"]

    # The stat each group stat reads from, by side.
    source = {"qb": "off", "ol": "off", "rec": "off", "run": "off", "rush": "def", "rund": "def", "cov": "def"}
    ranked: dict[str, dict[str, dict[str, dict]]] = {}
    for grp, stats in GROUPS.items():
        ranked[grp] = {}
        for stat, higher in stats.items():
            vals = {t: side[t][source[grp]].get(stat) for t in teams}
            ranked[grp][stat] = rank_stat(vals, higher)

    style_vals = {s: {k: {t: style_side(pbp, t, s).get(k) for t in teams} for k in keys} for s, keys in STYLE.items()}
    style_ranked = {s: {k: rank_stat(v, None) for k, v in d.items()} for s, d in style_vals.items()}

    overall = {
        "off": rank_stat({t: side[t]["off"]["epaPlay"] for t in teams}, True),
        "def": rank_stat({t: side[t]["def"]["epaPlay"] for t in teams}, False),
    }

    injuries = injury_report(src["injuries"], roster, snap_shares(snaps))

    out_teams: dict[str, dict] = {}
    n = len(teams)
    for t in teams:
        rows = cur[(cur["home_team"] == t) | (cur["away_team"] == t)]
        pf = int(np.where(rows["home_team"] == t, rows["home_score"], rows["away_score"]).sum())
        pa = int(np.where(rows["home_team"] == t, rows["away_score"], rows["home_score"]).sum())
        res = np.sign(np.where(rows["home_team"] == t, rows["home_score"] - rows["away_score"], rows["away_score"] - rows["home_score"]))
        lead = leaders(t, pbp, names, frames, positions, snaps)
        groups = {}
        for grp, stats in GROUPS.items():
            entry = {k: ranked[grp][k].get(t) for k in stats}
            ranks = [e["rank"] for e in entry.values() if e]
            groups[grp] = {"score": grade(ranks, n), "stats": entry, "leaders": lead.get(grp, [])}
        out_teams[t] = {
            "g": int(len(rows)),
            "w": int((res > 0).sum()), "l": int((res < 0).sum()), "t": int((res == 0).sum()),
            "pf": pf, "pa": pa,
            "overall": {"off": overall["off"].get(t), "def": overall["def"].get(t)},
            "groups": groups,
            "style": {s: {k: style_ranked[s][k].get(t) for k in keys} for s, keys in STYLE.items()},
            "coach": coaching(log, t, teams, season),
            "injuries": injuries.get(t, {"week": None, "players": []}),
        }
    # Group rank among all teams, by the mean percentile of the stats.
    for grp in GROUPS:
        order = sorted(teams, key=lambda t: (-(out_teams[t]["groups"][grp]["score"] or -1), t))
        for i, t in enumerate(order):
            out_teams[t]["groups"][grp]["rank"] = i + 1

    league = {grp: {stat: round(float(np.mean([r["v"] for r in ranked[grp][stat].values()])), 4) if ranked[grp][stat] else None
                    for stat in stats} for grp, stats in GROUPS.items()}
    league["style"] = {s: {k: round(float(np.mean([r["v"] for r in style_ranked[s][k].values()])), 4) if style_ranked[s][k] else None
                           for k in keys} for s, keys in STYLE.items()}
    last_week = int(cur["week"].max())
    return {
        "season": season,
        "week": last_week,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "league": league,
        "teams": out_teams,
        "slate": slate(games_all, season),
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
    names = {
        "pbp": f"play_by_play_{season}.csv.gz", "roster": f"roster_{season}.csv", "snaps": f"snap_counts_{season}.csv",
        "injuries": f"injuries_{season}.csv", "ftn": f"ftn_charting_{season}.csv", "pass": f"advstats_week_pass_{season}.csv",
        "rush": f"advstats_week_rush_{season}.csv", "rec": f"advstats_week_rec_{season}.csv",
        "defense": f"advstats_week_def_{season}.csv", "games": "games.csv",
    }
    src = {}
    for key, fname in names.items():
        where = str(Path(folder) / fname) if folder else URLS[key].format(season=season)
        kw = {"usecols": lambda c: c in PBP_COLS} if key == "pbp" else {}
        src[key] = _read(where, **kw)
    return src


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--input", help="folder with the source files instead of downloading them")
    ap.add_argument("--out", default="data/lab/units.json")
    args = ap.parse_args(argv)

    result = build(load(args.season, args.input), args.season)
    if not result["teams"]:
        print("no finished games found; leaving the existing file alone", file=sys.stderr)
        return 0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    old = None
    if out.exists():
        try:
            old = json.loads(out.read_text())
        except json.JSONDecodeError:
            pass
    # The weekly rebuild must not throw away what the injury refresh has been collecting.
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    moved = old is None
    for team, data in result["teams"].items():
        before = ((old or {}).get("teams", {}).get(team) or {}).get("injuries")
        data["injuries"] = carry_trails(before, data["injuries"], now)
        moved = moved or before != data["injuries"]
    stamp = now if moved else (old or {}).get("injuriesUpdatedAt")
    if stamp:
        result["injuriesUpdatedAt"] = stamp
    if old is not None and {**old, "generatedAt": ""} == {**result, "generatedAt": ""}:
        print("data unchanged")
        return 0
    out.write_text(json.dumps(result, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"wrote {out} ({len(result['teams'])} teams, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
