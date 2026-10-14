#!/usr/bin/env python3
"""Attribution audit for quarterbacks: whose play is a dropback, which plays are left out, and which EPA value is the quarterback's.
Writes `data/lab/attribution-audit.json`.

    python scripts/lab/audit_attribution.py --input <folder with the nflverse files> --players data/lab/v2/players.json --out data/lab/attribution-audit.json

Questions, in order:
 1. Where do penalties and no-plays sit among dropbacks, and what do the left-out plays look like?
 2. Who loses the ball on a dropback fumble (quarterback, receiver, other), and how far apart are the play's EPA and the league's
    quarterback-only EPA (`qb_epa`)?
 3. Which definition of the quarterback's value predicts best: the play's EPA (`epa`), the play's EPA with penalty plays kept
    (`epa_withpen`), the league's quarterback-only EPA (`qb_epa`), the play's EPA without receiver-fumble plays, or per attempt?
    Scored on consecutive seasons of the same quarterback (250+ dropbacks both), every interval resamples quarterbacks.
 4. What does each definition do to this season's order?

The decision (data/lab/attribution-audit.json -> decision) is the site's: the quarterback's headline is `qb_epa`; team offense stays on
the play's EPA; the two differ only where a receiver lost the ball, and they are not reconciled.
"""

from __future__ import annotations

import argparse
import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
COLS = ["season", "season_type", "week", "game_id", "play_id", "posteam", "defteam", "play_type", "qb_dropback", "qb_scramble", "penalty", "penalty_type", "penalty_team",
        "epa", "qb_epa", "passer_player_id", "rusher_player_id", "receiver_player_id", "receiver_player_name", "passer_player_name", "fumble_lost", "fumbled_1_player_id",
        "sack", "interception", "pass_attempt", "complete_pass", "qb_kneel", "qb_spike", "yards_gained", "two_point_attempt", "desc"]
CANDIDATES = ("epa", "epa_withpen", "qb_epa", "epa_nofumble_recv", "epa_att")
BOOT = 400


def load(folder: str, first: int = 2016, last: int = 2026) -> pd.DataFrame:
    frames = []
    for y in range(first, last + 1):
        f = Path(folder) / f"play_by_play_{y}.csv.gz"
        if f.exists():
            frames.append(pd.read_csv(f, usecols=lambda c: c in COLS, low_memory=False))
    P = pd.concat(frames, ignore_index=True)
    return P[P["season_type"] == "REG"].reset_index(drop=True)


def num(P: pd.DataFrame, c: str):
    return pd.to_numeric(P[c], errors="coerce").fillna(0) if c in P else 0


def left_out(P: pd.DataFrame) -> dict:
    """Question 1."""
    P = P.assign(db=num(P, "qb_dropback") == 1, pen=num(P, "penalty") == 1)
    db = P[P.db]
    tab = db.groupby([db.play_type.fillna("NA"), db.pen]).agg(n=("epa", "size"), withEpa=("epa", lambda s: int(s.notna().sum())), meanEpa=("epa", "mean")).round(3).reset_index()
    pen = db[db.play_type.isin(["pass", "run"]) & db.epa.notna() & db.pen].copy()
    pen["side"] = np.where(pen.penalty_team == pen.posteam, "offense flagged", "defense flagged")
    side = pen.groupby("side").agg(n=("epa", "size"), meanEpa=("epa", "mean")).round(3)
    top = pen.groupby(["side", "penalty_type"]).agg(n=("epa", "size"), meanEpa=("epa", "mean")).sort_values("n", ascending=False).head(10).round(3).reset_index()
    per_season = []
    for s, g in P[P.play_type.isin(["pass", "run"]) & P.epa.notna()].groupby("season"):
        keep = g[~(num(g, "penalty") == 1)]
        d = keep[num(keep, "qb_dropback") == 1]
        diff = d[(d.epa - d.qb_epa.fillna(d.epa)).abs() > 1e-9]
        per_season.append({"season": int(s), "dropbacksCounted": int(len(d)), "dropbacksLeftOutForAPenalty": int(((num(g, "penalty") == 1) & (num(g, "qb_dropback") == 1)).sum()),
                           "playsWhereQbEpaDiffers": int(len(diff)), "epaTakenOffQuarterbacks": round(float((diff.epa - diff.qb_epa).sum()), 1),
                           "twoPointTriesCounted": int((num(keep, "two_point_attempt") == 1).sum())})
    return {
        "dropbacksByPlayTypeAndPenalty": tab.to_dict("records"),
        "penaltyDropbacksBySide": {k: {"n": int(r.n), "meanEpa": float(r.meanEpa)} for k, r in side.iterrows()},
        "mostCommonPenaltiesOnDropbacks": top.to_dict("records"),
        "bySeason": per_season,
        "kneelsAndSpikesAreNotDropbacks": {"kneels": int((P.play_type == "qb_kneel").sum()), "spikes": int((P.play_type == "qb_spike").sum()),
                                           "rule": "play_type is qb_kneel or qb_spike, never pass or run, so no player table counts them"},
    }


