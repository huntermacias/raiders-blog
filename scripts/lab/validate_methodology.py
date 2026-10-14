#!/usr/bin/env python3
"""Validate the Player Lab's grading method against real seasons, and write down what was found.

Run (offline, from a folder holding the nflverse files that `build_players.py --input` reads; 2016 onward for quarterbacks,
2018 onward for the Pro Football Reference tables):

    python scripts/lab/validate_methodology.py --input <folder> --seasons 2018 2019 2020 2021 2022 2023 2024 2025 --out data/lab/validation.json

Nothing here is a vote on whether a ranking "looks right". A player's grade is a claim about how good he is, so the claim is only as good
as what it predicts about games it was not made from. Every question is answered the same way:

    reliability   split the player's games in two (every other game) and ask how much one half agrees with the other.
                  Spearman-Brown turns that into the reliability of a full season. 0 is a coin flip, 1 is a measurement.
    stability     season N against season N+1 for the same player. Lower than reliability means the number is partly the
                  situation he was in, not him.
    prediction    what is known after a stretch (the first 5 games, or last season) against what happens afterwards, scored
                  leave-one-season-out so a season is never predicted from itself. Corr and RMSE, with bootstrap intervals
                  on every difference that is claimed.
    redundancy    how much two stats in one grade are the same fact told twice.
    calibration   when the site says "probably between A and B", how often the later number lands there.

What this cannot do is stated in `limits`: a target made of EPA rewards stats that are made of EPA, and nobody can see blocking,
coverage assignment or route-running in free data. Where the test cannot tell two methods apart, the report says "no difference"
instead of picking the one that sounds better.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

METHOD_VERSION = 2

# The first 5 games of a season is what the site knows in week 5; the rest of the season is what it is trying to predict.
EARLY_GAMES = 5
# A full-season qualifier per group, in the stat's own denominator (dropbacks, targets, carries, snaps).
QUALIFY = {"qb": 250, "wr": 50, "te": 40, "rb": 100, "edge": 350, "idl": 350, "lb": 300, "cb": 300, "saf": 300}
BOOT = 1000


# ---------------------------------------------------------------------------------------------- small statistics


def corr(x, y) -> float:
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 3 or np.std(x[ok]) == 0 or np.std(y[ok]) == 0:
        return float("nan")
    return float(np.corrcoef(x[ok], y[ok])[0, 1])


def spearman_brown(r: float) -> float:
    """The reliability of the whole from the agreement of its two halves."""
    if not np.isfinite(r):
        return float("nan")
    return float(2 * r / (1 + r)) if r > -0.99 else float("nan")


def boot_ci(x, y, n_boot: int = BOOT, seed: int = 0) -> tuple[float, float]:
    """95% interval on a correlation, resampling the pairs."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if len(x) < 8:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    rs = []
    for _ in range(n_boot):
        i = rng.integers(0, len(x), len(x))
        rs.append(corr(x[i], y[i]))
    lo, hi = np.nanpercentile(rs, [2.5, 97.5])
    return (float(lo), float(hi))


