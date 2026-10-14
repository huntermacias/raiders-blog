"""The validation harness is only worth reading if the harness itself is right, so each tool is checked against a world where the answer is known."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import validate_methodology as V


def world(n_players=120, seasons=(2018, 2019, 2020, 2021, 2022), games=17, per_game=30, talent_sd=0.1, noise_sd=1.5, drift_sd=0.0, seed=1):
    """Players whose true per-play level is known, observed through noisy plays: the ground truth any reliability estimate must recover."""
    rng = np.random.default_rng(seed)
    base = rng.normal(0, talent_sd, n_players)
    rows = []
    for s in seasons:
        level = base + rng.normal(0, drift_sd, n_players)  # a fresh wobble each season around who he really is
        for p in range(n_players):
            for g in range(games):
                e = rng.normal(level[p], noise_sd, per_game)
                rows.append({"season": s, "id": f"p{p}", "week": g + 1, "game": f"{s}-{g}", "n": per_game, "epa": float(e.sum()), "succ": float((e > 0).sum())})
    return pd.DataFrame(rows), base


def test_spearman_brown_and_corr():
    assert V.spearman_brown(0.5) == pytest.approx(2 / 3)
    assert np.isnan(V.corr([1, 1, 1], [1, 2, 3]))
    assert V.corr([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)


def test_split_half_recovers_the_reliability_built_into_the_data():
    units, _ = world()
    # A season of 17 x 30 plays at noise 1.5 on talent 0.1: reliability = talent^2 / (talent^2 + noise^2 / n)
    expected = 0.01 / (0.01 + 1.5**2 / 510)
    got = V.split_half(units, "epa", "n", "n", 100)
    assert got["n"] == 120 * 5
    assert got["reliability"] == pytest.approx(expected, abs=0.1)
    assert got["ci"][0] < got["reliability"] < got["ci"][1]


def test_pure_noise_has_no_reliability_and_pure_signal_has_all_of_it():
    rng = np.random.default_rng(0)
    rows = [{"season": 2020, "id": f"p{i}", "week": w, "game": w, "n": 10, "x": float(rng.normal(0, 1) * 10)} for i in range(150) for w in range(1, 15)]
    assert abs(V.split_half(pd.DataFrame(rows), "x", "n", "n", 10)["r"]) < 0.2
    rows = [{"season": 2020, "id": f"p{i}", "week": w, "game": w, "n": 10, "x": float(i * 10)} for i in range(150) for w in range(1, 15)]
    assert V.split_half(pd.DataFrame(rows), "x", "n", "n", 10)["r"] == pytest.approx(1.0)


def test_stability_falls_when_players_drift():
    steady, _ = world(drift_sd=0.0)
    moving, _ = world(drift_sd=0.15, seed=2)
    ts, tm = (V.season_table(u, {"v": ("epa", "n")}, 100, "n") for u in (steady, moving))
    assert V.yoy(ts, ["v"])["v"]["r"] > V.yoy(tm, ["v"])["v"]["r"] + 0.2


def test_nonneg_weights_gives_a_useless_stat_nothing():
    rng = np.random.default_rng(3)
    n = 400
    t = pd.DataFrame({"a": rng.normal(size=n), "junk": rng.normal(size=n)})
    t["y"] = 0.6 * t["a"] + rng.normal(0, 0.5, n)
    w = V.nonneg_weights(t, ["a", "junk"], "y")
    assert w["a"] > 0.9 and w["junk"] < 0.1
    assert sum(w.values()) == pytest.approx(1.0, abs=0.02)


def test_rolling_fit_never_uses_the_future():
    # Before 2021 the best predictor of next season is x; from 2021 on it is -x. A model asked about target season 2020 may only know the first world.
    rng = np.random.default_rng(4)
    rows = []
    for s in range(2016, 2023):
        for i in range(80):
            x = rng.normal()
            rows.append({"season": s, "id": f"p{i}", "x": x, "y_nx": (x if s + 1 <= 2020 else -x) + rng.normal(0, 0.1)})
    M = pd.DataFrame(rows)
    pred = V.rolling_fit_predict(M, ["x"], "y_nx", first_test=2020)
    at_2019 = M[M["season"] == 2019]
    assert np.corrcoef(pred.loc[at_2019.index], at_2019["x"])[0, 1] > 0.95  # target 2020: trained on 2017-2019 targets only
    assert pred[M["season"] < 2019].isna().all()


def test_shrinkage_beats_raw_and_the_stated_intervals_are_about_right():
    # Plays with a known per-play sd; seasons of ~500 plays, first five games the early read.
    rng = np.random.default_rng(5)
    rows = []
    level = rng.normal(0.03, 0.1, 100)
    for s in range(2016, 2023):
        level = level + rng.normal(0, 0.03, 100)
        for p in range(100):
            for g in range(17):
                for e in rng.normal(level[p], 1.5, 32):
                    rows.append((s, f"p{p}", g + 1, f"{s}-{g}", e))
    plays = pd.DataFrame(rows, columns=["season", "id", "week", "game", "epa"])
    got = V.shrink_backtest(plays, "epa", 1.5, 250, [2018, 2019, 2020, 2021, 2022])
    assert got["all"]["league"]["rmse"] < got["all"]["raw"]["rmse"]
    assert got["shrinkGain"] > 0.1
    assert 0.85 < got["calibration"]["zSd"] < 1.15


def _pbp(rows):
    base = {"season_type": "REG", "season": 2024, "week": 1, "game_id": "g1", "play_id": 0, "posteam": "AAA", "defteam": "BBB", "epa": 0.0, "penalty": 0}
    return pd.DataFrame([{**base, **r, "play_id": i} for i, r in enumerate(rows)])


def test_a_scramble_belongs_to_the_quarterback_who_ran_it_and_is_never_also_a_designed_run():
    pbp = _pbp([
        {"play_type": "pass", "qb_dropback": 1, "pass_attempt": 1, "passer_player_id": "Q1", "epa": 0.1},
        {"play_type": "pass", "qb_dropback": 1, "sack": 1, "passer_player_id": "Q1", "epa": -2.0},
        {"play_type": "run", "qb_dropback": 1, "qb_scramble": 1, "rush_attempt": 1, "rusher_player_id": "Q1", "epa": 0.9},  # no passer id, as in the real files
        {"play_type": "run", "qb_dropback": 0, "qb_scramble": 0, "rush_attempt": 1, "rusher_player_id": "Q1", "epa": -0.2},  # a designed run
        {"play_type": "run", "qb_dropback": 0, "rush_attempt": 1, "rusher_player_id": "RB1", "epa": 0.3},  # someone else's carry
    ])
    plays = V.qb_plays(pbp)
    kinds = plays.groupby("kind")["epa"].agg(["size", "sum"])
    assert kinds.loc["pass", "size"] == 2 and kinds.loc["scramble", "size"] == 1 and kinds.loc["design", "size"] == 1
    assert set(plays["id"]) == {"Q1"}
    audit = V.scramble_audit(plays, pbp)
    assert audit["dropbacksWithoutPasserId"] == 1 and audit["ofThoseScrambles"] == 1 and audit["playsCountedAsBothScrambleAndDesignedRun"] == 0
    units = V.qb_units(plays)
    row = units.iloc[0]
    assert row["db"] == 3 and row["epa"] == pytest.approx(-1.0) and row["run_n"] == 1 and row["all_n"] == 4
    without = V.qb_units(plays, scrambles=False).iloc[0]
    assert without["db"] == 2


def test_penalty_plays_are_left_out_the_way_the_site_does():
    pbp = _pbp([{"play_type": "pass", "qb_dropback": 1, "passer_player_id": "Q1", "epa": 1.0, "penalty": 1}, {"play_type": "pass", "qb_dropback": 1, "passer_player_id": "Q1", "epa": 0.2}])
    assert len(V.qb_plays(pbp)) == 1


def test_signal_labels():
    assert V.signal_label(0.5) == "strong" and V.signal_label(0.3) == "moderate" and V.signal_label(0.1) == "weak" and V.signal_label(None) == "unknown"


def test_report_limits_say_what_the_test_cannot_know():
    text = " ".join(V.limits()).lower()
    assert "epa" in text and "blocking" in text and "team" in text


def test_a_split_that_only_repeats_the_whole_adds_nothing():
    # Every play carries the quarterback's one true level; a "third down" split of the same plays predicts nothing the overall does not.
    rng = np.random.default_rng(6)
    rows = []
    level = rng.normal(0, 0.1, 150)
    for s in range(2018, 2023):
        for p in range(150):
            for g in range(17):
                for k in range(30):
                    rows.append({"season": s, "id": f"p{p}", "week": g + 1, "game": f"{s}-{g}", "kind": "pass", "epa": float(rng.normal(level[p], 1.5)), "down": 1 + k % 4,
                                 "ydstogo": 5, "yardline_100": 50, "wp": 0.5, "air_yards": 5, "pass_attempt": 1})
    got = V.qb_situation_study(pd.DataFrame(rows))
    assert got["third down"]["addsInformation"] is False
    assert got["third down"]["reliability"] < got["all dropbacks"]["reliability"]