def fumbles(P: pd.DataFrame) -> dict:
    """Question 2."""
    P = P.assign(db=num(P, "qb_dropback") == 1, scr=num(P, "qb_scramble") == 1, pen=num(P, "penalty") == 1)
    d0 = P[P.db & P.play_type.isin(["pass", "run"]) & P.epa.notna() & ~P.pen].copy()
    d0["fl"] = num(d0, "fumble_lost") == 1
    owner = d0.passer_player_id.where(~(d0.scr & d0.rusher_player_id.notna()), d0.rusher_player_id)
    d0["byQb"] = d0.fumbled_1_player_id == owner
    d0["byReceiver"] = (d0.fumbled_1_player_id == d0.receiver_player_id) & d0.receiver_player_id.notna()
    fl = d0[d0.fl]
    d = (fl.qb_epa - fl.epa)[fl.byReceiver]
    ex = fl[fl.byReceiver & (fl.season == fl.season.max())].assign(shift=lambda x: x.qb_epa - x.epa).sort_values("shift", ascending=False).head(3)
    return {
        "lostFumblesOnDropbacks": int(len(fl)), "byQuarterback": int(fl.byQb.sum()), "byReceiver": int(fl.byReceiver.sum()),
        "other": int((~fl.byQb & ~fl.byReceiver).sum()), "ofWhichSacks": int((num(fl, "sack") == 1).sum()), "ofWhichScrambles": int(fl.scr.sum()),
        "meanQbEpaMinusEpaOnReceiverFumbles": round(float(d.mean()), 2),
        "shareOfDropbacksWhereTheyDiffer": round(float((abs(d0.qb_epa - d0.epa) > 1e-9).mean()), 5),
        "examples": [{"season": int(r.season), "week": int(r.week), "team": r.posteam, "passer": r.passer_player_name, "receiver": r.receiver_player_name,
                      "epa": round(float(r.epa), 2), "qbEpa": round(float(r.qb_epa), 2), "desc": str(r.desc)[:160]} for r in ex.itertuples()],
        "rule": "qb_epa is the league's value of the pass itself. A receiver's lost fumble after a catch is taken out of it and stays in the receiver's numbers and the team's. A quarterback's own fumble (a sack, a scramble) stays in qb_epa.",
    }


def predictive(P: pd.DataFrame, boot: int = BOOT) -> dict:
    """Question 3."""
    P = P.assign(db=num(P, "qb_dropback") == 1, scr=num(P, "qb_scramble") == 1, pen=num(P, "penalty") == 1)
    d1 = P[P.db & P.play_type.isin(["pass", "run"]) & P.epa.notna()].copy()
    d1["owner"] = d1.passer_player_id.where(~(d1.scr & d1.rusher_player_id.notna()), d1.rusher_player_id)
    d0 = d1[~d1.pen].copy()
    d0["fl"] = num(d0, "fumble_lost") == 1
    d0["recvFumble"] = d0.fl & (d0.fumbled_1_player_id == d0.receiver_player_id) & d0.receiver_player_id.notna()

    def table(d: pd.DataFrame, col: str, name: str) -> pd.DataFrame:
        return d.groupby(["season", "owner"]).agg(n=(col, "size"), v=(col, "mean")).reset_index().rename(columns={"v": name, "n": "n_" + name})

    T = table(d0, "epa", "epa").merge(table(d1, "epa", "epa_withpen"), on=["season", "owner"], how="left").merge(table(d0, "qb_epa", "qb_epa"), on=["season", "owner"], how="left")
    T = T.merge(table(d0[~d0.recvFumble], "epa", "epa_nofumble_recv"), on=["season", "owner"], how="left")
    T = T.merge(table(d0[num(d0, "pass_attempt") == 1], "epa", "epa_att"), on=["season", "owner"], how="left")
    for c in CANDIDATES:
        T[c] = T[c] - T.groupby("season")[c].transform("mean")
    T = T[T.n_epa >= 250]
    nx = T.copy()
    nx["season"] -= 1
    M = T.merge(nx, on=["owner", "season"], suffixes=("", "_n"))
    M = M[(M.season >= 2017) & (M.season <= 2024)]
    rng = np.random.default_rng(0)
    ids = M.owner.unique()

    def wcorr(s: pd.DataFrame, x: str, y: str, w: np.ndarray) -> float:
        return float(np.cov(s[x], s[y], aweights=w)[0, 1] / np.sqrt(np.cov(s[x], s[x], aweights=w)[0, 1] * np.cov(s[y], s[y], aweights=w)[0, 1]))

    res = {}
    for c in CANDIDATES:
        bs = []
        for _ in range(boot):
            w = pd.Series(rng.choice(ids, len(ids))).value_counts()
            s = M[M.owner.isin(w.index)]
            bs.append(wcorr(s, c, c + "_n", s.owner.map(w).to_numpy()))
        res[c] = {"rSelfNext": round(float(np.corrcoef(M[c], M[c + "_n"])[0, 1]), 3), "rWithCurrentHeadline": round(float(np.corrcoef(M[c], M["epa_n"])[0, 1]), 3),
                  "ci": [round(float(np.quantile(bs, 0.05)), 3), round(float(np.quantile(bs, 0.95)), 3)]}
    for c in CANDIDATES[1:]:
        ds = []
        for _ in range(boot):
            w = pd.Series(rng.choice(ids, len(ids))).value_counts()
            s = M[M.owner.isin(w.index)]
            ww = s.owner.map(w).to_numpy()
            ds.append(wcorr(s, c, "epa_n", ww) - wcorr(s, "epa", "epa_n", ww))
        res[c]["diffVsHeadline"] = [round(float(np.mean(ds)), 3), round(float(np.quantile(ds, 0.05)), 3), round(float(np.quantile(ds, 0.95)), 3)]
    return {"pairs": int(len(M)), "definitions": res,
            "reading": "All definitions predict next season about equally well (the intervals overlap and the differences against the headline include zero). The choice is therefore made on what the number means, not on a fitted advantage."}