def boot_diff(table: pd.DataFrame, a: str, b: str, target: str, n_boot: int = BOOT, seed: int = 0) -> tuple[float, float, float]:
    """corr(a, target) - corr(b, target), with its 95% interval: the honest answer to "is A really a better predictor than B"."""
    t = table[[a, b, target]].dropna()
    if len(t) < 8:
        return (float("nan"), float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    base = corr(t[a], t[target]) - corr(t[b], t[target])
    d = []
    for _ in range(n_boot):
        s = t.iloc[rng.integers(0, len(t), len(t))]
        d.append(corr(s[a], s[target]) - corr(s[b], s[target]))
    lo, hi = np.nanpercentile(d, [2.5, 97.5])
    return (float(base), float(lo), float(hi))


def ratio(df: pd.DataFrame, num: str, den: str) -> float:
    d = float(df[den].sum())
    return float(df[num].sum()) / d if d > 0 else float("nan")


def r4(x) -> float | None:
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


# ---------------------------------------------------------------------------------------------- reliability and stability


def split_half(units: pd.DataFrame, num: str, den: str, gate: str, min_gate: float, min_den: float = 1.0, who: str = "id") -> dict:
    """Odd games against even games (in week order) for every player-season with at least `min_gate` of the `gate` column (his
    qualifying volume), counting a half only when it holds at least `min_den` of the stat's own denominator."""
    a, b = [], []
    for _, x in units.groupby(["season", who]):
        if x[gate].sum() < min_gate:
            continue
        x = x.sort_values("week")
        h1, h2 = x.iloc[::2], x.iloc[1::2]
        if h1[den].sum() < min_den or h2[den].sum() < min_den:
            continue
        a.append(ratio(h1, num, den))
        b.append(ratio(h2, num, den))
    r = corr(a, b)
    lo, hi = boot_ci(a, b)
    return {"n": len(a), "r": r4(r), "reliability": r4(spearman_brown(r)), "ci": [r4(spearman_brown(lo)), r4(spearman_brown(hi))]}


def season_table(units: pd.DataFrame, stats: dict[str, tuple[str, str]], min_den: float, gate: str, who: str = "id") -> pd.DataFrame:
    """One row per player-season: every stat as sum(num)/sum(den), for players with at least `min_den` of `gate`."""
    cols = sorted({c for pair in stats.values() for c in pair} | {gate})
    tot = units.groupby(["season", who])[cols].sum().reset_index()
    tot = tot[tot[gate] >= min_den].copy()
    for k, (n, d) in stats.items():
        tot[k] = np.where(tot[d] > 0, tot[n] / tot[d].where(tot[d] > 0, 1), np.nan)
    return tot


def with_next(table: pd.DataFrame, keys: list[str], who: str = "id") -> pd.DataFrame:
    """Each row beside the same player's next season: columns `<k>_nx`."""
    nxt = table[["season", who, *keys]].copy()
    nxt["season"] = nxt["season"] - 1
    return table.merge(nxt, on=["season", who], suffixes=("", "_nx"))


def yoy(table: pd.DataFrame, keys: list[str], who: str = "id") -> dict[str, dict]:
    m = with_next(table, keys, who)
    out = {}
    for k in keys:
        r = corr(m[k], m[k + "_nx"])
        lo, hi = boot_ci(m[k], m[k + "_nx"])
        out[k] = {"n": int(len(m)), "r": r4(r), "ci": [r4(lo), r4(hi)]}
    return out


def redundancy(table: pd.DataFrame, keys: list[str]) -> list[dict]:
    out = []
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            out.append({"a": a, "b": b, "r": r4(corr(table[a], table[b]))})
    return out


# ---------------------------------------------------------------------------------------------- prediction


def ridge_cv(table: pd.DataFrame, feats: list[str], target: str, alpha: float = 1.0, by: str = "season") -> dict:
    """Leave-one-season-out ridge on standardized features: predictions for every row from a model that never saw its season."""
    t = table[[*feats, target, by]].dropna().reset_index(drop=True)
    if len(t) < 20 or t[by].nunique() < 3:
        return {"n": int(len(t)), "r": None, "rmse": None, "coef": {}}
    pred = np.zeros(len(t))
    for s in t[by].unique():
        tr, te = t[by] != s, t[by] == s
        X = t.loc[tr, feats]
        mu, sd = X.mean(), X.std().replace(0, 1)
        Z = ((X - mu) / sd).to_numpy()
        y = t.loc[tr, target].to_numpy()
        ym = y.mean()
        beta = np.linalg.solve(Z.T @ Z + alpha * np.eye(len(feats)), Z.T @ (y - ym))
        pred[te.to_numpy()] = ((t.loc[te, feats] - mu) / sd).to_numpy() @ beta + ym
    full = t[feats]
    Zf = ((full - full.mean()) / full.std().replace(0, 1)).to_numpy()
    yf = t[target].to_numpy()
    beta = np.linalg.solve(Zf.T @ Zf + alpha * np.eye(len(feats)), Zf.T @ (yf - yf.mean()))
    return {
        "n": int(len(t)),
        "r": r4(corr(pred, t[target])),
        "rmse": r4(float(np.sqrt(np.mean((pred - t[target].to_numpy()) ** 2)))),
        "coef": {f: r4(b) for f, b in zip(feats, beta)},
    }


def nonneg_weights(table: pd.DataFrame, feats: list[str], target: str, alpha: float = 3.0) -> dict[str, float]:
    """Weights for a composite: ridge on standardized features, the most negative dropped until none is, scaled to sum to 1. A stat
    that adds nothing to what the others already say ends at 0."""
    t = table[[*feats, target]].dropna()
    keep = list(feats)
    beta = np.zeros(len(keep))
    while keep:
        Z = ((t[keep] - t[keep].mean()) / t[keep].std().replace(0, 1)).to_numpy()
        y = t[target].to_numpy()
        beta = np.linalg.solve(Z.T @ Z + alpha * np.eye(len(keep)), Z.T @ (y - y.mean()))
        if (beta >= 0).all() or len(keep) == 1:
            break
        keep.pop(int(np.argmin(beta)))
    total = float(np.clip(beta, 0, None).sum()) or 1.0
    out = {k: 0.0 for k in feats}
    for k, b in zip(keep, beta):
        out[k] = r4(max(float(b), 0.0) / total) or 0.0
    return out


# ---------------------------------------------------------------------------------------------- shrinkage and calibration


def talent_and_drift(history: pd.DataFrame, v: str = "v", n: str = "n", sd_play: float = 1.0, min_n: float = 200) -> tuple[float, float]:
    """The spread of true level among the players, and how far one player's true level moves in a year, from earlier seasons only."""
    q = history[history[n] >= min_n].copy()
    if len(q) < 10:
        return (float(q[v].var()) if len(q) > 1 else 1.0) * 0.5, 0.0
    q["se2"] = sd_play**2 / q[n]
    var = float(q[v].var())
    talent = max(var - float(q["se2"].mean()), 0.25 * var)
    nx = q[["season", "id", v, "se2"]].copy()
    nx["season"] -= 1
    m = q.merge(nx, on=["season", "id"], suffixes=("", "_n"))
    drift = talent * 0.3
    if len(m) >= 10:
        drift = max(float((m[v] - m[v + "_n"]).var()) - float((m["se2"] + m["se2_n"]).mean()), 0.1 * talent)
    return talent, min(drift, 2 * talent)


def shrink_backtest(plays: pd.DataFrame, value: str, sd_play: float, qualify: float, seasons: list[int], k_early: int = EARLY_GAMES,
                    min_early: int = 100, min_rest: int = 150, interval_scale: float = 1.0, center: bool = False, center_mu: bool | None = None,
                    center_hist: bool | None = None, relative: bool = False) -> dict:
    """Summary of `backtest_rows`: how the estimates did, how often the stated ranges held and how the pairwise chances did."""
    R = backtest_rows(plays, value, sd_play, qualify, seasons, k_early, min_early, min_rest, center, center_mu, center_hist, relative)
    return summarize_backtest(R, interval_scale)


def backtest_rows(plays: pd.DataFrame, value: str, sd_play: float, qualify: float, seasons: list[int], k_early: int = EARLY_GAMES,
                  min_early: int = 100, min_rest: int = 150, center: bool = False, center_mu: bool | None = None,
                  center_hist: bool | None = None, relative: bool = False) -> pd.DataFrame:
    """The site's way of estimating a level, replayed on real seasons. One row per player-season: the estimates, their standard
    error and the rest-of-season outcome with its own sampling noise.

    `plays` has one row per play with season, id, week, game, `value` (the per-play number whose mean is the stat). For each test
    season the estimate after the first `k_early` games is made three ways -- as it stands, pulled toward the league by how noisy
    it is, and pulled toward the player's own earlier seasons -- and scored against the rest of that season. Talent and drift are
    estimated from seasons before the test season, so nothing leaks.

    With `center`, the way the site does it: the league's average in the test season is taken from the same first `k_early` games the
    estimate uses, and every earlier season is moved by the gap between its own league average and that one, so a league-wide shift is
    not read as the player changing. Also returns a pairwise calibration: for pairs of players in a season, the chance the model gives
    that the one it rates higher does better over the rest of the season, against how often he did."""
    plays = plays.sort_values(["season", "id", "week", "game"]).copy()
    plays["gi"] = plays.groupby(["season", "id"])["game"].transform(lambda s: pd.factorize(s)[0])
    full = plays.groupby(["season", "id"]).agg(n=(value, "size"), v=(value, "mean")).reset_index()
    rows = []
    for test in seasons:
        hist = full[full["season"] < test]
        if hist.empty:
            continue
        talent, drift = talent_and_drift(hist, sd_play=sd_play)
        mu = float(hist[hist["n"] >= 200]["v"].mean())
        season_mu: dict[int, float] = {}
        c_mu = center if center_mu is None else center_mu
        c_hist = center if center_hist is None else center_hist
        if c_mu:
            first = plays[(plays["season"] == test) & (plays["gi"] < k_early)]
            mu = float(first[value].mean())
        rest_mu = float(plays[(plays["season"] == test) & (plays["gi"] >= k_early)][value].mean()) if relative else 0.0
        if c_hist:
            season_mu = {int(y): float(np.average(g["v"], weights=g["n"])) for y, g in hist[hist["n"] >= 200].groupby("season")}
        for pid, x in plays[plays["season"] == test].groupby("id"):
            f, r = x[x["gi"] < k_early], x[x["gi"] >= k_early]
            if len(f) < min_early or len(r) < min_rest or len(x) < qualify:
                continue
            vf = float(f[value].mean())
            e2 = sd_play**2 / len(f)
            shr = mu + talent / (talent + e2) * (vf - mu)
            h = hist[(hist["id"] == pid) & (hist["n"] >= 100)]
            has = len(h) > 0
            post, pe = shr, float(np.sqrt(1 / (1 / talent + 1 / e2)))
            if has:
                num = den = 0.0
                for _, row in h.iterrows():
                    var = sd_play**2 / row["n"] + (test - row["season"]) * drift
                    then = season_mu.get(int(row["season"]))
                    num += (row["v"] - then + mu if c_hist and then is not None else row["v"]) / var
                    den += 1 / var
                pv, pvar = num / den, 1 / den
                prec = 1 / talent + 1 / pvar
                start = (mu / talent + pv / pvar) / prec
                pp = prec + 1 / e2
                post, pe = (start * prec + vf / e2) / pp, float(np.sqrt(1 / pp))
            rows.append({"season": test, "id": pid, "has_prior": has, "raw": vf, "league": shr, "history": post, "pe": pe,
                         "target": float(r[value].mean()) - rest_mu, "se_target": sd_play / np.sqrt(len(r))})
    return pd.DataFrame(rows)


def summarize_backtest(R: pd.DataFrame, interval_scale: float = 1.0) -> dict:
    if R.empty:
        return {"n": 0}
    out: dict = {"n": int(len(R)), "withHistory": int(R["has_prior"].sum())}
    for lab, sub in (("all", R), ("withHistory", R[R["has_prior"]]), ("noHistory", R[~R["has_prior"]])):
        if len(sub) < 5:
            continue
        out[lab] = {m: {"r": r4(corr(sub[m], sub["target"])), "rmse": r4(float(np.sqrt(((sub[m] - sub["target"]) ** 2).mean())))} for m in ("raw", "league", "history")}
    z = (R["target"] - R["history"]) / np.sqrt((R["pe"] * interval_scale) ** 2 + R["se_target"] ** 2)
    out["calibration"] = {
        "zSd": r4(float(z.std())),
        "within80": r4(float((z.abs() < 1.2816).mean())),
        "within95": r4(float((z.abs() < 1.96).mean())),
        "intervalScale": interval_scale,
    }
    # The scale that would make the claimed intervals right: the spread of the standardized misses.
    z1 = (R["target"] - R["history"]) / np.sqrt(R["pe"] ** 2 + R["se_target"] ** 2)
    out["calibration"]["suggestedScale"] = r4(float(z1.std()))
    out["shrinkGain"] = r4(1 - out["all"]["league"]["rmse"] / out["all"]["raw"]["rmse"]) if out.get("all") else None
    out["pairwise"] = pairwise_calibration(R, interval_scale if interval_scale else 1.0)
    return out


def pairwise_calibration(R: pd.DataFrame, scale: float = 1.0, bins: tuple[float, ...] = (0.5, 0.6, 0.7, 0.8, 0.9, 1.0)) -> dict:
    """How often the player the model rates higher does better over the rest of the season, against the chance it claims.

    One row per player-season in `R` (columns season, history, pe, target, se_target). The claimed chance for a pair is the normal
    chance that the true rest-of-season rate of the higher-rated player is larger, counting the uncertainty in both estimates and the
    noise in both outcomes. Pairs are read in the direction the model leans, so the claimed chance is always at least one half."""
    from math import erf, sqrt  # noqa: PLC0415

    phi = np.vectorize(lambda z: 0.5 * (1.0 + erf(z / sqrt(2.0))))
    pred, hit = [], []
    for _, g in R.groupby("season"):
        e, p, t, s = g["history"].to_numpy(), g["pe"].to_numpy() * scale, g["target"].to_numpy(), g["se_target"].to_numpy()
        i, j = np.triu_indices(len(g), k=1)
        d = e[i] - e[j]
        z = np.abs(d) / np.sqrt(p[i] ** 2 + p[j] ** 2 + s[i] ** 2 + s[j] ** 2)
        lead = np.where(d >= 0, t[i] - t[j], t[j] - t[i])
        pred.append(phi(z))
        hit.append((lead > 0).astype(float))
    if not pred:
        return {"pairs": 0}
    pr, ht = np.concatenate(pred), np.concatenate(hit)
    rows = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (pr >= lo) & (pr < hi if hi < 1.0 else pr <= hi)
        if m.sum() >= 20:
            rows.append({"claimed": f"{lo:.1f}-{hi:.1f}", "pairs": int(m.sum()), "meanClaimed": r4(float(pr[m].mean())), "didBetter": r4(float(ht[m].mean()))})
    return {"pairs": int(len(pr)), "meanClaimed": r4(float(pr.mean())), "didBetter": r4(float(ht.mean())), "brier": r4(float(((pr - ht) ** 2).mean())),
            "brierCoinFlip": r4(float(((0.5 - ht) ** 2).mean())), "bins": rows}


# ---------------------------------------------------------------------------------------------- tables from the source files


def _flag(df: pd.DataFrame, c: str) -> pd.Series:
    return pd.to_numeric(df[c], errors="coerce").fillna(0) if c in df else pd.Series(0.0, index=df.index)


def clean_pbp(pbp: pd.DataFrame) -> pd.DataFrame:
    """Plays the way the site counts them: regular season, a scored play, and no play wiped out by a penalty."""
    p = pbp[pbp["season_type"] == "REG"] if "season_type" in pbp else pbp
    p = p[p["epa"].notna()]
    if "penalty" in p:
        p = p[p["penalty"].fillna(0) != 1]
    return p


def qb_plays(pbp: pd.DataFrame, qbs: set[str] | None = None) -> pd.DataFrame:
    """One row per quarterback play: every dropback (a scramble is a dropback to the league's own definition, and the quarterback is
    the *rusher* on it, not the passer) and, kept apart, his designed runs."""
    p = clean_pbp(pbp)
    for c in ("passer_player_id", "rusher_player_id", "play_type"):
        if c not in p:
            p = p.assign(**{c: np.nan})
    drop = p[(_flag(p, "qb_dropback") == 1)]
    passes = drop[drop["passer_player_id"].notna()].assign(id=lambda d: d["passer_player_id"], kind="pass")
    scr = drop[(_flag(drop, "qb_scramble") == 1) & drop["rusher_player_id"].notna() & drop["passer_player_id"].isna()].assign(id=lambda d: d["rusher_player_id"], kind="scramble")
    ids = set(passes["id"]) if qbs is None else qbs
    runs = p[(_flag(p, "rush_attempt") == 1) & (_flag(p, "qb_scramble") != 1) & p["rusher_player_id"].isin(ids) & (p["play_type"] == "run")].assign(id=lambda d: d["rusher_player_id"], kind="design")
    out = pd.concat([passes, scr, runs], ignore_index=True)
    # The quarterback's value is the league's quarterback-only EPA, as on the site: it differs from the play's EPA only where someone
    # else lost the ball. A season file without the column falls back to the play's EPA.
    if "qb_epa" in out:
        out["epa"] = pd.to_numeric(out["qb_epa"], errors="coerce").fillna(out["epa"])
    out["game"] = out["game_id"]
    out["succ"] = _flag(out, "success")
    out["sck"] = _flag(out, "sack")
    out["int_t"] = _flag(out, "interception")
    cp = pd.to_numeric(out["cpoe"], errors="coerce") if "cpoe" in out else pd.Series(np.nan, index=out.index)
    out["cpoe_v"], out["cpoe_n"] = cp.fillna(0), cp.notna().astype(float)
    return out[out["id"].isin(ids)]


def qb_units(plays: pd.DataFrame, scrambles: bool = True) -> pd.DataFrame:
    """Per quarterback per game."""
    x = plays if scrambles else plays[plays["kind"] != "scramble"]
    d = x[x["kind"] != "design"].assign(db=1.0)
    g = d.groupby(["season", "id", "week", "game"], as_index=False).agg(db=("db", "sum"), epa=("epa", "sum"), succ=("succ", "sum"), cpoe=("cpoe_v", "sum"), cpoe_n=("cpoe_n", "sum"),
                                                                       sck=("sck", "sum"), int_t=("int_t", "sum"))
    r = x[x["kind"] == "design"].groupby(["season", "id", "week", "game"], as_index=False).agg(run_n=("epa", "size"), run_epa=("epa", "sum"))
    g = g.merge(r, on=["season", "id", "week", "game"], how="left").fillna({"run_n": 0, "run_epa": 0})
    g["all_n"], g["all_epa"] = g["db"] + g["run_n"], g["epa"] + g["run_epa"]
    return g


QB_STATS = {
    "epaDb": ("epa", "db"), "success": ("succ", "db"), "cpoe": ("cpoe", "cpoe_n"), "sackRate": ("sck", "db"), "intRate": ("int_t", "db"),
    "epaAll": ("all_epa", "all_n"),
}


def rec_targets(pbp: pd.DataFrame, group_of: dict[tuple[int, str], str]) -> pd.DataFrame:
    """One row per target for wide receivers and tight ends: expected completion and expected yards after the catch come from the
    play-by-play's own models, so a completion is measured against the catch the play was expected to be."""
    p = clean_pbp(pbp)
    t = p[(_flag(p, "pass_attempt") == 1) & p["receiver_player_id"].notna()].copy()
    t["id"] = t["receiver_player_id"]
    t["group"] = [group_of.get((int(s), i)) for s, i in zip(t["season"], t["id"])]
    t = t[t["group"].isin(["wr", "te", "rb"])].copy()
    t["game"] = t["game_id"]
    t["succ"] = _flag(t, "success")
    cp = pd.to_numeric(t["cp"], errors="coerce") if "cp" in t else pd.Series(np.nan, index=t.index)
    comp = _flag(t, "complete_pass")
    t["croe_v"] = (comp - cp).fillna(0)
    t["croe_n"] = cp.notna().astype(float)
    ya, xy = pd.to_numeric(t["yards_after_catch"], errors="coerce"), pd.to_numeric(t["xyac_mean_yardage"], errors="coerce")
    caught = (comp == 1) & ya.notna() & xy.notna()
    t["yacoe_v"], t["yacoe_n"] = (ya - xy).where(caught, 0).fillna(0), caught.astype(float)
    t["tgt"] = 1.0
    ay = pd.to_numeric(t["air_yards"], errors="coerce")
    t["air_v"], t["air_n"] = ay.fillna(0), ay.notna().astype(float)
    att = p[_flag(p, "pass_attempt") == 1].groupby(["season", "posteam", "game_id"]).size().rename("team_att").reset_index()
    return t.merge(att, on=["season", "posteam", "game_id"], how="left")


def rec_units(targets: pd.DataFrame, group: str) -> pd.DataFrame:
    t = targets[targets["group"] == group]
    g = t.groupby(["season", "id", "week", "game"], as_index=False).agg(tgt=("tgt", "sum"), epa=("epa", "sum"), succ=("succ", "sum"), croe=("croe_v", "sum"), croe_n=("croe_n", "sum"),
                                                                       yacoe=("yacoe_v", "sum"), yacoe_n=("yacoe_n", "sum"), air=("air_v", "sum"), air_n=("air_n", "sum"),
                                                                       team_att=("team_att", "first"))
    return g


REC_STATS = {
    "epaTgt": ("epa", "tgt"), "success": ("succ", "tgt"), "croe": ("croe", "croe_n"), "yacOe": ("yacoe", "yacoe_n"), "share": ("tgt", "team_att"), "adot": ("air", "air_n"),
}


def rush_units(pbp: pd.DataFrame, group_of: dict[tuple[int, str], str]) -> pd.DataFrame:
    p = clean_pbp(pbp)
    n = p[(_flag(p, "rush_attempt") == 1) & (p["play_type"] == "run") & (_flag(p, "qb_scramble") != 1) & p["rusher_player_id"].notna()].copy()
    n["id"] = n["rusher_player_id"]
    n["group"] = [group_of.get((int(s), i)) for s, i in zip(n["season"], n["id"])]
    n = n[n["group"] == "rb"]
    y = pd.to_numeric(n["yards_gained"], errors="coerce").fillna(0)
    n["car"], n["succ"], n["expl"], n["stuff"], n["yds"] = 1.0, _flag(n, "success"), (y >= 10).astype(float), (y <= 0).astype(float), y
    n["game"] = n["game_id"]
    return n.groupby(["season", "id", "week", "game"], as_index=False).agg(car=("car", "sum"), epa=("epa", "sum"), succ=("succ", "sum"), expl=("expl", "sum"), stuff=("stuff", "sum"), yds=("yds", "sum"))


RB_STATS = {"epaRush": ("epa", "car"), "success": ("succ", "car"), "explosive": ("expl", "car"), "stuffRate": ("stuff", "car"), "ypc": ("yds", "car")}

DEF_GROUP = {"DE": "edge", "OLB": "edge", "DT": "idl", "NT": "idl", "ILB": "lb", "MLB": "lb", "LB": "lb", "CB": "cb", "S": "saf", "SS": "saf", "FS": "saf", "DB": "saf"}


def def_units(pfr_def: pd.DataFrame, snaps: pd.DataFrame) -> pd.DataFrame:
    """One row per defender per game: the PFR line joined to the snap count and the snap-count position."""
    d = pfr_def[pfr_def["game_type"] == "REG"] if "game_type" in pfr_def else pfr_def
    s = snaps[snaps["game_type"] == "REG"] if "game_type" in snaps else snaps
    s = s[["season", "week", "team", "pfr_player_id", "position", "defense_snaps"]]
    g = d.merge(s, on=["season", "week", "team", "pfr_player_id"], how="inner")
    g = g[g["defense_snaps"] > 0].copy()
    g["group"] = g["position"].map(DEF_GROUP)
    g["id"] = g["pfr_player_id"]
    g["game"] = g["game_id"]
    for c in ("def_pressures", "def_sacks", "def_targets", "def_completions_allowed", "def_yards_allowed", "def_missed_tackles", "def_tackles_combined", "def_receiving_td_allowed"):
        g[c] = pd.to_numeric(g[c], errors="coerce").fillna(0)
    g["tackle_chances"] = g["def_tackles_combined"] + g["def_missed_tackles"]
    return g.dropna(subset=["group"])


DEF_STATS = {
    "edge": {"pressRate": ("def_pressures", "defense_snaps"), "sackRate": ("def_sacks", "defense_snaps"), "missedPct": ("def_missed_tackles", "tackle_chances"),
             "tackleRate": ("def_tackles_combined", "defense_snaps")},
    "idl": {"pressRate": ("def_pressures", "defense_snaps"), "sackRate": ("def_sacks", "defense_snaps"), "missedPct": ("def_missed_tackles", "tackle_chances"),
            "tackleRate": ("def_tackles_combined", "defense_snaps")},
    "lb": {"yardsTgt": ("def_yards_allowed", "def_targets"), "compPct": ("def_completions_allowed", "def_targets"), "tgtRate": ("def_targets", "defense_snaps"),
           "missedPct": ("def_missed_tackles", "tackle_chances"), "tackleRate": ("def_tackles_combined", "defense_snaps")},
    "cb": {"yardsTgt": ("def_yards_allowed", "def_targets"), "compPct": ("def_completions_allowed", "def_targets"), "tgtRate": ("def_targets", "defense_snaps"),
           "missedPct": ("def_missed_tackles", "tackle_chances")},
    "saf": {"yardsTgt": ("def_yards_allowed", "def_targets"), "compPct": ("def_completions_allowed", "def_targets"), "tgtRate": ("def_targets", "defense_snaps"),
            "missedPct": ("def_missed_tackles", "tackle_chances")},
}
DEF_GATE = {"edge": "defense_snaps", "idl": "defense_snaps", "lb": "defense_snaps", "cb": "defense_snaps", "saf": "defense_snaps"}
# Half a season of the stat's own denominator before a half-season counts (tackle chances, targets).
DEF_MIN_STAT = {"lb": 15, "cb": 12, "saf": 10, "edge": 20, "idl": 20}


# ---------------------------------------------------------------------------------------------- the report, group by group


def stat_block(units: pd.DataFrame, stats: dict[str, tuple[str, str]], gate: str, min_gate: float, headline: str, min_den: float = 1.0) -> dict:
    """Reliability and stability for every stat of a group, how well each predicts the headline next season, and the redundancy."""
    tab = season_table(units, stats, min_gate, gate)
    keys = list(stats)
    rel = {k: split_half(units, stats[k][0], stats[k][1], gate, min_gate, min_den) for k in keys}
    st = yoy(tab, keys) if len(tab) else {}
    m = with_next(tab, keys)
    pred = {}
    for k in keys:
        r = ridge_cv(m, [k], headline + "_nx")
        pred[k] = {"r": r["r"], "rmse": r["rmse"]}
    return {
        "playerSeasons": int(len(tab)),
        "stats": {k: {"reliability": rel[k], "yoy": st.get(k), "predictsHeadlineNextSeason": pred[k]} for k in keys},
        "redundancy": redundancy(tab, keys),
        "headline": headline,
    }


def opponent_effect(pbp: pd.DataFrame, plays: pd.DataFrame, seasons: list[int], k: int = EARLY_GAMES, shrink: int = 300) -> dict:
    """How much of an EPA number is the defenses faced, using only what could be known at the time.

    A defense's quality is its EPA allowed per dropback in games *before* the week in question and *not against the quarterback's own team*,
    pulled toward the league average by `shrink` dropbacks. Each of a quarterback's first `k` games is adjusted by the quality of that
    defense as of the week before that game (so a Week 4 opponent is judged on Weeks 1 to 3, never on how he later looked). The report
    gives the spread of the adjustment against the spread of quarterbacks, and whether adjusted first games predict the rest any better."""
    p = clean_pbp(pbp)
    p = p[(_flag(p, "qb_dropback") == 1) & p["season"].isin(seasons)]
    dg = p.groupby(["season", "defteam", "posteam", "week"]).agg(e=("epa", "sum"), n=("epa", "size")).reset_index()
    lm = p.groupby("season")["epa"].mean()
    by_def = {key: grp for key, grp in dg.groupby(["season", "defteam"])}

    def quality(season: int, defense: str, before_week: int, not_against: str) -> float:
        x = by_def.get((season, defense))
        if x is None:
            return 0.0
        x = x[(x["week"] < before_week) & (x["posteam"] != not_against)]
        return float((x["e"].sum() + shrink * lm[season]) / (x["n"].sum() + shrink) - lm[season])

    pl = plays[plays["kind"] != "design"].sort_values(["season", "id", "week", "game"]).copy()
    pl["gi"] = pl.groupby(["season", "id"])["game"].transform(lambda z: pd.factorize(z)[0])
    rows = []
    for (s, pid), x in pl.groupby(["season", "id"]):
        f, r = x[x["gi"] < k], x[x["gi"] >= k]
        if len(f) < 100 or len(r) < 150 or len(x) < QUALIFY["qb"]:
            continue
        adj = np.mean([quality(s, d, int(w), t) for d, w, t in zip(f["defteam"], f["week"], f["posteam"])])
        rows.append({"f": f["epa"].mean(), "f_adj": f["epa"].mean() - adj, "opp": adj, "t": r["epa"].mean(), "season": s})
    D = pd.DataFrame(rows)
    if len(D) < 30:
        return {}
    d, lo, hi = boot_diff(D, "f_adj", "f", "t")
    return {"n": int(len(D)), "scheduleSd": r4(float(D["opp"].std())), "quarterbackSd": r4(float(D["f"].std())), "adjustedMinusRaw": {"diff": r4(d), "lo": r4(lo), "hi": r4(hi)},
            "rawR": r4(corr(D["f"], D["t"])), "adjustedR": r4(corr(D["f_adj"], D["t"]))}


# ---------------------------------------------------------------------------------------------- quarterbacks: ability, production, contribution


def qb_season_table(plays: pd.DataFrame, pbp: pd.DataFrame, adv_pass: pd.DataFrame | None = None, pfr_to_gsis: dict[str, str] | None = None) -> pd.DataFrame:
    """One row per quarterback season with everything a method could use and everything a method could be asked to predict.

    Rate stats (per dropback, scrambles included, designed runs apart), totals (EPA above the league average per play, which is
    what a season is worth rather than how efficient it was), and the team's own offense in the games he started."""
    pl = plays.copy()
    pl["db"] = np.where(pl["kind"] == "design", 0.0, 1.0)
    pl["wpa_v"] = pd.to_numeric(pl["wpa"], errors="coerce").fillna(0) if "wpa" in pl else 0.0
    g = pl.groupby(["season", "id"])
    d = pl[pl["kind"] != "design"].groupby(["season", "id"])
    passes = pl[pl["kind"] == "pass"].groupby(["season", "id"])
    T = pd.DataFrame({
        "n": d["epa"].size(), "epa_db": d["epa"].mean(), "epa_pass": passes["epa"].mean(), "succ": d["succ"].mean(), "sack": d["sck"].mean(), "int": d["int_t"].mean(),
        "wpa_db": d["wpa_v"].mean(), "scr_n": pl[pl["kind"] == "scramble"].groupby(["season", "id"])["epa"].size(),
        "scr_epa": pl[pl["kind"] == "scramble"].groupby(["season", "id"])["epa"].sum(),
        "run_n": pl[pl["kind"] == "design"].groupby(["season", "id"])["epa"].size(), "run_epa": pl[pl["kind"] == "design"].groupby(["season", "id"])["epa"].sum(),
        "att_n": passes["epa"].size(), "epa_sum": d["epa"].sum(),
        "cpoe_v": passes["cpoe_v"].sum(), "cpoe_n": passes["cpoe_n"].sum(),
        "games": g["game"].nunique(),
    }).reset_index().fillna({"scr_n": 0, "scr_epa": 0, "run_n": 0, "run_epa": 0})
    T["cpoe"] = np.where(T["cpoe_n"] > 0, T["cpoe_v"] / T["cpoe_n"].where(T["cpoe_n"] > 0, 1), np.nan)
    T["epa_all"] = (T["epa_sum"] + T["run_epa"]) / (T["n"] + T["run_n"])
    # What a season is worth, apart from how efficient it was: EPA above the average quarterback play, summed over everything he did.
    lg = pl.groupby("season")["epa"].mean().rename("lg").reset_index()
    T = T.merge(lg, on="season")
    T["epa_over_avg"] = (T["epa_sum"] + T["run_epa"]) - T["lg"] * (T["n"] + T["run_n"])
    T["epa_over_avg_pg"] = T["epa_over_avg"] / T["games"]
    # The team's offense in the games he was the quarterback for most of: his team's whole offense, passes and runs.
    p = clean_pbp(pbp)
    p = p[p["play_type"].isin(["pass", "run"])]
    team = p.groupby(["season", "posteam", "game_id"]).agg(e=("epa", "sum"), m=("epa", "size")).reset_index()
    starter = pl[pl["kind"] != "design"].groupby(["season", "posteam", "game_id", "id"]).size().rename("k").reset_index()
    starter = starter.sort_values("k", ascending=False).drop_duplicates(["season", "posteam", "game_id"])
    te = starter.merge(team, on=["season", "posteam", "game_id"]).groupby(["season", "id"]).agg(te=("e", "sum"), tm=("m", "sum")).reset_index()
    te["team_epa"] = te["te"] / te["tm"]
    T = T.merge(te[["season", "id", "team_epa"]], on=["season", "id"], how="left")
    if adv_pass is not None and pfr_to_gsis is not None and len(adv_pass):
        a = adv_pass[adv_pass["game_type"] == "REG"].copy() if "game_type" in adv_pass else adv_pass.copy()
        a["id"] = a["pfr_player_id"].map(pfr_to_gsis)
        a = a.dropna(subset=["id"])
        for c in ("passing_bad_throws", "times_pressured", "times_sacked"):
            a[c] = pd.to_numeric(a[c], errors="coerce").fillna(0)
        ag = a.groupby(["season", "id"]).agg(bad=("passing_bad_throws", "sum"), pressured=("times_pressured", "sum")).reset_index()
        T = T.merge(ag, on=["season", "id"], how="left")
        T["bad_throw"] = T["bad"] / T["att_n"]
        T["pressure_rate"] = T["pressured"] / T["n"]
    return T


def site_composite(T: pd.DataFrame, use_bad: bool = True) -> pd.Series:
    """The grade the site computes today for these quarterbacks (its own stabilizing and grading code), season by season: the mean of
    the grades on EPA per dropback, success, CPOE and bad-throw rate. `use_bad=False` drops the last when Pro Football Reference has no table."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_players as bp  # noqa: PLC0415

    out = pd.Series(np.nan, index=T.index)
    spec = [("epa_pass", "epaDb", True, "n"), ("succ", "success", True, "n"), ("cpoe", "cpoe", True, "cpoe_n")]
    if use_bad:
        spec.append(("bad_throw", "badThrow", False, "att_n"))
    for _, idx in T.groupby("season").groups.items():
        grades = []
        for col, stat, higher, den in spec:
            st = bp.GROUPS["qb"].stats[stat]
            sub = T.loc[idx].dropna(subset=[col])
            items = {i: (float(sub.at[i, col]) * st.scale, bp.standard_error(st, float(sub.at[i, col]) * float(sub.at[i, den]), float(sub.at[i, den]))) for i in sub.index}
            if len(items) < 3:
                continue
            shr, _, sd = bp.stabilize(items)
            grades.append(pd.Series(bp.grades(shr, higher, sd)))
        if grades:
            out.loc[idx] = pd.concat(grades, axis=1).mean(axis=1).reindex(idx).to_numpy()
    return out


def zscore_by_season(T: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    Z = T.copy()
    for c in cols:
        g = Z.groupby("season")[c]
        Z[c] = (Z[c] - g.transform("mean")) / g.transform("std").replace(0, np.nan)
    return Z


def rolling_fit_predict(M: pd.DataFrame, feats: list[str], target: str, first_test: int, alpha: float = 1.0) -> pd.Series:
    """Predictions for rows whose target season is `first_test` or later, each from a model fitted only on pairs whose target season
    came earlier: the only honest way to ask what a method would have said before the games were played."""
    pred = pd.Series(np.nan, index=M.index)
    for s in sorted(M["season"].unique()):
        tgt_season = s + 1
        if tgt_season < first_test:
            continue
        tr = M[(M["season"] + 1) < tgt_season].dropna(subset=[*feats, target])
        te = M[M["season"] == s].dropna(subset=feats)
        if len(tr) < 25 or te.empty:
            continue
        mu, sd = tr[feats].mean(), tr[feats].std().replace(0, 1)
        Z = ((tr[feats] - mu) / sd).to_numpy()
        y = tr[target].to_numpy()
        beta = np.linalg.solve(Z.T @ Z + alpha * np.eye(len(feats)), Z.T @ (y - y.mean()))
        pred.loc[te.index] = ((te[feats] - mu) / sd).to_numpy() @ beta + y.mean()
    return pred


def qb_ability_study(T: pd.DataFrame, min_db: int = 250, first_test: int = 2020) -> dict:
    """Which way of scoring a quarterback's season best anticipates his next one, tested on seasons the method never saw.

    Methods: EPA per dropback (passes only, as the site has it), the same with scrambles, EPA per play with designed runs, success rate, CPOE,
    the site's current four-stat grade, a DAKOTA-style composite (next season's EPA regressed on EPA and CPOE, refit each year on past
    seasons only), and a few others. Targets are different views of the next season so no single definition of "good" decides the winner.
    All scores and targets are standardized within their own season, so a league-wide drift in EPA is not credited to anyone."""
    T = T[T["n"] >= min_db].copy()
    T["site"] = site_composite(T, use_bad="bad_throw" in T and T["bad_throw"].notna().any())
    T["site_no_bad"] = site_composite(T, use_bad=False)
    cols = ["epa_pass", "epa_db", "epa_all", "succ", "cpoe", "sack", "int", "wpa_db", "site", "site_no_bad", "team_epa", "epa_over_avg_pg", "n"]
    cols += [c for c in ("bad_throw", "pressure_rate") if c in T]
    Z = zscore_by_season(T, cols)
    nx = Z[["season", "id", "epa_db", "epa_all", "wpa_db", "team_epa", "epa_over_avg_pg", "n"]].copy()
    nx["season"] -= 1
    M = Z.merge(nx, on=["season", "id"], suffixes=("", "_nx"))
    M = M.reset_index(drop=True)
    targets = {"nextEpaPerDropback": "epa_db_nx", "nextEpaPerPlay": "epa_all_nx", "nextWpaPerDropback": "wpa_db_nx", "nextTeamOffenseEpa": "team_epa_nx", "nextEpaOverAvgPerGame": "epa_over_avg_pg_nx"}
    M["dakota"] = rolling_fit_predict(M, ["epa_pass", "cpoe"], "epa_db_nx", first_test)
    M["epaCpoeSuccess"] = rolling_fit_predict(M, ["epa_pass", "cpoe", "succ"], "epa_db_nx", first_test)
    M["everything"] = rolling_fit_predict(M, [c for c in ("epa_db", "succ", "cpoe", "sack", "int", "bad_throw", "pressure_rate") if c in M], "epa_db_nx", first_test)
    M["equalMix3"] = (M["epa_pass"] + M["succ"] + M["cpoe"]) / 3
    cands = {"EPA per dropback (passes only)": "epa_pass", "EPA per dropback (with scrambles)": "epa_db", "EPA per play (with designed runs)": "epa_all", "success rate": "succ",
             "CPOE": "cpoe", "WPA per dropback": "wpa_db", "sack rate (lower is better)": "sack", "site grade today": "site", "site grade without bad throws": "site_no_bad",
             "DAKOTA-style (EPA + CPOE, refit yearly)": "dakota", "EPA + CPOE + success (refit yearly)": "epaCpoeSuccess", "equal mix of EPA, success, CPOE": "equalMix3",
             "every stat (refit yearly)": "everything"}
    sign = {"sack": -1, "sack rate (lower is better)": -1}
    test = M[M["season"] + 1 >= first_test].copy()
    out: dict = {"n": int(len(test)), "minDropbacks": min_db, "firstTargetSeason": first_test, "targets": {}}
    for tname, tcol in targets.items():
        res = {}
        for label, c in cands.items():
            if c not in test:
                continue
            x = test[c] * (-1 if c == "sack" else 1)
            ok = x.notna() & test[tcol].notna()
            r = corr(x[ok], test.loc[ok, tcol])
            lo, hi = boot_ci(x[ok], test.loc[ok, tcol])
            res[label] = {"r": r4(r), "ci": [r4(lo), r4(hi)], "n": int(ok.sum())}
        out["targets"][tname] = res
    # The differences that are claimed, with intervals: a gap whose interval holds zero is not a finding.
    def diff(a: str, b: str, tcol: str) -> dict:
        t = test.assign(_a=test[a] * (-1 if a == "sack" else 1), _b=test[b] * (-1 if b == "sack" else 1))
        d, lo, hi = boot_diff(t, "_a", "_b", tcol)
        return {"diff": r4(d), "lo": r4(lo), "hi": r4(hi), "meaningful": bool(lo > 0 or hi < 0) if np.isfinite(lo) else False}
    out["comparisons"] = {
        "epaVsSiteGrade": diff("epa_pass", "site", "epa_db_nx"),
        "epaVsDakota": diff("epa_pass", "dakota", "epa_db_nx"),
        "dakotaVsSiteGrade": diff("dakota", "site", "epa_db_nx"),
        "scramblesVsPassesOnly": diff("epa_db", "epa_pass", "epa_all_nx"),
        "epaVsSuccess": diff("epa_pass", "succ", "epa_db_nx"),
        "epaVsCpoe": diff("epa_pass", "cpoe", "epa_db_nx"),
        "epaVsSiteGradeOnTeamOffense": diff("epa_pass", "site", "team_epa_nx"),
        "epaVsSiteGradeOnWpa": diff("epa_pass", "site", "wpa_db_nx"),
    }
    # Sensitivity to who counts as a starter.
    sens = {}
    for m in (150, 250, 350, 450):
        sub = M[(M["n"] > -1e9)]
        # The z-scored n is unusable for thresholds; use the raw table.
        keep = T[T["n"] >= m][["season", "id"]]
        s2 = sub.merge(keep, on=["season", "id"])
        s2 = s2[s2["season"] + 1 >= first_test]
        sens[str(m)] = {
            "n": int(len(s2)),
            "epa": r4(corr(s2["epa_pass"], s2["epa_db_nx"])), "site": r4(corr(s2["site"], s2["epa_db_nx"])), "dakota": r4(corr(s2["dakota"], s2["epa_db_nx"])),
        }
    out["sensitivity"] = sens
    return out


def qb_early_study(plays: pd.DataFrame, pbp: pd.DataFrame, k: int = EARLY_GAMES, min_db: int = 250, first_test: int = 2020, adv_pass: pd.DataFrame | None = None,
                   pfr_to_gsis: dict[str, str] | None = None) -> dict:
    """What the site does in week 5, replayed: score every quarterback on his first `k` games, predict the rest of that season.

    A season counts when he threw (or ran) at least `min_db` times in all, so the sample after game `k` is real. Fitted methods (the
    DAKOTA-style composite) are fitted on earlier seasons only. Opponents are never looked at here at all."""
    pl = plays.sort_values(["season", "id", "week", "game"]).copy()
    pl["gi"] = pl.groupby(["season", "id"])["game"].transform(lambda z: pd.factorize(z)[0])
    early = pl[pl["gi"] < k]
    rest = pl[pl["gi"] >= k]
    e = qb_season_table(early, pbp, adv_pass=None)
    r = qb_season_table(rest, pbp, adv_pass=None)
    tot = pl[pl["kind"] != "design"].groupby(["season", "id"])["epa"].size().rename("n_all").reset_index()
    E = e.merge(r[["season", "id", "n", "epa_db", "epa_all", "wpa_db", "epa_over_avg_pg"]], on=["season", "id"], suffixes=("", "_rest")).merge(tot, on=["season", "id"])
    E = E[(E["n_all"] >= min_db) & (E["n"] >= 100) & (E["n_rest"] >= 150)].copy()
    E["site"] = site_composite(E, use_bad=False)
    cols = ["epa_pass", "epa_db", "epa_all", "succ", "cpoe", "sack", "int", "wpa_db", "site"]
    Z = zscore_by_season(E, cols + ["epa_db_rest", "epa_all_rest", "wpa_db_rest", "epa_over_avg_pg_rest"])
    Z = Z.reset_index(drop=True)
    # Fitted composite: previous seasons' first-k -> rest pairs only.
    pred = pd.Series(np.nan, index=Z.index)
    for s in sorted(Z["season"].unique()):
        if s < first_test:
            continue
        tr = Z[Z["season"] < s].dropna(subset=["epa_pass", "cpoe", "epa_db_rest"])
        te = Z[Z["season"] == s].dropna(subset=["epa_pass", "cpoe"])
        if len(tr) < 40 or te.empty:
            continue
        X = tr[["epa_pass", "cpoe"]].to_numpy()
        b = np.linalg.lstsq(np.c_[np.ones(len(X)), X], tr["epa_db_rest"].to_numpy(), rcond=None)[0]
        pred.loc[te.index] = np.c_[np.ones(len(te)), te[["epa_pass", "cpoe"]].to_numpy()] @ b
    Z["dakota"] = pred
    Z["equalMix3"] = (Z["epa_pass"] + Z["succ"] + Z["cpoe"]) / 3
    test = Z[Z["season"] >= first_test]
    cands = {"EPA per dropback (passes only)": "epa_pass", "EPA per dropback (with scrambles)": "epa_db", "EPA per play (with designed runs)": "epa_all", "success rate": "succ",
             "CPOE": "cpoe", "WPA per dropback": "wpa_db", "site grade without bad throws": "site", "DAKOTA-style (EPA + CPOE)": "dakota", "equal mix of EPA, success, CPOE": "equalMix3"}
    out: dict = {"n": int(len(test)), "games": k, "targets": {}}
    for tname, tcol in {"restEpaPerDropback": "epa_db_rest", "restEpaPerPlay": "epa_all_rest", "restWpaPerDropback": "wpa_db_rest"}.items():
        res = {}
        for label, c in cands.items():
            ok = test[c].notna() & test[tcol].notna()
            x, y = test.loc[ok, c], test.loc[ok, tcol]
            lo, hi = boot_ci(x, y)
            res[label] = {"r": r4(corr(x, y)), "ci": [r4(lo), r4(hi)], "n": int(ok.sum())}
        out["targets"][tname] = res
    d1 = boot_diff(test.dropna(subset=["epa_pass", "site", "epa_db_rest"]), "epa_pass", "site", "epa_db_rest")
    d2 = boot_diff(test.dropna(subset=["epa_db", "epa_pass", "epa_all_rest"]), "epa_db", "epa_pass", "epa_all_rest")
    out["comparisons"] = {"epaVsSiteGrade": dict(zip(("diff", "lo", "hi"), map(r4, d1))), "scramblesVsPassesOnly": dict(zip(("diff", "lo", "hi"), map(r4, d2)))}
    return out


# ---------------------------------------------------------------------------------------------- every other position: the same test


def table_with_parts(units: pd.DataFrame, stats: dict[str, tuple[str, str]], gate: str, min_gate: float, who: str = "id", extra: dict[str, str] | None = None) -> pd.DataFrame:
    """A season table that also keeps each stat's numerator and denominator (`<stat>:num`, `<stat>:den`), which the site's own
    standard-error and shrinkage code needs, plus any plain column sums asked for in `extra` ({name: source column})."""
    cols = sorted({c for pair in stats.values() for c in pair} | {gate} | set((extra or {}).values()))
    tot = units.groupby(["season", who])[cols].sum().reset_index()
    tot = tot[tot[gate] >= min_gate].copy()
    for k, (n, d) in stats.items():
        tot[k + ":num"], tot[k + ":den"] = tot[n], tot[d]
        tot[k] = np.where(tot[d] > 0, tot[n] / tot[d].where(tot[d] > 0, 1), np.nan)
    for name, src in (extra or {}).items():
        tot[name] = tot[src]
    return tot.rename(columns={who: "id"}) if who != "id" else tot


def site_grade(T: pd.DataFrame, group: str, stats: list[str]) -> pd.Series:
    """The site's current overall for these players: its own stabilizing and grading, season by season, averaged over the named stats."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_players as bp  # noqa: PLC0415

    out = pd.Series(np.nan, index=T.index)
    for _, idx in T.groupby("season").groups.items():
        gs = []
        for stat in stats:
            st = bp.GROUPS[group].stats[stat]
            sub = T.loc[idx].dropna(subset=[stat])
            sub = sub[sub[stat + ":den"] > 0]
            items = {i: (float(sub.at[i, stat]) * st.scale, bp.standard_error(st, float(sub.at[i, stat + ":num"]), float(sub.at[i, stat + ":den"]))) for i in sub.index}
            if len(items) < 3:
                continue
            shr, _, sd = bp.stabilize(items)
            gs.append(pd.Series(bp.grades(shr, st.higher, sd)))
        if gs:
            out.loc[idx] = pd.concat(gs, axis=1).mean(axis=1).reindex(idx).to_numpy()
    return out


