#!/usr/bin/env python3
"""Fit the team-strength model behind the Playoff Machine, the Rooting Guide and every other playoff-odds number on the site.

Source: the nflverse "nfldata" games file (CC BY 4.0): every regular-season game since 2002 with its score, its neutral-site
flag and the closing point spread.
Run:    python scripts/ratings/fit.py --out data/lab/ratings-model.json --fixture tests/fixtures/ratings-parity.json
        python scripts/ratings/fit.py --tune        (re-runs the search for the Elo settings; slow, prints only)

What it builds, in plain terms:

  1. Elo ratings, played forward through every season, with a share of last year's rating carried into the next one.
  2. "Market ratings": team strengths backed out of the point spreads (a ridge regression, recent weeks counting more).
  3. A calibrated win chance for every game still to play:
       - a game that has a posted spread is priced from the spread alone (the market is the best single forecast there is);
       - any other game is priced from the two ratings, with the weights fitted on past seasons.
  4. How uncertain team strength is, read off how much more teams' win totals vary than independent games would give.
  5. A set of re-fits on resampled seasons, so the site can show how much the odds depend on this particular fit.

Every number is fitted on seasons that come before the one it is judged on, or left out of its own season (leave-one-season-out),
and the 2020-2025 seasons were held back while the Elo settings were chosen. The numbers behind the choices go in the output
file's "holdout" and "calibration" sections and in the methodology note, so the claim "this is better calibrated than the old
Elo" can be checked rather than believed. Needs only numpy and pandas.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}

# ------------------------------------------------------------------------------------------------ settings
# Chosen on 2006-2019 only (python scripts/ratings/fit.py --tune reproduces the search); 2020-2025 were then scored untouched.
ELO = {"k": 27.5, "hfa": 32.0, "carry": 0.35}
# Market ratings: ridge strength, share of last season carried, and the half-life in weeks of a game's weight.
MARKET = {"lambda": 3.0, "carry": 0.3, "halfLife": 3.0}
TRAIN_SEASONS = list(range(2006, 2020))
HOLDOUT_SEASONS = list(range(2020, 2026))
FIT_FROM = 2008  # the first season whose Elo and market ratings have had two seasons to settle
CUTS = list(range(2, 16))  # "weeks played so far" at which a forecast of the rest of the season is scored
BOOTSTRAPS = 40
SEED = 20261003


def load(path: str | None) -> pd.DataFrame:
    if path:
        raw = pd.read_csv(path)
    else:
        with urllib.request.urlopen(GAMES_URL, timeout=60) as r:  # noqa: S310 (fixed https URL)
            raw = pd.read_csv(io.BytesIO(r.read()))
    g = raw[(raw["game_type"] == "REG") & (raw["season"] >= 2002)].copy()
    for c in ("home_team", "away_team"):
        g[c] = g[c].replace(SITE_ABBR)
    g["neutral"] = g["location"] == "Neutral"
    return g.sort_values(["season", "week", "gameday", "game_id"]).reset_index(drop=True)


class Data:
    def __init__(self, g: pd.DataFrame):
        done = g.groupby("season")["home_score"].apply(lambda s: s.notna().all())
        self.seasons = [int(s) for s in done[done].index]  # seasons that are over
        g = g[g["season"].isin(self.seasons)].reset_index(drop=True)
        self.g = g
        self.teams = sorted(set(g["home_team"]) | set(g["away_team"]))
        self.nt = len(self.teams)
        idx = {t: i for i, t in enumerate(self.teams)}
        self.h = g["home_team"].map(idx).to_numpy()
        self.a = g["away_team"].map(idx).to_numpy()
        self.hs = g["home_score"].to_numpy(float)
        self.as_ = g["away_score"].to_numpy(float)
        self.neu = g["neutral"].to_numpy(bool)
        self.sp = g["spread_line"].to_numpy(float)
        self.wk = g["week"].to_numpy(int)
        self.se = g["season"].to_numpy(int)
        self.y = np.where(self.hs > self.as_, 1.0, np.where(self.hs == self.as_, 0.5, 0.0))


# ------------------------------------------------------------------------------------------------ Elo
def expected(d):
    return 1.0 / (1.0 + 10.0 ** (-np.asarray(d) / 400.0))


def elo_chain(D: Data, k: float, hfa: float, carry: float):
    """Ratings after every week (snaps[(season, week)]) and at the start of every season (start[season])."""
    r = np.full(D.nt, 1500.0)
    snaps, start = {}, {}
    for i, y in enumerate(D.seasons):
        if i:
            r = 1500.0 + carry * (r - 1500.0)
        start[y] = r.copy()
        for w in sorted(set(D.wk[D.se == y])):
            upd = np.zeros(D.nt)
            for j in np.where((D.se == y) & (D.wk == w))[0]:
                h, a = D.h[j], D.a[j]
                edge = r[h] + (0.0 if D.neu[j] else hfa) - r[a]
                p = float(expected(edge))
                m = D.hs[j] - D.as_[j]
                act = 1.0 if m > 0 else 0.0 if m < 0 else 0.5
                wedge = edge if m >= 0 else -edge
                mult = ((abs(m) + 3.0) ** 0.8) / (7.5 + 0.006 * wedge)
                sh = k * mult * (act - p)
                upd[h] += sh
                upd[a] -= sh
            r = r + upd
            snaps[(y, w)] = r.copy()
    end = r.copy()
    return snaps, start, end


# ------------------------------------------------------------------------------------------------ market ratings
def ridge(D: Data, rows, prior, lam):
    """Ratings (in points) so that rating(home) - rating(away) + hfa*(not neutral) ~ spread, pulled toward `prior`.
    rows: (home, away, neutral, spread, weight). The same normal equations are solved in lib/ratings/market.ts."""
    n = D.nt
    m = np.zeros((n + 1, n + 1))
    v = np.zeros(n + 1)
    for h, a, neu, y, w in rows:
        x = np.zeros(n + 1)
        x[h], x[a] = 1.0, -1.0
        x[n] = 0.0 if neu else 1.0
        m += w * np.outer(x, x)
        v += w * y * x
    for t in range(n):
        m[t, t] += lam
        v[t] += lam * prior[t]
    m[n, n] += 1e-9
    sol = np.linalg.solve(m, v)
    return sol[:n], float(sol[n])


def market_rows(D: Data, season: int, upto: int, half):
    out = []
    for j in np.where((D.se == season) & (D.wk <= upto))[0]:
        if np.isnan(D.sp[j]):
            continue
        w = 1.0 if half is None else 0.5 ** ((upto - 1 - D.wk[j]) / half)
        out.append((D.h[j], D.a[j], bool(D.neu[j]), D.sp[j], w))
    return out


def market_series(D: Data, lam, carry, half, seasons=None):
    """series[(season, cut)] = ratings using lines through week cut+1; start[season]; and the end-of-season fit that seeds the next."""
    series, start = {}, {}
    prev = np.zeros(D.nt)
    for y in D.seasons:
        prior = carry * prev
        start[y] = prior.copy()
        if seasons is None or y in seasons:
            for cut in CUTS:
                rows = market_rows(D, y, cut + 1, half)
                if rows:
                    series[(y, cut)], _ = ridge(D, rows, prior, lam)
        rows = market_rows(D, y, 99, None)
        if rows:
            prev, _ = ridge(D, rows, prior, lam)
    return series, start, prev


# ------------------------------------------------------------------------------------------------ logistic
def logit_fit(X, y, l2=1e-6):
    b = np.zeros(X.shape[1])
    for _ in range(50):
        p = 1 / (1 + np.exp(-(X @ b)))
        w = p * (1 - p) + 1e-9
        g = X.T @ (y - p) - l2 * b
        hess = (X * w[:, None]).T @ X + l2 * np.eye(len(b))
        step = np.linalg.solve(hess, g)
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b


def sig(z):
    return 1 / (1 + np.exp(-z))


def loss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def brier(p, y):
    return (p - y) ** 2


# ------------------------------------------------------------------------------------------------ the forecast table
def forecast_rows(D: Data, snaps, mk, seasons, hfa_elo):
    """One row for every (season, cut, later game): features, outcome and whether the game is 'next week' (has a posted line)."""
    rows = []
    for y in seasons:
        for cut in CUTS:
            if (y, cut) not in snaps or (y, cut) not in mk:
                continue
            r, m = snaps[(y, cut)], mk[(y, cut)]
            for j in np.where((D.se == y) & (D.wk > cut))[0]:
                h, a = D.h[j], D.a[j]
                rows.append(
                    (
                        y,
                        cut,
                        D.wk[j],
                        h,
                        a,
                        0.0 if D.neu[j] else 1.0,
                        (r[h] - r[a]) / 100.0,
                        (m[h] - m[a]) / 10.0,
                        D.sp[j] / 10.0,
                        D.y[j],
                        float(expected(r[h] - r[a] + (0 if D.neu[j] else hfa_elo))),
                    )
                )
    R = np.array(rows, float)
    cols = ["season", "cut", "week", "h", "a", "home", "elo", "mkt", "line", "y", "p_elo"]
    return {c: R[:, i] for i, c in enumerate(cols)}


def fit_coefs(F, mask):
    far = mask & (F["week"] > F["cut"] + 1)
    nxt = mask & (F["week"] == F["cut"] + 1) & ~np.isnan(F["line"])
    bf = logit_fit(np.column_stack([F["home"][far], F["elo"][far], F["mkt"][far]]), F["y"][far])
    bl = logit_fit(F["line"][nxt][:, None], F["y"][nxt])
    return bf, float(bl[0])


def predict_all(F, bf, bl):
    far_p = sig(bf[0] * F["home"] + bf[1] * F["elo"] + bf[2] * F["mkt"])
    line_p = sig(bl * F["line"])
    nxt = (F["week"] == F["cut"] + 1) & ~np.isnan(F["line"])
    return np.where(nxt, line_p, far_p), nxt


def loso_predictions(F, seasons):
    p = np.zeros(len(F["y"]))
    for s in seasons:
        tr = (F["season"] != s) & np.isin(F["season"], seasons)
        te = F["season"] == s
        bf, bl = fit_coefs(F, tr)
        pp, _ = predict_all(F, bf, bl)
        p[te] = pp[te]
    return p


# ------------------------------------------------------------------------------------------------ team-strength uncertainty
def sigma_inputs(F, p, seasons):
    """For every (season, cut, team): how far its remaining win total fell from the forecast, squared, and the variance the
    forecast alone allows. If one shock shifts every one of a team's games by the same amount on the logit scale, the excess
    variance is sigma^2 * (v0^2 + sum(w^2)), where w = p(1-p) per game. The second term is the opponents' own shocks."""
    keep = np.isin(F["season"], seasons)
    out = []
    for s in seasons:
        for cut in CUTS:
            m = keep & (F["season"] == s) & (F["cut"] == cut)
            if not m.any():
                continue
            for t in range(int(F["h"].max()) + 1):
                mh, ma = m & (F["h"] == t), m & (F["a"] == t)
                if not (mh.any() or ma.any()):
                    continue
                pw = np.concatenate([p[mh], 1 - p[ma]])
                wins = np.concatenate([F["y"][mh], 1 - F["y"][ma]])
                w = pw * (1 - pw)
                out.append((s, cut, (wins.sum() - pw.sum()) ** 2 - w.sum(), w.sum() ** 2 + (w**2).sum()))
    return np.array(out, float)