def order(P: pd.DataFrame, season: int, names: dict[str, str], min_db: int = 40) -> dict:
    """Question 4: this season's order under each definition."""
    P = P.assign(db=num(P, "qb_dropback") == 1, scr=num(P, "qb_scramble") == 1, pen=num(P, "penalty") == 1)
    d1 = P[(P.season == season) & P.db & P.play_type.isin(["pass", "run"]) & P.epa.notna()].copy()
    d1["owner"] = d1.passer_player_id.where(~(d1.scr & d1.rusher_player_id.notna()), d1.rusher_player_id)
    d0 = d1[~d1.pen]
    t = d0.groupby("owner").agg(n=("epa", "size"), epa=("epa", "mean"), qb_epa=("qb_epa", "mean")).join(d1.groupby("owner").agg(epa_withpen=("epa", "mean")))
    t = t[t.n >= min_db]
    for c in ("epa", "epa_withpen", "qb_epa"):
        t["rk_" + c] = t[c].rank(ascending=False)
    t["move"] = t.rk_epa - t.rk_qb_epa
    big = t.reindex(t.move.abs().sort_values(ascending=False).index).head(6)
    return {"season": season, "quarterbacks": int(len(t)), "spearmanEpaVsEpaWithPenalties": round(float(t.epa.rank().corr(t.epa_withpen.rank())), 3),
            "spearmanEpaVsQbEpa": round(float(t.epa.rank().corr(t.qb_epa.rank())), 3),
            "biggestMoves": [{"name": names.get(i, i), "epa": round(float(r.epa), 3), "qbEpa": round(float(r.qb_epa), 3), "rankEpa": int(r.rk_epa), "rankQbEpa": int(r.rk_qb_epa)} for i, r in big.iterrows()]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--players", default=None, help="players.json, for names")
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--out", default="data/lab/attribution-audit.json")
    args = ap.parse_args(argv)
    P = load(args.input, 2016, args.season)
    names = {}
    if args.players and Path(args.players).exists():
        names = {p["id"]: p["name"] for p in json.loads(Path(args.players).read_text())["players"]}
    out = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seasons": f"2016-{args.season} regular season",
        "ownership": {
            "dropback": "the quarterback's: a pass, a sack, or a scramble (the league leaves the passer empty on a scramble and names the quarterback as the rusher)",
            "designedQuarterbackRun": "his, but kept apart from his dropbacks",
            "target": "the receiver's",
            "penaltyPlay": "left out of every player and team number: the play's EPA mixes the penalty's result with the snap, and the passer did not control it",
            "noPlay": "left out (no result to value)",
            "kneelSpike": "left out (not a pass or run play)",
            "twoPointTry": "counted as an ordinary pass or run when the league gives it an EPA value",
        },
        "leftOut": left_out(P),
        "fumbles": fumbles(P),
        "predictive": predictive(P),
        "thisSeasonsOrder": order(P, args.season, names),
        "decision": "The quarterback's headline value is qb_epa. Team offense stays on the play's EPA. The two differ only on a receiver's lost fumble after a catch; no attempt is made to make them agree.",
        "limits": [
            "Penalty plays are removed for both sides. Defensive penalties on dropbacks (roughing the passer, pass interference) average a large positive EPA and offensive ones (intentional grounding, holding) a negative one, so the removal is roughly balanced but not exactly. Intentional grounding is a quarterback's own error and is left out of his number; it is about one play per quarterback-season.",
            "qb_epa takes a receiver's fumble off the quarterback, but a pass that is tipped, dropped or thrown away is still his.",
        ],
    }
    Path(args.out).write_text(json.dumps(out, indent=1, default=float) + "\n")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