def group_ability_study(T: pd.DataFrame, cands: dict[str, str], fits: dict[str, list[str]], targets: dict[str, str], first_test: int, lower_is_better: set[str] | None = None,
                        min_pairs: int = 40) -> dict:
    """Season N against season N+1 for one position. `cands` are scores used as they stand ({label: column}); `fits` are composites
    refit every year on past seasons only ({label: [columns]}, predicting the first target). Columns are standardized within their
    season. Lower-is-better columns are sign-flipped so every correlation reads "higher is better"."""
    flip = lower_is_better or set()
    cols = sorted(set(cands.values()) | {c for f in fits.values() for c in f} | set(targets.values()))
    Z = zscore_by_season(T, [c for c in cols if c in T])
    for c in flip:
        if c in Z:
            Z[c] = -Z[c]
    nx = Z[["season", "id", *[c for c in set(targets.values()) if c in Z]]].copy()
    nx["season"] -= 1
    M = Z.merge(nx, on=["season", "id"], suffixes=("", "_nx")).reset_index(drop=True)
    first_t = list(targets.values())[0]
    for label, feats in fits.items():
        M["fit:" + label] = rolling_fit_predict(M, [f for f in feats if f in M], first_t + "_nx", first_test)
    test = M[M["season"] + 1 >= first_test]
    out: dict = {"n": int(len(test)), "firstTargetSeason": first_test, "targets": {}, "comparisons": {}}
    if len(test) < min_pairs:
        return out
    allc = {**{k: v for k, v in cands.items() if v in test}, **{k: "fit:" + k for k in fits if "fit:" + k in test}}
    for tname, tcol in targets.items():
        res = {}
        for label, c in allc.items():
            ok = test[c].notna() & test[tcol + "_nx"].notna()
            if ok.sum() < min_pairs:
                continue
            x, y = test.loc[ok, c], test.loc[ok, tcol + "_nx"]
            lo, hi = boot_ci(x, y)
            res[label] = {"r": r4(corr(x, y)), "ci": [r4(lo), r4(hi)], "n": int(ok.sum())}
        out["targets"][tname] = res
    return out