def sigma_from(S, seasons):
    m = np.isin(S[:, 0], seasons)
    return math.sqrt(max(S[m, 2].sum(), 0.0) / S[m, 3].sum())


# ------------------------------------------------------------------------------------------------ tuning (optional)
def tune(D: Data):
    def score(k, hfa, c, seasons):
        snaps, _, _ = elo_chain(D, k, hfa, c)
        tr = [s for s in seasons]
        d, y = [], []
        for s in tr:
            for cut in (4, 6, 8, 10, 12, 14):
                if (s, cut) not in snaps:
                    continue
                r = snaps[(s, cut)]
                j = np.where((D.se == s) & (D.wk > cut))[0]
                d.append(r[D.h[j]] - r[D.a[j]] + np.where(D.neu[j], 0, hfa))
                y.append(D.y[j])
        d, y = np.concatenate(d), np.concatenate(y)
        best = min((float(loss(expected(st * d), y).mean()), st) for st in np.linspace(0.6, 3.0, 49))
        return best

    p = dict(k=30.0, hfa=40.0, c=0.5)
    steps = dict(k=5.0, hfa=8.0, c=0.1)
    cur = score(p["k"], p["hfa"], p["c"], TRAIN_SEASONS)
    for _ in range(6):
        improved = False
        for key in list(p):
            for sgn in (1, -1):
                q = dict(p)
                q[key] = p[key] + sgn * steps[key]
                if (key == "c" and not 0 <= q[key] <= 1) or (key == "k" and q[key] <= 2):
                    continue
                v = score(q["k"], q["hfa"], q["c"], TRAIN_SEASONS)
                if v[0] < cur[0] - 1e-6:
                    p, cur, improved = q, v, True
        if not improved:
            steps = {a: b / 2 for a, b in steps.items()}
    test = score(p["k"], p["hfa"], p["c"], HOLDOUT_SEASONS)
    print(f"tuned on {TRAIN_SEASONS[0]}-{TRAIN_SEASONS[-1]}: {p}  train loss {cur[0]:.4f}  stretch {cur[1]:.2f}")
    print(f"held-out {HOLDOUT_SEASONS[0]}-{HOLDOUT_SEASONS[-1]} loss with those settings (stretch refit there): {test[0]:.4f}")
    print(f"settings used by the site: {ELO}")


