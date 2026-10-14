import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import validate_calibration as C  # noqa: E402
import method as mth  # noqa: E402


def synthetic(n_players=60, seasons=(2020, 2021, 2022, 2023), pe=0.05, noise=0.04, seed=1) -> pd.DataFrame:
    """Players with a true level; the estimate has error `pe`, the outcome has luck `noise`: a model whose stated spread is exactly right."""
    rng = np.random.default_rng(seed)
    rows = []
    level = rng.normal(0, 0.1, n_players)
    for s in seasons:
        est = level + rng.normal(0, pe, n_players)
        tgt = level + rng.normal(0, noise, n_players)
        for i in range(n_players):
            rows.append(dict(season=s, id=f"p{i}", history=est[i], pe=pe, target=tgt[i], se_target=noise))
    return pd.DataFrame(rows)


def test_a_wider_range_around_the_same_centres_never_covers_less():
    R = synthetic(pe=0.03)  # claimed spread too small on purpose
    cov = [C.coverage(R, s) for s in (0.8, 1.0, 1.09, 1.3, 2.0)]
    assert cov == sorted(cov) and cov[-1] > cov[0]


def test_the_width_that_gives_eighty_percent_is_found_and_is_one_when_the_model_is_right():
    R = synthetic(n_players=400, seasons=(2020, 2021, 2022, 2023, 2024))
    assert C.scale_for(R) == pytest.approx(1.0, abs=0.1)
    assert C.coverage(R, C.scale_for(R)) == pytest.approx(0.80, abs=0.005)


def test_pairwise_chances_of_a_right_model_are_calibrated_and_beat_a_coin():
    R = synthetic(n_players=80)
    P = C.pairs(R)
    assert (P["claimed"] >= 0.5).all()
    for row in C.bucket_table(P):
        assert abs(row["realized"] - row["claimed"]) < 0.08
    assert P.eval("(claimed-hit)**2").mean() < 0.25


def test_the_pair_bootstrap_resamples_players_so_the_interval_is_wider_than_pairs_alone_would_give():
    P = C.pairs(synthetic(n_players=40, seasons=(2020, 2021)))
    b = C.boot_pairs(P, B=150)
    # Thousands of pairs but a handful of players: the interval on a bucket must reflect the players, not the pair count.
    row = max(b["buckets"], key=lambda r: r["pairs"])
    naive = 1.645 * np.sqrt(row["realized"] * (1 - row["realized"]) / row["pairs"])
    assert (row["realizedHi"] - row["realizedLo"]) / 2 > 1.5 * naive
    assert b["players"] == 40 and b["pairs"] == len(P)


def test_a_bucket_is_published_only_when_the_claim_is_close_and_inside_the_interval():
    ok = {"buckets": [{"bucket": "0.6-0.7", "pairs": 100, "claimed": 0.65, "realized": 0.66, "realizedLo": 0.6, "realizedHi": 0.72}]}
    far = {"buckets": [{"bucket": "0.8-0.9", "pairs": 100, "claimed": 0.85, "realized": 0.70, "realizedLo": 0.6, "realizedHi": 0.78}]}
    assert C.publishable(ok)[0]["publish"] is True
    assert C.publishable(far)[0]["publish"] is False


def test_out_of_sample_widths_use_only_earlier_seasons():
    R = synthetic(n_players=200, seasons=(2019, 2020, 2021, 2022, 2023))
    oos = C.out_of_sample(R)
    assert set(oos["widths"]) == {2021, 2022, 2023}  # the first two seasons only train
    # Corrupt the last season: its width is learned before it, so the earlier widths do not move.
    R2 = R.copy()
    R2.loc[R2["season"] == 2023, "target"] += 5.0
    assert C.out_of_sample(R2)["widths"][2022] == oos["widths"][2022]


def test_the_method_publishes_the_validated_table_and_the_widening_that_was_measured():
    pub = mth.public()
    assert pub["scale"]["calibration"] == 1.45
    pw = pub["pairwise"]
    assert pw["cutoffGames"] == [4, 5, 8, 10] and "beats" in pw["target"].lower() or ">" in pw["target"]
    assert pw["display"]["cap"] <= 0.85 and all(b["pairs"] >= 100 for b in pw["buckets"] if b["publish"])
    assert 0.74 <= pw["coverage"]["within80"] <= 0.86 and pw["coverage"]["within80Ci"][0] < 0.8 < pw["coverage"]["within80Ci"][1]


def test_the_published_width_is_the_one_the_calibration_file_learned():
    import json
    from pathlib import Path
    c = json.loads((Path(__file__).resolve().parents[2] / "data" / "lab" / "calibration-v2.json").read_text())
    assert mth.INTERVAL_CALIBRATION == c["intervalScale"]
    # The test of the width is chronological: each season scored with a width learned from earlier seasons only.
    ch = c["coverage"]["chronological"]
    assert min(int(y) for y in ch["widthsLearnedFromEarlierSeasons"]) >= 2021 and 0.77 <= ch["within80"] <= 0.9