def differences(test: pd.DataFrame, pairs: dict[str, tuple[str, str]], target: str) -> dict:
    res = {}
    for name, (a, b) in pairs.items():
        if a in test and b in test and target in test:
            d, lo, hi = boot_diff(test, a, b, target)
            res[name] = {"diff": r4(d), "lo": r4(lo), "hi": r4(hi), "meaningful": bool(np.isfinite(lo) and (lo > 0 or hi < 0))}
    return res


def receiver_season_table(targets: pd.DataFrame, pbp: pd.DataFrame, group: str) -> pd.DataFrame:
    """Wide receivers or tight ends (or backs as receivers), one row per season, with every candidate stat and the totals."""
    t = targets[targets["group"] == group].copy()
    t["fd"] = (_flag(t, "first_down") == 1).astype(float) if "first_down" in t else 0.0
    t["cmp"] = _flag(t, "complete_pass")
    t["air_team"] = np.nan
    p = clean_pbp(pbp)
    team_games = p.groupby(["season", "posteam"])["game_id"].nunique().rename("team_games").reset_index()
    units = t.groupby(["season", "id", "week", "game"], as_index=False).agg(tgt=("tgt", "sum"), epa=("epa", "sum"), succ=("succ", "sum"), croe=("croe_v", "sum"), croe_n=("croe_n", "sum"),
                                                                           yacoe=("yacoe_v", "sum"), yacoe_n=("yacoe_n", "sum"), air=("air_v", "sum"), air_n=("air_n", "sum"),
                                                                           team_att=("team_att", "first"), fd=("fd", "sum"), cmp=("cmp", "sum"), posteam=("posteam", "first"))
    stats = {**REC_STATS, "firstDown": ("fd", "tgt"), "catchRate": ("cmp", "tgt")}
    T = table_with_parts(units, stats, "tgt", QUALIFY.get(group, 40) if group != "rb" else 30, extra={"epa_total": "epa", "tgt_total": "tgt"})
    team = units.groupby(["season", "id"])["posteam"].agg(lambda z: z.mode().iloc[0]).rename("posteam").reset_index()
    T = T.merge(team, on=["season", "id"]).merge(team_games, on=["season", "posteam"], how="left")
    T["epa_pg"] = T["epa_total"] / T["team_games"]
    T["n"] = T["tgt"]
    return T


