"""Calibration of the Player Lab's ranges and pairwise chances, on one set of observations, with uncertainty that respects dependence.

The question each function answers is stated in its docstring; the exact probability the pages may show is `PAIR_TARGET`.

Rows come from `validate_methodology.backtest_rows`: one per player-season, made after the first `k` games and scored on the rest
of that season. Three things matter for honest numbers:

* One outcome definition. A range check and a pairwise check are always scored against the same `target` (the player's rate over
  the games after the cutoff, relative to the league's rate over those games), so changing a width never changes what is measured.
* Dependence. A player appears in several seasons and in many pairs; 3,400 pairs are not 3,400 independent observations. Every
  interval below is a bootstrap that resamples PLAYERS (all of a player's seasons and all pairs he is in move together).
* Out of sample. A width or a bucket's reliability is learned from seasons before the one it is scored on.
"""

from __future__ import annotations

from math import erf, sqrt

import numpy as np
import pandas as pd

# What a published pairwise chance means. It is the chance that A's EPA per dropback over the games AFTER the cutoff beats B's over
# the same games, counting both players' uncertain levels and the play-by-play luck in those games. It is not a chance about
# who is the better quarterback.
PAIR_TARGET = ("P(A's EPA per dropback in the games after the cutoff > B's in the same games), relative to the league in those games, "
               "counting the uncertainty in both estimated levels and the luck in both outcomes")

# A chance is published only for cutoffs that were replayed, and only where, learned from earlier seasons, the claimed chance
# was within this of what happened, with the bootstrap interval of the realized rate not excluding the claim.
PUBLISH_TOLERANCE = 0.06
MIN_PAIRS = 100  # a bucket with fewer scored pairs is never published, whatever it happened to realize
CUTOFF_GAMES = (4, 5, 8, 10)
BOOT = 400

phi = np.vectorize(lambda z: 0.5 * (1.0 + erf(z / sqrt(2.0))))


def coverage(R: pd.DataFrame, scale: float = 1.0, z: float = 1.2816) -> float:
    """Share of outcomes inside `estimate +/- z * sqrt((scale * pe)^2 + outcome noise^2)`. A larger scale around the same centres
    can only widen the range, so this never falls as `scale` rises."""
    half = z * np.sqrt((R["pe"] * scale) ** 2 + R["se_target"] ** 2)
    return float(((R["target"] - R["history"]).abs() < half).mean())


def pairs(R: pd.DataFrame, scale: float = 1.0) -> pd.DataFrame:
    """Every pair of players in a season, read in the direction the model leans: the claimed chance (>= .5) that the one it rates
    higher does better over the rest of the season, and whether he did."""
    out = []
    for season, g in R.groupby("season"):
        g = g.reset_index(drop=True)
        e, p, t, s = g["history"].to_numpy(), g["pe"].to_numpy() * scale, g["target"].to_numpy(), g["se_target"].to_numpy()
        i, j = np.triu_indices(len(g), k=1)
        d = e[i] - e[j]
        z = np.abs(d) / np.sqrt(p[i] ** 2 + p[j] ** 2 + s[i] ** 2 + s[j] ** 2)
        lead = np.where(d >= 0, t[i] - t[j], t[j] - t[i])
        hi = np.where(d >= 0, i, j)
        lo = np.where(d >= 0, j, i)
        out.append(pd.DataFrame({"season": season, "claimed": phi(z), "hit": (lead > 0).astype(float),
                                 "a": g["id"].to_numpy()[hi], "b": g["id"].to_numpy()[lo]}))
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame(columns=["season", "claimed", "hit", "a", "b"])


# The top bucket is everything from 80% up: past 90% there are too few pairs to check on their own.
BINS = (0.5, 0.6, 0.7, 0.8, 1.0001)


def bucket_table(P: pd.DataFrame) -> list[dict]:
    rows = []
    for lo, hi in zip(BINS[:-1], BINS[1:]):
        m = (P["claimed"] >= lo) & (P["claimed"] < hi)
        if m.sum() >= 20:
            rows.append({"bucket": f"{lo:.1f}-{min(hi, 1.0):.1f}", "pairs": int(m.sum()), "claimed": float(P.loc[m, "claimed"].mean()), "realized": float(P.loc[m, "hit"].mean())})
    return rows


def _resample(ids: np.ndarray, rng: np.random.Generator) -> dict:
    """Bootstrap weights per player: how many times each player is drawn."""
    draw = rng.choice(ids, size=len(ids), replace=True)
    u, c = np.unique(draw, return_counts=True)
    return dict(zip(u, c))