# ------------------------------------------------------------------------------------------------ main
def calibration_table(p, y, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    rows = []
    for k in range(bins):
        m = idx == k
        if m.sum() >= 30:
            rows.append({"lo": round(float(edges[k]), 2), "hi": round(float(edges[k + 1]), 2), "n": int(m.sum()), "predicted": round(float(p[m].mean()), 4), "observed": round(float(y[m].mean()), 4)})
    return rows


def metrics(p, y):
    return {"n": int(len(y)), "logLoss": round(float(loss(p, y).mean()), 4), "brier": round(float(brier(p, y).mean()), 4), "accuracy": round(float(((p > 0.5) == (y > 0.5))[y != 0.5].mean()), 4)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", help="a local copy of the nflverse games file (default: download)")
    ap.add_argument("--out", default="data/lab/ratings-model.json")
    ap.add_argument("--fixture", default="tests/fixtures/ratings-parity.json")
    ap.add_argument("--tune", action="store_true")
    args = ap.parse_args()

    D = Data(load(args.games))
    if args.tune:
        tune(D)
        return 0
    last = D.seasons[-1]
    fit_seasons = [s for s in D.seasons if s >= FIT_FROM]
    print(f"games through {last}; fitting {fit_seasons[0]}-{fit_seasons[-1]}")

    snaps, e_start, e_end = elo_chain(D, ELO["k"], ELO["hfa"], ELO["carry"])
    mk, m_start, m_end = market_series(D, MARKET["lambda"], MARKET["carry"], MARKET["halfLife"])
    F = forecast_rows(D, snaps, mk, fit_seasons, ELO["hfa"])
    allm = np.ones(len(F["y"]), bool)

    # ---- the fit used by the site: every season from FIT_FROM
    bf, bl = fit_coefs(F, allm)
    print("far-game weights (home, elo/100, market/10):", np.round(bf, 4), " line slope per 10 pts:", round(bl, 4))

    # ---- honest scores: leave one season out
    p_loso = loso_predictions(F, fit_seasons)
    nxt = (F["week"] == F["cut"] + 1) & ~np.isnan(F["line"])
    far = ~nxt
    y = F["y"]

    # ---- the hold-out: weights fitted on 2008-2019, scored on 2020-2025, against the model the site used before
    trm = np.isin(F["season"], [s for s in fit_seasons if s < HOLDOUT_SEASONS[0]])
    tem = np.isin(F["season"], HOLDOUT_SEASONS)
    tbf, tbl = fit_coefs(F, trm)
    p_hold, _ = predict_all(F, tbf, tbl)
    # the old model: flat 1500 start every season, K=20, home field 48, no calibration (lib/math/elo.ts as shipped)
    old_snaps, _, _ = elo_chain(D, 20.0, 48.0, 0.0)
    p_old = np.full(len(y), np.nan)
    old = {}  # the old model restarted every season at 1500 and played only that season
    for s in D.seasons:
        r_old = np.full(D.nt, 1500.0)
        for w in sorted(set(D.wk[D.se == s])):
            upd = np.zeros(D.nt)
            for j in np.where((D.se == s) & (D.wk == w))[0]:
                h, a = D.h[j], D.a[j]
                edge = r_old[h] + (0.0 if D.neu[j] else 48.0) - r_old[a]
                p = float(expected(edge))
                m = D.hs[j] - D.as_[j]
                act = 1.0 if m > 0 else 0.0 if m < 0 else 0.5
                wedge = edge if m >= 0 else -edge
                sh = 20.0 * (((abs(m) + 3.0) ** 0.8) / (7.5 + 0.006 * wedge)) * (act - p)
                upd[h] += sh
                upd[a] -= sh
            r_old = r_old + upd
            old[(s, w)] = r_old.copy()
    for i in range(len(y)):
        s, cut = int(F["season"][i]), int(F["cut"][i])
        r = old[(s, cut)]
        h, a = int(F["h"][i]), int(F["a"][i])
        p_old[i] = float(expected(r[h] - r[a] + (48.0 if F["home"][i] else 0.0)))
    hold = {
        "trainedOn": f"{fit_seasons[0]}-{HOLDOUT_SEASONS[0] - 1}",
        "scoredOn": f"{HOLDOUT_SEASONS[0]}-{HOLDOUT_SEASONS[-1]}",
        "coinFlip": {k: v for k, v in metrics(np.full(int(tem.sum()), 0.5), y[tem]).items() if k != "accuracy"},
        "previousModel": {"allGames": metrics(p_old[tem], y[tem]), "nextWeek": metrics(p_old[tem & nxt], y[tem & nxt]), "later": metrics(p_old[tem & far], y[tem & far])},
        "newModel": {"allGames": metrics(p_hold[tem], y[tem]), "nextWeek": metrics(p_hold[tem & nxt], y[tem & nxt]), "later": metrics(p_hold[tem & far], y[tem & far])},
        "weights": {"far": [round(float(v), 4) for v in tbf], "line": round(tbl, 4)},
    }
    print(json.dumps(hold, indent=1))

    # ---- calibration of the leave-one-season-out forecasts (all seasons)
    calib = {"later": calibration_table(p_loso[far], y[far]), "nextWeek": calibration_table(p_loso[nxt], y[nxt])}
    rc = logit_fit(np.column_stack([np.ones(far.sum()), np.log(p_loso[far] / (1 - p_loso[far]))]), y[far])
    loso_summary = {"later": metrics(p_loso[far], y[far]), "nextWeek": metrics(p_loso[nxt], y[nxt]), "recalibration": {"intercept": round(float(rc[0]), 3), "slope": round(float(rc[1]), 3)}}
    print("LOSO", json.dumps(loso_summary))

    # ---- team-strength uncertainty
    S = sigma_inputs(F, p_loso, fit_seasons)
    sigma = sigma_from(S, fit_seasons)
    rng = np.random.default_rng(SEED)
    draws, sigmas = [], []
    for _ in range(BOOTSTRAPS):
        pick = rng.choice(fit_seasons, size=len(fit_seasons), replace=True)
        # resampled seasons enter once per time drawn: build a weighted-by-repetition row set
        sel = np.concatenate([np.where(F["season"] == s)[0] for s in pick])
        Fb = {k: v[sel] for k, v in F.items()}
        bfb, blb = fit_coefs(Fb, np.ones(len(sel), bool))
        reps = np.concatenate([S[S[:, 0] == s] for s in pick])
        sg = math.sqrt(max(reps[:, 2].sum(), 0.0) / reps[:, 3].sum())
        draws.append({"far": [round(float(v), 4) for v in bfb], "line": round(blb, 4), "sigma": round(sg, 4)})
        sigmas.append(sg)
    lo, hi = np.percentile(sigmas, [10, 90])
    print(f"team-strength sigma (logit): {sigma:.3f}  (bootstrap 10-90%: {lo:.3f}-{hi:.3f})")
    by_cut = {int(c): round(sigma_from(S[S[:, 1] == c], fit_seasons), 3) for c in CUTS}

    # ---- priors for the season after the last one in the file
    nxt_season = last + 1
    elo_prior = 1500.0 + ELO["carry"] * (e_end - 1500.0)
    mk_prior = MARKET["carry"] * m_end

    model = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "nflverse nfldata games file, CC BY 4.0 (scores, neutral-site flags and closing spreads, 2002-%d). Fitted by scripts/ratings/fit.py." % last,
        "fitSeasons": [fit_seasons[0], fit_seasons[-1]],
        "elo": ELO,
        "market": MARKET,
        "far": {"home": round(float(bf[0]), 4), "elo": round(float(bf[1]), 4), "market": round(float(bf[2]), 4)},
        "line": {"slope": round(bl, 4)},
        "sigma": round(sigma, 4),
        "sigmaByWeeksPlayed": by_cut,
        "draws": draws,
        "priors": {"season": nxt_season, "teams": D.teams, "elo": [round(float(v), 3) for v in elo_prior], "market": [round(float(v), 3) for v in mk_prior]},
        "holdout": hold,
        "leaveOneSeasonOut": loso_summary,
        "calibration": calib,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(model, indent=1) + "\n")
    print("wrote", out)

    # ---- parity fixture for the TypeScript implementation: one real season, frozen at the start of week 9
    fy, fcut = last, 8
    gi = np.where(D.se == fy)[0]
    fixture_games = []
    for j in gi:
        played = D.wk[j] <= fcut
        row = {"id": str(D.g["game_id"].iloc[j]), "week": int(D.wk[j]), "home": D.teams[D.h[j]], "away": D.teams[D.a[j]], "neutral": bool(D.neu[j])}
        if played:
            row["homeScore"], row["awayScore"] = int(D.hs[j]), int(D.as_[j])
        if D.wk[j] <= fcut + 1 and not np.isnan(D.sp[j]):
            row["spread"] = float(D.sp[j])
        fixture_games.append(row)
    r8, m8 = snaps[(fy, fcut)], mk[(fy, fcut)]
    expect = {}
    for j in gi:
        if D.wk[j] <= fcut:
            continue
        h, a = D.h[j], D.a[j]
        if D.wk[j] == fcut + 1 and not np.isnan(D.sp[j]):
            pr = float(sig(bl * D.sp[j] / 10.0))
        else:
            pr = float(sig(bf[0] * (0.0 if D.neu[j] else 1.0) + bf[1] * (r8[h] - r8[a]) / 100.0 + bf[2] * (m8[h] - m8[a]) / 10.0))
        expect[str(D.g["game_id"].iloc[j])] = round(pr, 6)
    fixture = {
        "season": fy,
        "playedThrough": fcut,
        "teams": D.teams,
        "startElo": [round(float(v), 6) for v in e_start[fy]],
        "startMarket": [round(float(v), 6) for v in m_start[fy]],
        "games": fixture_games,
        "elo": [round(float(v), 6) for v in r8],
        "market": [round(float(v), 6) for v in m8],
        "pHome": expect,
        "model": {"far": [float(v) for v in bf], "line": bl, "sigma": sigma, "elo": ELO, "market": MARKET},
    }
    fx = Path(args.fixture)
    fx.parent.mkdir(parents=True, exist_ok=True)
    fx.write_text(json.dumps(fixture) + "\n")
    print("wrote", fx)
    return 0


if __name__ == "__main__":
    sys.exit(main())