def rush_season_table(units: pd.DataFrame, pbp: pd.DataFrame, pfr_rush: pd.DataFrame | None, pfr_to_gsis: dict[str, str] | None) -> pd.DataFrame:
    u = units.copy()
    if pfr_rush is not None and pfr_to_gsis is not None:
        a = pfr_rush[pfr_rush["game_type"] == "REG"].copy() if "game_type" in pfr_rush else pfr_rush.copy()
        a["id"] = a["pfr_player_id"].map(pfr_to_gsis)
        a = a.dropna(subset=["id"])
        for c in ("carries", "rushing_yards_before_contact", "rushing_yards_after_contact", "rushing_broken_tackles"):
            a[c] = pd.to_numeric(a[c], errors="coerce").fillna(0)
        ag = a.groupby(["season", "id", "week"], as_index=False).agg(pfr_car=("carries", "sum"), ybc=("rushing_yards_before_contact", "sum"), yco=("rushing_yards_after_contact", "sum"),
                                                                     broken=("rushing_broken_tackles", "sum"))
        u = u.merge(ag, on=["season", "id", "week"], how="left").fillna({"pfr_car": 0, "ybc": 0, "yco": 0, "broken": 0})
    stats = dict(RB_STATS)
    if "pfr_car" in u:
        stats |= {"yco": ("yco", "pfr_car"), "ybc": ("ybc", "pfr_car"), "broken": ("broken", "pfr_car")}
    T = table_with_parts(u, stats, "car", QUALIFY["rb"], extra={"epa_total": "epa"})
    T["n"] = T["car"] if "car" in T else T["car:den"]
    return T


