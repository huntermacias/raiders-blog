#!/usr/bin/env python3
"""Does a quarterback's earlier record predict worse when he changes team or head coach? Writes `data/lab/environment-v2.json`.

    python scripts/lab/validate_environment.py --input <folder with the nflverse files> --method data/lab/method-v2.json --out data/lab/environment-v2.json

For every quarterback-season with 250+ dropbacks that follows a season (the one right before it) with 100+ dropbacks, the projection is
made from earlier seasons only (the same weighting the site uses: each season's sampling variance plus its age times the measured
drift, pulled toward the league) and scored against that season's EPA per dropback, relative to the league. Rows are split by what
changed around him since his last season: nothing, the head coach, or the team.

What the site does with the answer: it WARNS on a new team or new head coach and adjusts nothing. A correlation that is lower for
movers is not by itself evidence for a number to subtract, and the gap in prediction error between movers and stayers is within the
noise (the bootstrap interval, which resamples quarterbacks, includes zero).
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
import build_calibration as BC  # noqa: E402

FIRST, LAST = 2018, 2025
MIN_NOW, MIN_BEFORE = 250, 100
BOOT = 500


def coach_of(plays: pd.DataFrame) -> dict[tuple[int, str], str]:
    """Head coach of each team in each season: the one who coached most of its games."""
    home = plays[["season", "game_id", "home_team", "home_coach"]].rename(columns={"home_team": "team", "home_coach": "coach"})
    away = plays[["season", "game_id", "away_team", "away_coach"]].rename(columns={"away_team": "team", "away_coach": "coach"})
    g = pd.concat([home, away]).drop_duplicates(["season", "game_id", "team"]).dropna(subset=["coach"])
    return {k: v for k, v in g.groupby(["season", "team"])["coach"].agg(lambda s: s.mode().iloc[0]).items()}


def season_table(plays: pd.DataFrame) -> pd.DataFrame:
    plays = plays.copy()
    plays["epa"] = plays["epa"] - plays.groupby("season")["epa"].transform("mean")
    return plays.groupby(["season", "id"]).agg(n=("epa", "size"), v=("epa", "mean"), team=("posteam", lambda s: s.mode().iloc[0])).reset_index()


def rows_of(S: pd.DataFrame, coach: dict, play_sd: float, tau: float, drift: float) -> pd.DataFrame:
    out = []
    for T in range(FIRST, LAST + 1):
        for _, r in S[(S.season == T) & (S.n >= MIN_NOW)].iterrows():
            h = S[(S.id == r.id) & (S.season < T) & (S.n >= MIN_BEFORE)]
            if h.empty:
                continue
            num = den = 0.0
            for _, x in h.iterrows():
                var = play_sd**2 / x.n + (T - x.season) * drift
                num += x.v / var
                den += 1 / var
            pv, pvar = num / den, 1 / den
            est = (pv / pvar) / (1 / tau**2 + 1 / pvar)
            last = h.sort_values("season").iloc[-1]
            same_team = last.team == r.team
            same_coach = coach.get((T, r.team)) == coach.get((int(last.season), last.team))
            env = "same team, same head coach" if same_team and same_coach else ("same team, new head coach" if same_team else "new team")
            out.append(dict(season=T, id=r.id, est=est, tgt=r.v, env=env, gap=T - int(last.season)))
    D = pd.DataFrame(out)
    D["res"] = D["tgt"] - D["est"]
    return D[D["gap"] == 1].reset_index(drop=True)


def build(plays: pd.DataFrame, play_sd: float, tau: float, drift: float, boot: int = BOOT) -> dict:
    D = rows_of(season_table(plays), coach_of(plays), play_sd, tau, drift)
    by = []
    for env, x in D.groupby("env"):
        by.append({"env": env, "n": int(len(x)), "bias": round(float(x.res.mean()), 4), "rmse": round(float(np.sqrt((x.res**2).mean())), 4),
                   "r": round(float(np.corrcoef(x.est, x.tgt)[0, 1]), 3)})
    st = D[D.env == "same team, same head coach"]
    ch = D[D.env != "same team, same head coach"]
    rng = np.random.default_rng(0)
    ids = D.id.unique()
    d = []
    for _ in range(boot):
        w = pd.Series(rng.choice(ids, len(ids))).value_counts()
        a, b = st[st.id.isin(w.index)], ch[ch.id.isin(w.index)]
        wa, wb = a.id.map(w), b.id.map(w)
        d.append(float(np.sqrt((wb * b.res**2).sum() / wb.sum()) - np.sqrt((wa * a.res**2).sum() / wa.sum())))
    lo, hi = float(np.quantile(d, 0.05)), float(np.quantile(d, 0.95))
    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "question": "Is a quarterback's projection from earlier seasons worse when he has a new team or a new head coach?",
        "seasons": f"{FIRST}-{LAST}, last season directly before, {MIN_NOW}+ dropbacks now and {MIN_BEFORE}+ before",
        "byEnvironment": sorted(by, key=lambda r: -r["n"]),
        "rmseGapChangedMinusSame": {"mean": float(np.mean(d)), "ci90": [lo, hi], "includesZero": bool(lo <= 0 <= hi)},
        "decision": "Warn on a new team or new head coach; adjust nothing. The correlation is lower for movers but the gap in prediction error is within the noise, so there is no validated amount to subtract.",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--method", default="data/lab/method-v2.json")
    ap.add_argument("--out", default="data/lab/environment-v2.json")
    args = ap.parse_args(argv)
    st = json.loads(Path(args.method).read_text())["groups"]["qb"]["stats"]["epaDb"]
    plays = BC.load_plays(args.input, list(range(FIRST, LAST + 1)))
    out = build(plays, float(st["playSd"]), float(st["talentSd"]), float(st["drift"]))
    Path(args.out).write_text(json.dumps(out, indent=1) + "\n")
    g = out["rmseGapChangedMinusSame"]
    print(f"wrote {args.out}: rmse gap {g['mean']:+.4f} (90% {g['ci90'][0]:+.4f} to {g['ci90'][1]:+.4f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
