#!/usr/bin/env python3
"""Position-by-position metric studies for methodology v2: which numbers describe a player, and which survive to next season.

This is the second half of the research behind the Player Lab grades (the first half is validate_methodology.py, which owns the
helpers used here). It answers questions the first half could not:

    RB   do explosive rate, yards after contact, rushing yards over expected (RYOE, Next Gen Stats) and receiving add anything
         that rushing EPA does not, and how much of each is the runner rather than his line and his box?
    WR   does tracking data (separation, cushion, yards after the catch over expected) say something the play-by-play does not?
    TE   the same.
    QB   are the tracking-style traits (time to throw, aggressiveness) stable enough to show as dimensions?
    DEF  for linebackers and defensive backs: which of the stats we have are individual at all, and which are role?

Every study asks the same three questions: how reliable is the number inside one season (odd games against even games), does it
repeat from one season to the next, and does it predict a *different* outcome next season than the one it is made of.
Differences between predictors are reported with bootstrap intervals; a difference whose interval holds zero is not a finding.

Run:  python scripts/lab/validate_positions.py --input <nflverse folder> --ngs <folder with ngs_*.csv.gz> --out data/lab/validation-positions.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_methodology as vm  # noqa: E402

NGS_FILES = {"rush": "ngs_rushing.csv.gz", "rec": "ngs_receiving.csv.gz", "pass": "ngs_passing.csv.gz"}


# ---------------------------------------------------------------------------------------------- Next Gen Stats, weekly


def read_ngs(folder: str, kind: str, seasons: list[int]) -> pd.DataFrame:
    """The regular-season weekly rows (week 0 is the season roll-up and is left out so a game is never counted twice)."""
    d = pd.read_csv(Path(folder) / NGS_FILES[kind], low_memory=False)
    d = d[(d["season_type"] == "REG") & (d["week"] >= 1) & d["season"].isin(seasons)].copy()
    return d.rename(columns={"player_gsis_id": "id"}).dropna(subset=["id"])


def rush_ngs_units(ngs: pd.DataFrame, group_of: dict[tuple[int, str], str]) -> pd.DataFrame:
    """Per back per game. Each weighted average is turned back into a sum so any slice of games is a sum over a sum."""
    d = ngs.dropna(subset=["expected_rush_yards", "rush_yards_over_expected"]).copy()
    d["group"] = [group_of.get((int(s), i)) for s, i in zip(d["season"], d["id"])]
    d = d[d["group"] == "rb"]
    d["att"] = pd.to_numeric(d["rush_attempts"], errors="coerce").fillna(0)
    d["ryoe"] = pd.to_numeric(d["rush_yards_over_expected"], errors="coerce")
    d["xyds"] = pd.to_numeric(d["expected_rush_yards"], errors="coerce")
    d["eight_n"] = pd.to_numeric(d["percent_attempts_gte_eight_defenders"], errors="coerce").fillna(0) / 100.0 * d["att"]
    d["tlos_v"] = pd.to_numeric(d["avg_time_to_los"], errors="coerce").fillna(0) * d["att"]
    return d[["season", "week", "id", "att", "ryoe", "xyds", "eight_n", "tlos_v"]]


def rec_ngs_units(ngs: pd.DataFrame, group_of: dict[tuple[int, str], str], group: str) -> pd.DataFrame:
    d = ngs.copy()
    d["group"] = [group_of.get((int(s), i)) for s, i in zip(d["season"], d["id"])]
    d = d[d["group"] == group]
    d["tgt_n"] = pd.to_numeric(d["targets"], errors="coerce").fillna(0)
    d["rec_n"] = pd.to_numeric(d["receptions"], errors="coerce").fillna(0)
    sep = pd.to_numeric(d["avg_separation"], errors="coerce")
    cush = pd.to_numeric(d["avg_cushion"], errors="coerce")
    yacx = pd.to_numeric(d["avg_yac_above_expectation"], errors="coerce")
    d["sep_n"], d["sep_v"] = d["tgt_n"].where(sep.notna(), 0), (sep * d["tgt_n"]).fillna(0)
    d["cush_n"], d["cush_v"] = d["tgt_n"].where(cush.notna(), 0), (cush * d["tgt_n"]).fillna(0)
    d["yacx_n"], d["yacx_v"] = d["rec_n"].where(yacx.notna(), 0), (yacx * d["rec_n"]).fillna(0)
    return d[["season", "week", "id", "tgt_n", "rec_n", "sep_n", "sep_v", "cush_n", "cush_v", "yacx_n", "yacx_v"]]


def pass_ngs_units(ngs: pd.DataFrame, group_of: dict[tuple[int, str], str]) -> pd.DataFrame:
    d = ngs.copy()
    d["group"] = [group_of.get((int(s), i)) for s, i in zip(d["season"], d["id"])]
    d = d[d["group"] == "qb"]
    d["att_n"] = pd.to_numeric(d["attempts"], errors="coerce").fillna(0)
    for src, name in (("avg_time_to_throw", "ttt"), ("aggressiveness", "agg"), ("avg_intended_air_yards", "iay"), ("completion_percentage_above_expectation", "cpoe_n")):
        v = pd.to_numeric(d[src], errors="coerce")
        d[name + "_n"], d[name + "_v"] = d["att_n"].where(v.notna(), 0), (v * d["att_n"]).fillna(0)
    return d[["season", "week", "id", "att_n", *[f"{n}_{s}" for n in ("ttt", "agg", "iay", "cpoe_n") for s in ("n", "v")]]]


def ratio_table(units: pd.DataFrame, stats: dict[str, tuple[str, str]], gate: str, min_gate: float) -> pd.DataFrame:
    return vm.table_with_parts(units, stats, gate, min_gate)


# ---------------------------------------------------------------------------------------------- how much of a stat is the player


def overlap(T: pd.DataFrame, feats: list[str], targets: dict[str, str], min_n: int = 60) -> dict:
    """Do these stats say different things? Standardized within each season (so a league-wide shift is not read as agreement):

        correlations   every pair, same season
        explained      how much of each stat the others reproduce (R-squared): near 1 means it adds nothing of its own
        partial        each stat's correlation with next season's `target` once the others are removed from both, with a bootstrap
                       interval: what it knows about next year that the others do not
    """
    cols = [c for c in feats if c in T]
    if len(cols) < 2:
        return {}
    Z = vm.zscore_by_season(T, sorted(set(cols) | set(targets.values())))
    out: dict = {"stats": cols}
    D = Z[cols].dropna()
    out["n"] = int(len(D))
    out["correlations"] = {a: {b: vm.r4(vm.corr(D[a], D[b])) for b in cols if b != a} for a in cols}
    expl = {}
    for a in cols:
        others = [c for c in cols if c != a]
        X = np.column_stack([np.ones(len(D)), D[others].to_numpy()])
        beta, *_ = np.linalg.lstsq(X, D[a].to_numpy(), rcond=None)
        resid = D[a].to_numpy() - X @ beta
        expl[a] = vm.r4(1 - float(resid.var()) / float(D[a].var()))
    out["explainedByTheOthers"] = expl
    nx = Z[["season", "id", *targets.values()]].copy() if "id" in Z else None
    if nx is not None:
        nx["season"] -= 1
        M = Z.merge(nx, on=["season", "id"], suffixes=("", "_nx"))
        part = {}
        for tname, tcol in targets.items():
            sub = M[cols + [tcol + "_nx"]].dropna()
            if len(sub) < min_n:
                continue
            res = {}
            for a in cols:
                others = [c for c in cols if c != a]
                X = np.column_stack([np.ones(len(sub)), sub[others].to_numpy()])
                ra = sub[a].to_numpy() - X @ np.linalg.lstsq(X, sub[a].to_numpy(), rcond=None)[0]
                rt = sub[tcol + "_nx"].to_numpy() - X @ np.linalg.lstsq(X, sub[tcol + "_nx"].to_numpy(), rcond=None)[0]
                lo, hi = vm.boot_ci(ra, rt)
                res[a] = {"r": vm.r4(vm.corr(ra, rt)), "ci": [vm.r4(lo), vm.r4(hi)]}
            part[tname] = {"n": int(len(sub)), "stats": res}
        out["partialWithNextSeason"] = part
    return out


def _stat_row(units: pd.DataFrame, T: pd.DataFrame, key: str, num: str, den: str, gate: str, min_gate: float, min_den: float) -> dict:
    sh = vm.split_half(units, num, den, gate, min_gate, min_den)
    y = vm.yoy(T[["season", "id", key]].dropna(), [key])[key] if key in T else {"n": 0, "r": None, "ci": [None, None]}
    return {"reliability": sh["reliability"], "reliabilityCi": sh["ci"], "reliabilityN": sh["n"], "stability": y["r"], "stabilityCi": y["ci"], "stabilityN": y["n"],
            "label": vm.signal_label(y["r"]), "spread": half_spread(units, num, den, gate, min_gate, min_den)}


def role_vs_skill(T: pd.DataFrame, role_cols: list[str], skill_cols: list[str]) -> dict:
    """How stable each column is year to year, side by side: a role number (touches, targets per snap) repeats because the coach
    keeps using the player, a skill number repeats only if the player keeps doing the thing."""
    out = {}
    for c in role_cols + skill_cols:
        if c in T:
            y = vm.yoy(T[["season", "id", c]].dropna(), [c])[c]
            out[c] = {"kind": "role" if c in role_cols else "skill", "stability": y["r"], "ci": y["ci"], "n": y["n"]}
    return out


# ---------------------------------------------------------------------------------------------- running backs


def rb_study(inp: dict, ngs_rush: pd.DataFrame, first_test: int = 2021) -> dict:
    pbp = inp["pbp"][inp["pbp"]["season"] >= min(s for s, _ in inp["group_of"])]
    units = vm.rush_units(pbp, inp["group_of"])
    targets = vm.rec_targets(pbp[pbp["season"].isin({s for s, _ in inp["group_of"]})], inp["group_of"])
    T = vm.rush_season_table(units, pbp, inp["adv_rush"], inp["pfr_to_gsis"])
    # Receiving: a back's targets, as a rate and as a total.
    rt = vm.receiver_season_table(targets, pbp, "rb")[["season", "id", "tgt", "epa_total", "epaTgt", "success", "catchRate"]].rename(
        columns={"tgt": "r_tgt", "epa_total": "r_epa", "epaTgt": "r_epaTgt", "success": "r_success", "catchRate": "r_catch"})
    T = T.merge(rt, on=["season", "id"], how="left").fillna({"r_tgt": 0, "r_epa": 0})
    # RYOE and the box he ran against, from Next Gen Stats.
    nu = rush_ngs_units(ngs_rush, inp["group_of"])
    NT = vm.table_with_parts(nu, {"ryoe": ("ryoe", "att"), "eight": ("eight_n", "att"), "tlos": ("tlos_v", "att")}, "att", 1)
    NT = NT.rename(columns={"att": "ngs_att"})[["season", "id", "ryoe", "ryoe:num", "ryoe:den", "eight", "tlos", "ngs_att"]]
    T = T.merge(NT, on=["season", "id"], how="left")
    T["touch_epa"] = (T["epa_total"] + T["r_epa"]) / (T["car"] + T["r_tgt"]).replace(0, np.nan)
    T["epa_touch_total"] = T["epa_total"] + T["r_epa"]
    T["r_tgt_share"] = T["r_tgt"] / (T["car"] + T["r_tgt"]).replace(0, np.nan)
    ok = T[T["ngs_att"].fillna(0) >= 100]

    out: dict = {"unit": "carries", "players": int(len(T)), "ngsPlayers": int(len(ok))}
    # Reliability and stability, stat by stat.
    nunits = units.merge(nu[["season", "id", "week", "att", "ryoe", "eight_n"]], on=["season", "id", "week"], how="left").fillna({"att": 0, "ryoe": 0, "eight_n": 0})
    stats = {
        "epaRush": ("epa", "car", vm.RB_STATS["epaRush"], 20), "success": ("succ", "car", vm.RB_STATS["success"], 20), "explosive": ("expl", "car", vm.RB_STATS["explosive"], 20),
        "stuffRate": ("stuff", "car", vm.RB_STATS["stuffRate"], 20), "ypc": ("yds", "car", vm.RB_STATS["ypc"], 20),
    }
    out["stats"] = {k: _stat_row(units, T, k, v[2][0], v[2][1], "car", vm.QUALIFY["rb"], v[3]) for k, v in stats.items() if k in T}
    out["stats"]["ryoe"] = _stat_row(nunits[nunits["att"] > 0], T, "ryoe", "ryoe", "att", "att", 100, 20)
    out["stats"]["eightInBox"] = _stat_row(nunits[nunits["att"] > 0], T, "eight", "eight_n", "att", "att", 100, 20)
    if "yco" in T:
        pu = units.merge(inp["adv_rush"].assign(id=lambda d: d["pfr_player_id"].map(inp["pfr_to_gsis"])).dropna(subset=["id"]).groupby(["season", "id", "week"], as_index=False).agg(
            pfr_car=("carries", "sum"), yco=("rushing_yards_after_contact", "sum"), ybc=("rushing_yards_before_contact", "sum"), broken=("rushing_broken_tackles", "sum")), on=["season", "id", "week"], how="left").fillna(0)
        for k, (n, d) in {"yco": ("yco", "pfr_car"), "ybc": ("ybc", "pfr_car"), "broken": ("broken", "pfr_car")}.items():
            if k in T:
                out["stats"][k] = _stat_row(pu, T, k, n, d, "car", vm.QUALIFY["rb"], 20)
    back = T[T["r_tgt"] >= 30]
    rr = vm.yoy(back[["season", "id", "r_epaTgt"]].dropna(), ["r_epaTgt"])["r_epaTgt"] if len(back) > 20 else None
    rs = vm.yoy(back[["season", "id", "r_success"]].dropna(), ["r_success"])["r_success"] if len(back) > 20 else None
    rc = vm.yoy(back[["season", "id", "r_catch"]].dropna(), ["r_catch"])["r_catch"] if len(back) > 20 else None
    out["receiving"] = {"backsWith30Targets": int(len(back)), "epaPerTarget": rr, "successRate": rs, "catchRate": rc,
                        "shareOfBackEpa": vm.r4(float((back["r_epa"] / (back["epa_total"].abs() + back["r_epa"].abs()).clip(lower=1)).median())) if len(back) else None}
    out["roleVsSkill"] = role_vs_skill(T, ["r_tgt_share"], ["r_epaTgt", "ryoe", "yco", "explosive"])

    # What is the runner and what is the line? Yards before contact is the blocking; RYOE is net of the box.
    out["lineAndBox"] = {
        "ybcVsYcoCorrelation": vm.r4(vm.corr(T["ybc"], T["yco"])) if "ybc" in T and "yco" in T else None,
        "ryoeVsEightInBox": vm.r4(vm.corr(ok["ryoe"], ok["eight"])),
        "epaVsEightInBox": vm.r4(vm.corr(ok["epaRush"], ok["eight"])),
        "ryoeVsEpaRush": vm.r4(vm.corr(ok["ryoe"], ok["epaRush"])),
    }
    # Next-season prediction, against several outcomes so no single definition of good picks the winner.
    cands = {"EPA per carry": "epaRush", "success rate": "success", "explosive rate": "explosive", "RYOE per carry": "ryoe", "yards after contact": "yco", "broken tackles": "broken",
             "yards per carry": "ypc", "stuffed rate": "stuffRate", "receiving EPA per target": "r_epaTgt", "EPA per touch (carries + targets)": "touch_epa"}
    fits = {"refit: RYOE, success, yards after contact": ["ryoe", "success", "yco"], "refit: RYOE, success, explosive, broken": ["ryoe", "success", "explosive", "broken"],
            "refit: EPA, success, explosive, yards after contact": ["epaRush", "success", "explosive", "yco"]}
    cands = {k: v for k, v in cands.items() if v in T}
    fits = {k: [f for f in v if f in T] for k, v in fits.items()}
    sub = T[T["ngs_att"].fillna(0) >= 100].copy()
    out["nextSeason"] = vm.group_ability_study(sub, cands, fits, {"epaRush": "epaRush", "ryoe": "ryoe", "ypc": "ypc", "epaPerTouch": "touch_epa"}, first_test, lower_is_better={"stuffRate"})
    # Are the three component grades three things? (Hunter's question: or one thing measured three ways.)
    out["componentOverlap"] = overlap(sub, ["explosive", "yco", "ryoe"], {"ryoe": "ryoe", "epaRush": "epaRush", "ypc": "ypc"})
    out["componentOverlapWithOutcomes"] = overlap(sub, ["explosive", "yco", "ryoe", "success", "epaRush"], {"ryoe": "ryoe", "epaRush": "epaRush"})
    return out


def half_spread(units: pd.DataFrame, num: str, den: str, gate: str, min_gate: float, min_den: float = 1.0, who: str = "id") -> dict:
    """What a stat is made of, from odd games against even games (in week order) for every player-season with at least `min_gate` of `gate`.

    Two independent measurements of the same latent level share only that level, so the covariance of the two halves is the variance of
    true levels among these players (`talentSd`), with no assumption about the play-level noise. What is left of the halves' disagreement
    is noise: the two rates differ by sampling error with variance sigma^2 * (1/v1 + 1/v2) when v1, v2 are the volumes behind them, so
    sigma (`playSd`, per unit of the stat's denominator) follows. All in the stat's raw ratio units."""
    a, b, v1s, v2s = [], [], [], []
    for _, x in units.groupby(["season", who]):
        if x[gate].sum() < min_gate:
            continue
        x = x.sort_values("week")
        h1, h2 = x.iloc[::2], x.iloc[1::2]
        d1, d2 = float(h1[den].sum()), float(h2[den].sum())
        if d1 < min_den or d2 < min_den or d1 <= 0 or d2 <= 0:
            continue
        a.append(float(h1[num].sum()) / d1)
        b.append(float(h2[num].sum()) / d2)
        v1s.append(d1)
        v2s.append(d2)
    if len(a) < 20:
        return {}
    a, b, v1s, v2s = np.asarray(a), np.asarray(b), np.asarray(v1s), np.asarray(v2s)
    cov = float(np.cov(a, b)[0, 1])
    obs = float((a.var(ddof=1) + b.var(ddof=1)) / 2)
    sigma2 = float(np.sum((a - b) ** 2) / np.sum(1.0 / v1s + 1.0 / v2s))
    r = vm.corr(a, b)
    return {"n": int(len(a)), "mean": vm.r4(float(np.mean(np.r_[a, b]))), "halfSeasonSd": vm.r4(obs ** 0.5), "talentSd": vm.r4(max(cov, 0.0) ** 0.5),
            "shareReal": vm.r4(max(cov, 0.0) / obs if obs > 0 else 0.0), "playSd": vm.r4(sigma2 ** 0.5), "halfCorrelation": vm.r4(r),
            "reliability": vm.r4(vm.spearman_brown(r))}


# ---------------------------------------------------------------------------------------------- receivers


def receiver_study(inp: dict, targets: pd.DataFrame, ngs_rec: pd.DataFrame, group: str, first_test: int = 2021) -> dict:
    pbp = inp["pbp"][inp["pbp"]["season"] >= min(s for s, _ in inp["group_of"])]
    T = vm.receiver_season_table(targets, pbp, group)
    nu = rec_ngs_units(ngs_rec, inp["group_of"], group)
    stats = {"sep": ("sep_v", "sep_n"), "cushion": ("cush_v", "cush_n"), "yacOverExpected": ("yacx_v", "yacx_n")}
    NT = vm.table_with_parts(nu, stats, "tgt_n", 1)
    NT = NT[["season", "id", "sep", "cushion", "yacOverExpected", "tgt_n"]].rename(columns={"tgt_n": "ngs_tgt"})
    T = T.merge(NT, on=["season", "id"], how="left")
    gate = vm.QUALIFY[group]
    ok = T[T["ngs_tgt"].fillna(0) >= gate]
    # Role against efficiency: a share of the team's targets is what the offense does with him; the rest is what he does with them.
    units = targets[targets["group"] == group].groupby(["season", "id", "week", "game"], as_index=False).agg(
        tgt=("tgt", "sum"), epa=("epa", "sum"), succ=("succ", "sum"), croe=("croe_v", "sum"), croe_n=("croe_n", "sum"), yacoe=("yacoe_v", "sum"), yacoe_n=("yacoe_n", "sum"),
        air=("air_v", "sum"), air_n=("air_n", "sum"), team_att=("team_att", "first"))
    units["fd"] = units["succ"] * 0  # placeholder replaced below (first downs are summed from the target rows)
    fd = targets[targets["group"] == group].assign(fd=lambda d: vm._flag(d, "first_down"), cmp=lambda d: vm._flag(d, "complete_pass")).groupby(["season", "id", "week", "game"], as_index=False)[["fd", "cmp"]].sum()
    units = units.drop(columns=["fd"]).merge(fd, on=["season", "id", "week", "game"], how="left")
    out: dict = {"unit": "targets", "players": int(len(T)), "ngsPlayers": int(len(ok))}
    s = {"epaTgt": vm.REC_STATS["epaTgt"], "success": vm.REC_STATS["success"], "croe": vm.REC_STATS["croe"], "yacOe": vm.REC_STATS["yacOe"], "firstDown": ("fd", "tgt"), "catchRate": ("cmp", "tgt"), "adot": vm.REC_STATS["adot"]}
    out["stats"] = {k: _stat_row(units, T, k, v[0], v[1], "tgt", gate, 10 if k not in ("croe", "yacOe") else 5) for k, v in s.items() if k in T}
    for key, (n, d) in stats.items():
        out["stats"][key] = _stat_row(nu[nu[d] > 0], T, key, n, d, d, gate, 8)
    out["roleVsSkill"] = role_vs_skill(T, ["share", "adot"], ["success", "epaTgt", "sep", "yacOverExpected", "catchRate", "croe"])
    out["tracking"] = {"sepVsSuccess": vm.r4(vm.corr(ok["sep"], ok["success"])), "sepVsEpaTgt": vm.r4(vm.corr(ok["sep"], ok["epaTgt"])), "sepVsAdot": vm.r4(vm.corr(ok["sep"], ok["adot"])),
                       "cushionVsSep": vm.r4(vm.corr(ok["cushion"], ok["sep"]))}
    cands = {"success rate": "success", "EPA per target": "epaTgt", "first-down rate": "firstDown", "CROE": "croe", "YAC over expected (pbp)": "yacOe", "separation (tracking)": "sep",
             "YAC over expected (tracking)": "yacOverExpected", "target share": "share", "site grade today": "site"}
    T["site"] = vm.site_grade(T, group, ["epaTgt", "croe", "yacOe", "share"])
    fits = {"refit: success, separation, YAC": ["success", "sep", "yacOverExpected"], "refit: success, CROE, YAC(pbp)": ["success", "croe", "yacOe"],
            "refit: success, EPA, separation, share": ["success", "epaTgt", "sep", "share"]}
    cands = {k: v for k, v in cands.items() if v in T}
    fits = {k: [f for f in v if f in T] for k, v in fits.items()}
    sub = T[T["ngs_tgt"].fillna(0) >= gate].copy()
    out["nextSeason"] = vm.group_ability_study(sub, cands, fits, {"success": "success", "epaTgt": "epaTgt", "epaPerTeamGame": "epa_pg"}, first_test)
    return out


# ---------------------------------------------------------------------------------------------- quarterbacks: traits beyond the result


def qb_trait_study(inp: dict, ngs_pass: pd.DataFrame) -> dict:
    nu = pass_ngs_units(ngs_pass, inp["group_of"])
    stats = {"timeToThrow": ("ttt_v", "ttt_n"), "aggressiveness": ("agg_v", "agg_n"), "intendedAirYards": ("iay_v", "iay_n"), "cpoeNgs": ("cpoe_n_v", "cpoe_n_n")}
    T = vm.table_with_parts(nu, stats, "att_n", 200)
    out = {"players": int(len(T)), "stats": {}}
    for k, (n, d) in stats.items():
        out["stats"][k] = _stat_row(nu[nu[d] > 0], T, k, n, d, "att_n", 200, 40)
    return out


# ---------------------------------------------------------------------------------------------- defense


def defense_role_study(inp: dict, group: str) -> dict:
    """What is a linebacker or defensive back's own, and what is the scheme's? Role numbers (targets and tackles per snap) are stable
    because the coach keeps using the player the same way; result numbers (yards per target, completion % allowed) are checked against
    that."""
    du = inp["def_units"]
    T = vm.defense_season_table(du, group)
    T["tgtRate"] = T["tgtRate"] if "tgtRate" in T else np.nan
    role = [c for c in ("tgtRate", "tackleRate") if c in T]
    skill = [c for c in ("yardsTgt", "compPct", "missedPct", "intRate") if c in T]
    out = {"players": int(len(T)), "roleVsSkill": role_vs_skill(T, role, skill)}
    # Does being targeted a lot mean he is bad? The relationship between how often he is targeted and how he does when targeted.
    if "tgtRate" in T and "yardsTgt" in T:
        out["targetedVsResult"] = {"tgtRateVsYardsPerTarget": vm.r4(vm.corr(T["tgtRate"], T["yardsTgt"]))}
    return out


# ---------------------------------------------------------------------------------------------- run


def run(folder: str, ngs_folder: str, seasons: list[int]) -> dict:
    inp = vm.load_inputs(folder, seasons)
    targets = vm.rec_targets(inp["pbp"][inp["pbp"]["season"].isin(seasons)], inp["group_of"])
    ngs = {k: read_ngs(ngs_folder, k, seasons) for k in NGS_FILES}
    groups = {"rb": rb_study(inp, ngs["rush"]), "wr": receiver_study(inp, targets, ngs["rec"], "wr"), "te": receiver_study(inp, targets, ngs["rec"], "te"),
              "qb": qb_trait_study(inp, ngs["pass"])}
    for g in ("lb", "cb", "saf"):
        groups[g] = defense_role_study(inp, g)
    return {"method": vm.METHOD_VERSION, "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "seasons": seasons, "groups": groups,
            "note": "Tracking-based rows (Next Gen Stats) list only players above the provider's weekly minimums, so those studies describe regular players."}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--ngs", required=True, help="folder with ngs_rushing.csv.gz, ngs_receiving.csv.gz, ngs_passing.csv.gz (nflverse nextgen_stats release)")
    ap.add_argument("--seasons", type=int, nargs="+", default=list(range(2018, 2026)))
    ap.add_argument("--out", default="data/lab/validation-positions.json")
    args = ap.parse_args(argv)
    rep = run(args.input, args.ngs, sorted(args.seasons))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