def defense_season_table(units: pd.DataFrame, group: str) -> pd.DataFrame:
    u = units[units["group"] == group].copy()
    stats = dict(DEF_STATS[group])
    stats["hurryHit" if group in ("edge", "idl") else "intRate"] = ("hh", "defense_snaps") if group in ("edge", "idl") else ("def_ints", "def_targets")
    if group in ("edge", "idl"):
        u["hh"] = pd.to_numeric(u.get("def_times_hurried", 0), errors="coerce").fillna(0) + pd.to_numeric(u.get("def_times_hitqb", 0), errors="coerce").fillna(0)
    else:
        u["def_ints"] = pd.to_numeric(u.get("def_ints", 0), errors="coerce").fillna(0)
    T = table_with_parts(u, stats, "defense_snaps", QUALIFY[group])
    T["n"] = T["defense_snaps"] if "defense_snaps" in T else T[list(stats)[0] + ":den"]
    return T


def signal_label(yoy_r: float | None) -> str:
    """How much of this position's headline number survives to next year."""
    if yoy_r is None:
        return "unknown"
    return "strong" if yoy_r >= 0.4 else "moderate" if yoy_r >= 0.25 else "weak"


def portability(T: pd.DataFrame) -> dict:
    """Do the numbers travel? Last season's EPA per dropback against this season's, for quarterbacks who stayed with a team against those who moved."""
    if "team" not in T:
        return {}
    full = T[T["n"] >= QUALIFY["qb"]][["season", "id", "epa_db", "team"]].copy()
    nx = full.copy()
    nx["season"] -= 1
    mv = full.merge(nx, on=["season", "id"], suffixes=("", "_nx"))
    moved = mv["team"] != mv["team_nx"]
    if moved.sum() < 8:
        return {}
    out = {}
    for lab, m in (("stayed", ~moved), ("moved", moved)):
        sub = mv[m]
        lo, hi = boot_ci(sub["epa_db"], sub["epa_db_nx"])
        out[lab] = {"n": int(m.sum()), "r": r4(corr(sub["epa_db"], sub["epa_db_nx"])), "ci": [r4(lo), r4(hi)]}
    return out


def scramble_audit(plays: pd.DataFrame, pbp: pd.DataFrame) -> dict:
    """Where scrambles go wrong, and what putting them right changes.

    nflverse marks a scramble with qb_dropback = 1 and qb_scramble = 1, leaves `passer_player_id` empty, and names the quarterback as the
    `rusher_player_id`. Any quarterback line built from `passer_player_id` alone therefore never sees them."""
    p = clean_pbp(pbp)
    drop = p[_flag(p, "qb_dropback") == 1]
    no_passer = drop[drop["passer_player_id"].isna()]
    scr = plays[plays["kind"] == "scramble"]
    des = plays[plays["kind"] == "design"]
    key = lambda d: set(zip(d["game_id"], d["play_id"]))  # noqa: E731
    return {
        "dropbacks": int(len(drop)),
        "dropbacksWithoutPasserId": int(len(no_passer)),
        "ofThoseScrambles": int((_flag(no_passer, "qb_scramble") == 1).sum()),
        "scramblesCounted": int(len(scr)),
        "scrambleEpaPerPlay": r4(float(scr["epa"].mean())),
        "passEpaPerPlay": r4(float(plays[plays["kind"] == "pass"]["epa"].mean())),
        "designedRunEpaPerPlay": r4(float(des["epa"].mean())),
        "playsCountedAsBothScrambleAndDesignedRun": int(len(key(scr) & key(des))),
    }


def contribution_audit(T: pd.DataFrame, min_db: int = 250) -> dict:
    """Efficiency (EPA per play) and cumulative value (EPA above an average quarterback's, summed) are different facts about a season."""
    t = T[T["n"] >= min_db]
    sp = t[["epa_all", "epa_over_avg"]].rank().corr().iloc[0, 1]
    sp_pg = t[["epa_all", "epa_over_avg_pg"]].rank().corr().iloc[0, 1]
    nx = t[["season", "id", "epa_over_avg_pg", "epa_all"]].copy()
    nx["season"] -= 1
    m = t.merge(nx, on=["season", "id"], suffixes=("", "_nx"))
    return {
        "playerSeasons": int(len(t)),
        "rankCorrelationEfficiencyVsTotal": r4(float(sp)),
        "rankCorrelationEfficiencyVsPerGame": r4(float(sp_pg)),
        "yoyTotalPerGame": r4(corr(m["epa_over_avg_pg"], m["epa_over_avg_pg_nx"])),
        "yoyEfficiency": r4(corr(m["epa_all"], m["epa_all_nx"])),
    }


def scramble_rank_changes(T: pd.DataFrame, season: int, min_db: int = 250, top: int = 6) -> list[dict]:
    t = T[(T["season"] == season) & (T["n"] >= min_db)].copy()
    t["rank_pass"] = t["epa_pass"].rank(ascending=False, method="min")
    t["rank_db"] = t["epa_db"].rank(ascending=False, method="min")
    t["move"] = t["rank_pass"] - t["rank_db"]
    t = t.reindex(t["move"].abs().sort_values(ascending=False).index).head(top)
    return [{"id": r["id"], "passOnlyRank": int(r["rank_pass"]), "withScramblesRank": int(r["rank_db"]), "scrambles": int(r["scr_n"])} for _, r in t.iterrows()]