def boot_pairs(P: pd.DataFrame, B: int = BOOT, seed: int = 0) -> dict:
    """Realized rate and Brier score by bucket with 90% intervals from resampling players. A pair counts with the product of its two
    players' draw counts (a player drawn twice makes his pairs count twice; a player not drawn drops out)."""
    rng = np.random.default_rng(seed)
    ids = np.unique(np.r_[P["a"].to_numpy(), P["b"].to_numpy()])
    a, b = P["a"].to_numpy(), P["b"].to_numpy()
    claimed, hit = P["claimed"].to_numpy(), P["hit"].to_numpy()
    idx = {k: n for n, k in enumerate(ids)}
    ai, bi = np.array([idx[k] for k in a]), np.array([idx[k] for k in b])
    edges = list(zip(BINS[:-1], BINS[1:]))
    sums = {e: [] for e in edges}
    brier, base = [], []
    for _ in range(B):
        w = np.bincount(rng.integers(0, len(ids), len(ids)), minlength=len(ids)).astype(float)
        wt = w[ai] * w[bi]
        for lo, hi in edges:
            m = (claimed >= lo) & (claimed < hi)
            tot = wt[m].sum()
            sums[(lo, hi)].append(float((wt[m] * hit[m]).sum() / tot) if tot > 0 else np.nan)
        if wt.sum() > 0:
            brier.append(float((wt * (claimed - hit) ** 2).sum() / wt.sum()))
            base.append(float((wt * (0.5 - hit) ** 2).sum() / wt.sum()))
    out = {"buckets": []}
    for row in bucket_table(P):
        lo = float(row["bucket"].split("-")[0])
        e = next(x for x in edges if abs(x[0] - lo) < 1e-9)
        v = np.array(sums[e])
        v = v[~np.isnan(v)]
        row["realizedLo"], row["realizedHi"] = (float(np.quantile(v, 0.05)), float(np.quantile(v, 0.95))) if len(v) else (None, None)
        out["buckets"].append(row)
    out["brier"] = {"model": float(P.eval("(claimed-hit)**2").mean()), "coinFlip": float(P.eval("(0.5-hit)**2").mean()),
                    "modelCi": [float(np.quantile(brier, 0.05)), float(np.quantile(brier, 0.95))], "coinFlipCi": [float(np.quantile(base, 0.05)), float(np.quantile(base, 0.95))]}
    out["pairs"] = int(len(P))
    out["players"] = int(len(ids))
    # How many pairs are really worth: pairs share players, so the effective count is far below the raw count.
    out["effectiveObservations"] = int(len(R_ids(P)))
    return out


def R_ids(P: pd.DataFrame) -> np.ndarray:
    """The player-seasons behind the pairs: the number of independent-ish units the data really holds."""
    return np.unique(np.r_[(P["season"].astype(str) + "|" + P["a"].astype(str)).to_numpy(), (P["season"].astype(str) + "|" + P["b"].astype(str)).to_numpy()])


def boot_coverage(R: pd.DataFrame, scales: list[float], B: int = BOOT, seed: int = 0) -> list[dict]:
    """Coverage at each width with 90% intervals from resampling players. Same rows at every width."""
    rng = np.random.default_rng(seed)
    ids = R["id"].to_numpy()
    uniq = np.unique(ids)
    rows = []
    # Per-row inclusion at each width and level, then weights by draws.
    flags = {(s, z): ((R["target"] - R["history"]).abs() < z * np.sqrt((R["pe"] * s) ** 2 + R["se_target"] ** 2)).to_numpy().astype(float)
             for s in scales for z in (1.2816, 1.96)}
    pos = np.searchsorted(uniq, ids)
    draws = [np.bincount(rng.integers(0, len(uniq), len(uniq)), minlength=len(uniq)).astype(float)[pos] for _ in range(B)]
    for s in scales:
        row = {"scale": s}
        for z, name in ((1.2816, "within80"), (1.96, "within95")):
            f = flags[(s, z)]
            bs = [float((w * f).sum() / w.sum()) for w in draws if w.sum() > 0]
            row[name] = float(f.mean())
            row[name + "Ci"] = [float(np.quantile(bs, 0.05)), float(np.quantile(bs, 0.95))]
        rows.append(row)
    return rows


def scale_for(R: pd.DataFrame, level: float = 0.80, z: float = 1.2816) -> float:
    """The smallest width multiplier at which `level` of outcomes fall inside the range (bisection; coverage is monotone in the scale)."""
    lo, hi = 0.3, 4.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if coverage(R, mid, z) < level:
            lo = mid
        else:
            hi = mid
    return float((lo + hi) / 2)


def out_of_sample(R: pd.DataFrame, min_train_seasons: int = 2) -> dict:
    """Each season is scored with a width learned only from the seasons before it: the range check, and the pairwise chances with
    the widths of both players' ranges scaled the same way. Seasons without enough earlier seasons are skipped."""
    seasons = sorted(R["season"].unique())
    cover80, cover95, parts, chosen = [], [], [], {}
    for k, s in enumerate(seasons):
        if k < min_train_seasons:
            continue
        train, test = R[R["season"] < s], R[R["season"] == s]
        sc = scale_for(train)
        chosen[int(s)] = round(sc, 3)
        cover80.append(((test["target"] - test["history"]).abs() < 1.2816 * np.sqrt((test["pe"] * sc) ** 2 + test["se_target"] ** 2)).to_numpy())
        cover95.append(((test["target"] - test["history"]).abs() < 1.96 * np.sqrt((test["pe"] * sc) ** 2 + test["se_target"] ** 2)).to_numpy())
        parts.append(pairs(test, sc))
    if not parts:
        return {"seasons": []}
    P = pd.concat(parts, ignore_index=True)
    return {"widths": chosen, "rows": int(sum(len(c) for c in cover80)), "within80": float(np.concatenate(cover80).mean()), "within95": float(np.concatenate(cover95).mean()), "pairs": P}


def publishable(boot: dict, tolerance: float = PUBLISH_TOLERANCE) -> list[dict]:
    """Which buckets of claimed chance may be published: the realized rate is within `tolerance` of the claim and the player-clustered
    interval does not exclude the claim. A bucket that fails is shown as 'too close to call' or not at all."""
    out = []
    for b in boot["buckets"]:
        ok = b["pairs"] >= MIN_PAIRS and abs(b["realized"] - b["claimed"]) <= tolerance and b["realizedLo"] is not None and b["realizedLo"] - 0.02 <= b["claimed"] <= b["realizedHi"] + 0.02
        out.append({**b, "publish": bool(ok)})
    return out
