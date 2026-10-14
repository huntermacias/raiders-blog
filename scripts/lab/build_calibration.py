#!/usr/bin/env python3
"""Replay the quarterback estimate on real seasons and write `data/lab/calibration-v2.json`: the width of the ranges and the pairwise
chances the pages may publish.

    python scripts/lab/build_calibration.py --input <folder with the nflverse files> --out data/lab/calibration-v2.json

What it does, in the order that keeps it honest:

1. One set of rows. For every test season (2019 on) and every cutoff (4, 5, 8 and 10 games) the estimate is made from the first games
   and from earlier seasons only, and scored on the rest of that season relative to the league in those same games. The value is the
   league's quarterback-only EPA per dropback, the site's headline for quarterbacks. Range checks and pairwise checks use these same rows.
2. A width is learned, never tuned on what it is scored on. Season s is scored with the width learned from seasons before s
   (`expanding`). The width the site publishes for the NEXT season (`published`) is learned from every completed season; its own
   in-sample coverage is not evidence and is reported only as a description.
3. Pairwise chances are scored out of sample (each season with the width learned from earlier seasons), every interval resamples
   players rather than pairs (a player is in many pairs and several seasons), and a bucket is publishable only if its realized rate
   is close to its claim and the player-clustered interval does not exclude the claim.
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
import build_players as bp  # noqa: E402
import validate_calibration as C  # noqa: E402
import validate_methodology as V  # noqa: E402

TEST_SEASONS = list(range(2019, 2026))
FIRST_SCORED = 2021  # the first season with two earlier seasons of rows to learn a width from
SCALES = (1.0, 1.09, 1.2, 1.3, 1.4)


def load_plays(folder: str, seasons: list[int]) -> pd.DataFrame:
    want = set(bp.PBP_COLS) | {"season", "rush_attempt", "season_type", "week", "penalty"}
    frames = []
    for s in range(min(seasons) - 3, max(seasons) + 1):
        path = Path(folder) / bp.FILES["pbp"].format(season=s)
        if not path.exists():
            continue
        d = bp._read(str(path), usecols=lambda c: c in want)
        d["season"] = s
        frames.append(d[d["season_type"] == "REG"])
    plays = V.qb_plays(pd.concat(frames, ignore_index=True))
    return plays[plays["kind"] != "design"]


def rows_by_cutoff(plays: pd.DataFrame, sd_play: float) -> dict[int, pd.DataFrame]:
    return {k: V.backtest_rows(plays, "epa", sd_play, 250, TEST_SEASONS, k_early=k, center=True, relative=True) for k in C.CUTOFF_GAMES}


def round_scale(x: float) -> float:
    return round(round(x / 0.05) * 0.05, 2)


def build(plays: pd.DataFrame, sd_play: float, boot: int = C.BOOT) -> dict:
    by_k = rows_by_cutoff(plays, sd_play)
    R = pd.concat([r.assign(k=k) for k, r in by_k.items()], ignore_index=True)

    published = round_scale(C.scale_for(R))

    # Coverage on identical rows at every width (a wider range around the same centres never covers less).
    scales = sorted(set(SCALES) | {published})
    pooled = {str(s): v for s, v in zip(scales, C.boot_coverage(R, scales, B=boot))}
    pooled = {k: {m: v[m] for m in ("within80", "within80Ci", "within95", "within95Ci")} for k, v in pooled.items()}
    by_cut = {str(k): {"rows": int(len(r)), **{m: v for m, v in C.boot_coverage(r, [1.0], B=boot)[0].items() if m != "scale"}} for k, r in by_k.items()}

    # Expanding window: each season is scored with the width learned from the seasons before it.
    widths, hit80, hit95, pair_parts = {}, [], [], []
    for s in sorted(R["season"].unique()):
        if s < FIRST_SCORED:
            continue
        sc = C.scale_for(R[R["season"] < s])
        widths[int(s)] = round(sc, 3)
        test = R[R["season"] == s]
        e = (test["target"] - test["history"]).abs()
        hit80.append((e < 1.2816 * np.sqrt((test["pe"] * sc) ** 2 + test["se_target"] ** 2)).to_numpy())
        hit95.append((e < 1.96 * np.sqrt((test["pe"] * sc) ** 2 + test["se_target"] ** 2)).to_numpy())
        for k, r in by_k.items():
            t = r[r["season"] == s]
            if len(t) > 1:
                pair_parts.append(C.pairs(t, sc).assign(k=k))
    oos = {"widthsLearnedFromEarlierSeasons": widths, "rows": int(sum(len(h) for h in hit80)),
           "within80": float(np.concatenate(hit80).mean()), "within95": float(np.concatenate(hit95).mean())}

    P = pd.concat(pair_parts, ignore_index=True)
    b = C.boot_pairs(P, B=boot)
    b["buckets"] = C.publishable(b)
    # The same pairs scored in sample at the published width, for comparison only.
    in_sample = C.boot_pairs(pd.concat([C.pairs(r, published).assign(k=k) for k, r in by_k.items()], ignore_index=True), B=boot)
    in_sample["buckets"] = C.publishable(in_sample)

    # Nothing is shown above what the strongest published bucket actually realized (rounded down to the step).
    top = [x for x in b["buckets"] if x["publish"]]
    cap = float(np.floor(top[-1]["realized"] / 0.05 + 1e-9) * 0.05) if top else 0.5
    cap = round(cap, 2)

    return {
        "version": 3,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generatedFrom": "QB rolling replay of the league's quarterback-only EPA per dropback, test seasons 2019-2025, estimate made after the first k games and scored on the games after; "
                         "talent spread and drift learned from earlier seasons only",
        "intervalScale": published,
        "target": C.PAIR_TARGET,
        "cutoffGames": list(C.CUTOFF_GAMES),
        "display": {"step": 0.05, "floor": 0.55, "cap": cap, "rule": "shown rounded DOWN to the step, never above the cap (the top bucket's realized rate, rounded down); "
                                                                     "below the floor the pair is too close to call; quarterback pairs only, both with 4 to 10 games"},
        "coverage": {"pooled": pooled, "byCutoff": by_cut, "chronological": oos},
        "pairwise": {
            "pairs": b["pairs"], "players": b["players"], "playerSeasonCutoffs": int(len(R)), "buckets": b["buckets"], "brier": b["brier"],
            "scoredOutOfSample": f"seasons {FIRST_SCORED}-2025, each with the width learned from the seasons before it",
            "inSampleAtPublishedWidth": {"buckets": in_sample["buckets"], "brier": in_sample["brier"]},
        },
        "notes": [
            f"Pairs share players, so {b['pairs']:,} pairs are only {len(R)} player-season-cutoffs; every interval here resamples players, not pairs.",
            "On identical rows, a wider range never covers less; coverage rises with the width at every cutoff.",
            f"The published width ({published}) is learned from every completed season and applies to the season being played. Its coverage on the seasons it was learned from is a description, "
            f"not a test; the test is the chronological row (each season scored with a width learned only from earlier seasons): "
            f"{oos['within80']:.1%} inside the 80% range and {oos['within95']:.1%} inside the 95% range.",
            "The value being estimated is the league's quarterback-only EPA per dropback, relative to the league over the same games.",
            "Chances are not published after 10 games or for any pair of non-quarterbacks.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--method", default="data/lab/method-v2.json")
    ap.add_argument("--out", default="data/lab/calibration-v2.json")
    args = ap.parse_args(argv)
    sd_play = float(json.loads(Path(args.method).read_text())["groups"]["qb"]["stats"]["epaDb"]["playSd"])
    out = build(load_plays(args.input, TEST_SEASONS), sd_play)
    Path(args.out).write_text(json.dumps(out, indent=1, default=float) + "\n")
    print(f"wrote {args.out}: published width {out['intervalScale']}, chronological 80% -> {out['coverage']['chronological']['within80']:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