def qb_situation_study(plays: pd.DataFrame, min_overall: int = 250) -> dict:
    """Do the splits people argue about (third down, deep, red zone, trailing) say anything beyond the whole?

    For each split: how reliable it is (odd games against even games), and whether it predicts next season's overall EPA per dropback
    once this season's overall EPA is already known (the coefficient on the split with the overall in the model, and its bootstrap interval).
    A split whose interval holds zero adds nothing the overall did not already say; it is worth showing, with its reliability, and not worth grading."""
    pl = plays[plays["kind"] != "design"].copy()
    air = pd.to_numeric(pl["air_yards"], errors="coerce") if "air_yards" in pl else pd.Series(np.nan, index=pl.index)
    down = pd.to_numeric(pl["down"], errors="coerce") if "down" in pl else pd.Series(np.nan, index=pl.index)
    ytg = pd.to_numeric(pl["ydstogo"], errors="coerce") if "ydstogo" in pl else pd.Series(np.nan, index=pl.index)
    yl = pd.to_numeric(pl["yardline_100"], errors="coerce") if "yardline_100" in pl else pd.Series(np.nan, index=pl.index)
    wp = pd.to_numeric(pl["wp"], errors="coerce") if "wp" in pl else pd.Series(np.nan, index=pl.index)
    splits = {
        "third down": ((down == 3), 60),
        "deep passes (20+ air yards)": (((air >= 20) & (_flag(pl, "pass_attempt") == 1)), 25),
        "red zone": ((yl <= 20), 40),
        "trailing (win probability under 35%)": ((wp < 0.35), 80),
        "first and second down": ((down <= 2), 150),
        "long yardage (2nd or 3rd and 7+)": (((down >= 2) & (ytg >= 7)), 60),
    }

    def season_rate(mask: pd.Series, name: str, minimum: int) -> pd.DataFrame:
        g = pl[mask].groupby(["season", "id"]).agg(n=("epa", "size"), v=("epa", "mean")).reset_index()
        return g[g["n"] >= minimum].rename(columns={"n": name + "_n", "v": name})

    tab = season_rate(pl["epa"].notna(), "all", min_overall)
    for k, (mask, minimum) in splits.items():
        tab = tab.merge(season_rate(mask, k, minimum), on=["season", "id"], how="left")
    nx = tab[["season", "id", "all"]].copy()
    nx["season"] -= 1
    M = tab.merge(nx, on=["season", "id"], suffixes=("", "_nx"))
    Z = zscore_by_season(M, ["all", "all_nx", *splits])
    out: dict = {}
    for k, (mask, minimum) in {**splits, "all dropbacks": (pl["epa"].notna(), min_overall)}.items():
        a, b = [], []
        for _, x in pl[mask].groupby(["season", "id"]):
            if len(x) < minimum:
                continue
            games = sorted(x["game"].unique())
            h1, h2 = x[x["game"].isin(games[::2])], x[x["game"].isin(games[1::2])]
            if len(h1) < minimum / 4 or len(h2) < minimum / 4:
                continue
            a.append(h1["epa"].mean())
            b.append(h2["epa"].mean())
        entry: dict = {"n": len(a), "reliability": r4(spearman_brown(corr(a, b)))}
        if k in splits:
            sub = Z.dropna(subset=["all", "all_nx", k])
            if len(sub) >= 50:
                X = np.c_[np.ones(len(sub)), sub["all"], sub[k]]
                y = sub["all_nx"].to_numpy()
                beta = np.linalg.lstsq(X, y, rcond=None)[0]
                rng = np.random.default_rng(0)
                cs = [np.linalg.lstsq(X[i], y[i], rcond=None)[0][2] for i in (rng.integers(0, len(sub), len(sub)) for _ in range(500))]
                lo, hi = np.percentile(cs, [2.5, 97.5])
                entry |= {"pairs": int(len(sub)), "rNextOverall": r4(corr(sub[k], sub["all_nx"])), "addedBeyondOverall": r4(float(beta[2])), "ci": [r4(lo), r4(hi)], "addsInformation": bool(lo > 0)}
        out[k] = entry
    return out


def scale_reference(T: pd.DataFrame, group: str, stats: list[str], since: int = 2018) -> dict:
    """What a fixed grade scale needs from the data: for each stat, the typical qualifier's value and how far apart players *truly* are
    (the spread of the observed values minus the sampling noise the volume behind them makes), pooled over many seasons, so 10 grade points
    mean the same thing in week 5 as in week 18."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_players as bp  # noqa: PLC0415

    t = T[T["season"] >= since]
    out = {}
    for stat in stats:
        if stat not in bp.GROUPS[group].stats:
            continue
        st = bp.GROUPS[group].stats[stat]
        sub = t.dropna(subset=[stat])
        sub = sub[sub[stat + ":den"] > 0]
        if len(sub) < 30:
            continue
        v = sub[stat] * st.scale
        noise = np.array([bp.standard_error(st, float(a), float(b)) or 0.0 for a, b in zip(sub[stat + ":num"], sub[stat + ":den"])])
        var = float(v.var())
        talent = max(var - float(np.nanmean(noise**2)), 0.0)
        out[stat] = {"n": int(len(sub)), "mean": r4(float(v.mean())), "observedSd": r4(float(np.sqrt(var))), "noiseSd": r4(float(np.sqrt(np.nanmean(noise**2)))),
                     "talentSd": r4(float(np.sqrt(talent))), "reliability": r4(talent / var if var else float("nan"))}
    return out


def scale_audit(folder: str, season: int, weeks: list[int], history: str | None = None) -> dict:
    """Replay the site's 1-99 "Overall" through a season, week by week, using only the games played by each week.

    The 1-99 number is the mean of the scouting grades stretched around 50 by 30 / (the league's 99th-percentile mean grade - 50). The
    stretch is read off the season's own spread, so it changes as the season goes on: the same player with the same stat line gets a
    different number. The audit records the stretch at each week, the quarterbacks' spread of raw grades, and what the stretch does to a gap."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_players as bp  # noqa: PLC0415

    src = bp.load(season, folder)
    book = bp.PriorBook.load(history) if history else None
    full = src["pbp"]

    def is_core(group: str, key: str) -> bool:
        st = bp.GROUPS[group].stats[key]
        return st.higher is not None and st.counts

    out = {}
    for w in weeks:
        cut = dict(src)
        cut["pbp"] = full[full["week"] <= w]
        res = bp.build(cut, season, "LV", book)
        raw: dict[tuple[str, str], float] = {}
        for p in res["players"]:
            if sum(1 for k in bp.GROUPS[p["group"]].stats if is_core(p["group"], k)) < 2:
                continue
            gs = [st["season"]["g"] for st in p["stats"] if is_core(p["group"], st["k"]) and st["season"].get("g") is not None]
            if gs:
                raw[(p["id"], p["group"])] = float(np.mean(gs))
        vals = sorted(raw.values())
        top = vals[min(len(vals) - 1, int(np.floor(len(vals) * 0.99)))]
        k = 30 / max(3.0, top - 50)
        qb = [v for (_, g), v in raw.items() if g == "qb"]
        out[str(w)] = {"graded": len(vals), "top99Raw": r4(top), "stretch": r4(k), "qbRawSd": r4(float(np.std(qb))) if qb else None, "qbShownSd": r4(float(np.std(qb) * k)) if qb else None}
    return out


def limits() -> list[str]:
    return [
        "Predicting next season's EPA rewards statistics made of EPA, and says nothing about whether EPA is the right definition of value. The grade therefore reports production, adjusted production, estimated ability and cumulative contribution as different things.",
        "Public data has no blocking, route, separation or coverage-assignment information. Offensive linemen get no individual grade, and a defensive back's numbers describe where quarterbacks chose to throw.",
        "A quarterback's EPA is partly his team's: those who changed teams carried almost none of last season's number with them. The data cannot split the quarterback from the line and receivers around him.",
        "Reliability is measured at full-season samples. A week-5 number is less reliable than the table says, so in-season estimates are shrunk and carry wider intervals.",
        "Regular season only. Quarterbacks run from 2016, anything using Pro Football Reference tables from 2018. FTN charting (play action, pressure, contested catches) exists from 2022 only and is not part of any test here.",
        "Differences between methods are given with bootstrap intervals over player-seasons. A difference whose interval includes zero is reported as no difference.",
    ]


def load_inputs(folder: str, seasons: list[int]) -> dict:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_players as bp  # noqa: PLC0415 - the folder layout and file names are the site's own

    def read(key: str, season: int, **kw) -> pd.DataFrame:
        return bp._read(str(Path(folder) / bp.FILES[key].format(season=season)), **kw)

    want = set(bp.PBP_COLS) | {"season", "wpa", "wp", "qb_hit", "rush_attempt", "season_type", "week", "penalty", "first_down"}
    qb_seasons = sorted(set(seasons) | {s for s in range(min(seasons) - 2, min(seasons)) if (Path(folder) / bp.FILES["pbp"].format(season=s)).exists()})
    pbps = []
    for s in qb_seasons:
        d = read("pbp", s, usecols=lambda c: c in want)
        d["season"] = s
        pbps.append(d[d["season_type"] == "REG"])
    group_of, pfr_to_gsis, defs, adv_pass, adv_rush = {}, {}, [], [], []
    for s in seasons:
        ro = read("roster", s).dropna(subset=["gsis_id"])
        dep = ro["depth_chart_position"] if "depth_chart_position" in ro else ro["position"]
        for pid, pos, dp in zip(ro["gsis_id"], ro["position"], dep):
            g = bp.DEPTH_GROUP.get(str(dp).upper()) or bp.COARSE_GROUP.get(str(pos).upper())
            if g:
                group_of[(s, pid)] = g
        if "pfr_id" in ro:
            pfr_to_gsis.update({k: v for k, v in zip(ro["pfr_id"], ro["gsis_id"]) if isinstance(k, str)})
        defs.append(def_units(read("defense", s).assign(season=s), read("snaps", s).assign(season=s)))
        adv_pass.append(read("pass", s).assign(season=s))
        adv_rush.append(read("rush", s).assign(season=s))
    return {"pbp": pd.concat(pbps, ignore_index=True), "qb_seasons": qb_seasons, "group_of": group_of, "pfr_to_gsis": pfr_to_gsis, "def_units": pd.concat(defs, ignore_index=True),
            "adv_pass": pd.concat(adv_pass, ignore_index=True), "adv_rush": pd.concat(adv_rush, ignore_index=True)}


def qb_section(inp: dict, first_test: int) -> dict:
    pbp, qb_seasons = inp["pbp"], inp["qb_seasons"]
    plays = qb_plays(pbp)
    T = qb_season_table(plays, pbp, inp["adv_pass"], inp["pfr_to_gsis"])
    units = qb_units(plays, scrambles=True)
    # The team a season was played for, for the portability check.
    T = T.merge(plays[plays["kind"] != "design"].groupby(["season", "id"])["posteam"].agg(lambda z: z.mode().iloc[0]).rename("team").reset_index(), on=["season", "id"], how="left")
    section: dict = {"unit": "dropbacks"}
    section.update(stat_block(units, QB_STATS, "db", QUALIFY["qb"], "epaDb"))
    section["signal"] = signal_label(section["stats"]["epaDb"]["yoy"]["r"] if section["stats"].get("epaDb", {}).get("yoy") else None)
    section["nextSeason"] = qb_ability_study(T, QUALIFY["qb"], first_test)
    section["earlySeason"] = {str(k): qb_early_study(plays, pbp, k=k, first_test=first_test) for k in (4, EARLY_GAMES, 8)}
    section["shrinkage"] = shrink_backtest(plays[plays["kind"] != "design"], "epa", 1.58, QUALIFY["qb"], [s for s in qb_seasons if s >= min(qb_seasons) + 2])
    section["opponent"] = {str(k): opponent_effect(pbp, plays, qb_seasons, k=k) for k in (EARLY_GAMES, 8)}
    section["portability"] = portability(T)
    section["scrambles"] = scramble_audit(plays, pbp) | {"rankChanges": {str(s): scramble_rank_changes(T, s) for s in (qb_seasons[-1],)}}
    section["contribution"] = contribution_audit(T)
    section["situations"] = qb_situation_study(plays)
    t = T[(T["n"] >= QUALIFY["qb"]) & (T["season"] >= 2018)]
    ref = {}
    for col, n in (("epa_db", t["n"]), ("epa_all", t["n"] + t["run_n"])):
        var = float(t[col].var())
        noise = float((1.58**2 / n).mean())
        ref[col] = {"n": int(len(t)), "mean": r4(float(t[col].mean())), "observedSd": r4(var**0.5), "noiseSd": r4(noise**0.5), "talentSd": r4(max(var - noise, 0) ** 0.5), "reliability": r4(max(var - noise, 0) / var)}
    section["reference"] = ref
    return section


def receiver_section(inp: dict, targets: pd.DataFrame, group: str, first_test: int) -> dict:
    pbp = inp["pbp"][inp["pbp"]["season"] >= min(s for s, _ in inp["group_of"])]
    T = receiver_season_table(targets, pbp, group)
    units = targets[targets["group"] == group].groupby(["season", "id", "week", "game"], as_index=False).agg(
        tgt=("tgt", "sum"), epa=("epa", "sum"), succ=("succ", "sum"), croe=("croe_v", "sum"), croe_n=("croe_n", "sum"), yacoe=("yacoe_v", "sum"), yacoe_n=("yacoe_n", "sum"),
        air=("air_v", "sum"), air_n=("air_n", "sum"), team_att=("team_att", "first"))
    out: dict = {"unit": "targets"}
    out.update(stat_block(units, REC_STATS, "tgt", QUALIFY[group], "epaTgt"))
    T["site"] = site_grade(T, group, ["epaTgt", "croe", "yacOe", "share"])
    T["mix4"] = zscore_by_season(T, ["epaTgt", "croe", "yacOe", "success"])[["epaTgt", "croe", "yacOe", "success"]].mean(axis=1)
    cands = {"EPA per target": "epaTgt", "success rate": "success", "first-down rate": "firstDown", "CROE": "croe", "YAC over expected": "yacOe", "target share": "share", "catch rate": "catchRate",
             "site grade today": "site", "equal mix of EPA, CROE, YAC, success": "mix4"}
    fits = {"refit: success, CROE, YAC, share": ["success", "croe", "yacOe", "share"], "refit: EPA, success, CROE, YAC, share": ["epaTgt", "success", "croe", "yacOe", "share"]}
    out["nextSeason"] = group_ability_study(T, cands, fits, {"success": "success", "epaTgt": "epaTgt", "epaPerTeamGame": "epa_pg"}, first_test)
    out["reference"] = scale_reference(T, group, ["epaTgt", "croe", "yacOe", "share"])
    out["signal"] = signal_label(out["stats"]["success"]["yoy"]["r"] if out["stats"].get("success", {}).get("yoy") else None)
    out["yoyExtra"] = yoy(T, ["firstDown", "catchRate"])
    return out


def rb_section(inp: dict, targets: pd.DataFrame, first_test: int) -> dict:
    pbp = inp["pbp"][inp["pbp"]["season"] >= min(s for s, _ in inp["group_of"])]
    units = rush_units(pbp, inp["group_of"])
    T = rush_season_table(units, pbp, inp["adv_rush"], inp["pfr_to_gsis"])
    rt = receiver_season_table(targets, pbp, "rb")[["season", "id", "tgt", "epa_total", "epaTgt", "catchRate"]].rename(columns={"tgt": "r_tgt", "epa_total": "r_epa", "epaTgt": "r_epaTgt", "catchRate": "r_catch"})
    T = T.merge(rt, on=["season", "id"], how="left").fillna({"r_tgt": 0, "r_epa": 0})
    T["site"] = site_grade(T, "rb", [k for k in ("epaRush", "success", "explosive", "yco", "broken") if k in T])
    out: dict = {"unit": "carries"}
    out.update(stat_block(units, RB_STATS, "car", QUALIFY["rb"], "epaRush"))
    cands = {"EPA per carry": "epaRush", "success rate": "success", "explosive rate (10+ yards)": "explosive", "yards per carry": "ypc", "stuffed rate": "stuffRate", "yards after contact": "yco",
             "broken tackles": "broken", "yards before contact (blocking)": "ybc", "site grade today": "site"}
    fits = {"refit: success, explosive, yards after contact, broken": ["success", "explosive", "yco", "broken"]}
    out["nextSeason"] = group_ability_study(T, {k: v for k, v in cands.items() if v in T}, fits, {"epaRush": "epaRush", "success": "success", "ypc": "ypc"}, first_test, lower_is_better={"stuffRate"})
    back = T[T["r_tgt"] >= 30]
    out["receiving"] = {"backsWith30Targets": int(len(back)), "yoyEpaPerTarget": yoy(back[["season", "id", "r_epaTgt"]].dropna(), ["r_epaTgt"])["r_epaTgt"] if len(back) > 20 else None,
                        "shareOfTotalEpa": r4(float((back["r_epa"] / (back["epa_total"] + back["r_epa"]).abs().clip(lower=1)).median())) if len(back) else None}
    out["reference"] = scale_reference(T, "rb", [k for k in ("epaRush", "success", "explosive", "yco", "broken") if k + ":den" in T])
    out["signal"] = signal_label(out["stats"]["epaRush"]["yoy"]["r"] if out["stats"].get("epaRush", {}).get("yoy") else None)
    return out


def defense_section(inp: dict, group: str, first_test: int) -> dict:
    du = inp["def_units"]
    u = du[du["group"] == group]
    out: dict = {"unit": "snaps"}
    head = "pressRate" if group in ("edge", "idl") else "yardsTgt"
    out.update(stat_block(u, DEF_STATS[group], "defense_snaps", QUALIFY[group], head, min_den=DEF_MIN_STAT.get(group, 1.0)))
    T = defense_season_table(du, group)
    lower = {"missedPct"}
    if group in ("edge", "idl"):
        T["site"] = site_grade(T, group, ["pressRate", "missedPct"])
        cands = {"pressures per snap": "pressRate", "sacks per snap": "sackRate", "hurries and hits per snap": "hurryHit", "tackles per snap": "tackleRate", "missed-tackle %": "missedPct", "site grade (pressure + missed tackles)": "site"}
        fits = {"refit: pressures, hurries and hits, sacks": ["pressRate", "hurryHit", "sackRate"]}
        targets = {"pressRate": "pressRate", "sackRate": "sackRate"}
    elif group == "lb":
        T["site"] = site_grade(T, group, ["missedPct", "tackleRate", "yardsTgt"])
        cands = {"yards per target": "yardsTgt", "completion % allowed": "compPct", "targets per snap": "tgtRate", "missed-tackle %": "missedPct", "tackles per snap": "tackleRate", "site grade (PFR stats)": "site"}
        fits = {}
        targets = {"yardsTgt": "yardsTgt", "tackleRate": "tackleRate"}
        lower |= {"yardsTgt", "compPct", "tgtRate"}
    else:
        T["site"] = site_grade(T, group, ["yardsTgt", "compPct", "missedPct"])
        cands = {"yards per target": "yardsTgt", "completion % allowed": "compPct", "targets per snap": "tgtRate", "missed-tackle %": "missedPct", "interceptions per target": "intRate", "site grade (PFR stats)": "site"}
        fits = {}
        targets = {"yardsTgt": "yardsTgt", "compPct": "compPct"}
        lower |= {"yardsTgt", "compPct"}
    out["nextSeason"] = group_ability_study(T, cands, fits, targets, first_test, lower_is_better=lower)
    out["reference"] = scale_reference(T, group, [k for k in DEF_STATS[group] if k in ("pressRate", "missedPct", "yardsTgt", "compPct", "tackleRate")])
    out["signal"] = signal_label(out["stats"][head]["yoy"]["r"] if out["stats"].get(head, {}).get("yoy") else None)
    return out


def run(folder: str, seasons: list[int], first_test: int = 2021) -> dict:
    inp = load_inputs(folder, seasons)
    pbp_recv = inp["pbp"][inp["pbp"]["season"].isin(seasons)]
    targets = rec_targets(pbp_recv, inp["group_of"])
    groups = {"qb": qb_section(inp, 2020)}
    for g in ("wr", "te"):
        groups[g] = receiver_section(inp, targets, g, first_test)
    groups["rb"] = rb_section(inp, targets, first_test)
    for g in ("edge", "idl", "lb", "cb", "saf"):
        groups[g] = defense_section(inp, g, first_test)
    return {"method": METHOD_VERSION, "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "seasons": seasons, "qbSeasons": inp["qb_seasons"],
            "earlyGames": EARLY_GAMES, "groups": groups, "limits": limits()}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="folder with the source files (the layout build_players.py --input reads)")
    ap.add_argument("--seasons", type=int, nargs="+", default=list(range(2018, 2026)))
    ap.add_argument("--out", default="data/lab/validation.json")
    ap.add_argument("--scale-audit", type=int, metavar="SEASON", help="also replay the 1-99 Overall week by week through this season (slow)")
    ap.add_argument("--history", default=None, help="player-history.json for the scale audit")
    args = ap.parse_args(argv)
    rep = run(args.input, sorted(args.seasons))
    if args.scale_audit:
        rep["scaleAudit"] = {"season": args.scale_audit, "weeks": scale_audit(args.input, args.scale_audit, [3, 5, 9, 13, 18], args.history)}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, separators=(",", ":"), ensure_ascii=False, default=float) + "\n")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
