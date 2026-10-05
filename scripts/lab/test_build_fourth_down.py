import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_fourth_down as b  # noqa: E402


def play(**kw):
    base = dict(
        game_id="g", week=1, season_type="REG", home_team="LV", away_team="KC", posteam="LV", qtr=2, time="10:00",
        down=4, ydstogo=2, yardline_100=40, score_differential=0, game_seconds_remaining=1500,
        quarter_seconds_remaining=600, play_type="run", penalty=0, fourth_down_converted=1, field_goal_result=np.nan,
        home_wp_post=0.6, away_wp_post=0.4, home_wp=0.55, away_wp=0.45, desc="x", play_id=1, qb_kneel=0, qb_spike=0,
    )
    base.update(kw)
    return base


def frame(rows):
    return pd.DataFrame(rows)


def test_fourth_downs_classifies_choices_and_flips_win_probability_for_the_away_team():
    df = frame([
        play(play_type="run", fourth_down_converted=1),
        play(play_type="pass", fourth_down_converted=0, fourth_down_failed=1),
        play(play_type="punt", fourth_down_converted=np.nan),
        play(play_type="field_goal", field_goal_result="made", fourth_down_converted=np.nan),
        play(play_type="field_goal", field_goal_result="missed", fourth_down_converted=np.nan),
        play(posteam="KC", play_type="punt", fourth_down_converted=np.nan),
    ])
    d = b.fourth_downs(df)
    assert list(d["choice"]) == ["go", "go", "punt", "fg", "fg", "punt"]
    assert list(d["worked"])[:2] == [True, False]
    assert list(d["worked"])[3:5] == [True, False]
    assert d["wp_after"].iloc[0] == 0.6  # home offense
    assert d["wp_after"].iloc[5] == 0.4  # away offense


def test_penalties_kneels_third_downs_and_missing_data_are_left_out():
    df = frame([
        play(penalty=1),
        play(qb_kneel=1),
        play(down=3),
        play(home_wp_post=np.nan),
        play(play_type="kickoff"),
        play(),
    ])
    assert len(b.fourth_downs(df)) == 1


def history(n=400, go_rate=0.6, seed=1):
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        choice = rng.choice(["go", "punt", "fg"], p=[0.3, 0.45, 0.25])
        worked = rng.random() < (go_rate if choice == "go" else 0.85)
        wp = 0.55 + (0.08 if worked else -0.08) + rng.normal(0, 0.02)
        if choice == "punt":
            rows.append(play(play_type="punt", fourth_down_converted=np.nan, home_wp_post=0.5 + rng.normal(0, 0.02), away_wp_post=0.5, ydstogo=int(rng.integers(1, 5)), yardline_100=int(rng.integers(35, 60))))
        elif choice == "fg":
            rows.append(play(play_type="field_goal", fourth_down_converted=np.nan, field_goal_result="made" if worked else "missed", home_wp_post=wp, ydstogo=int(rng.integers(1, 5)), yardline_100=int(rng.integers(35, 60))))
        else:
            rows.append(play(play_type="run", fourth_down_converted=1 if worked else 0, home_wp_post=wp, ydstogo=int(rng.integers(1, 5)), yardline_100=int(rng.integers(35, 60))))
    return b.History(b.fourth_downs(frame(rows)))


def test_estimates_use_the_chance_of_working_and_need_enough_history():
    h = history()
    go = h.estimate("go", 2, 45, 0, 1500)
    assert go and 0.45 < go["wp"] < 0.66 and 0.4 < go["p"] < 0.8
    assert h.estimate("punt", 2, 45, 0, 1500)["wp"] == pytest_approx(0.5, 0.05)
    # nothing in the history looks like a 4th and 25 at the goal line, so nothing is offered
    assert h.estimate("go", 25, 3, 0, 1500) is None
    assert history(n=6).estimate("go", 2, 45, 0, 1500) is None


def pytest_approx(x, tol):
    class A:
        def __eq__(self, other):
            return abs(other - x) <= tol
    return A()


def test_nobody_punts_while_trailing_in_the_last_two_and_a_half_minutes():
    h = history()
    assert h.estimate("punt", 2, 45, -3, 100) is None
    assert h.estimate("punt", 2, 45, -3, 1500) is not None


def test_verdict_labels():
    assert b.verdict(0.0, True) == "best"
    assert b.verdict(0.01, True) == "toss-up"
    assert b.verdict(0.03, True) == "questionable"
    assert b.verdict(0.08, True) == "costly"
    assert b.verdict(None, True) is None
    assert b.verdict(0.08, False) is None


def test_summarize_counts_only_graded_decisions_and_sums_questionable_or_worse():
    ds = [
        {"verdict": "best", "cost": 0.0},
        {"verdict": "toss-up", "cost": 0.01},
        {"verdict": "questionable", "cost": 0.03},
        {"verdict": "costly", "cost": 0.06},
        {"verdict": None, "cost": None},
    ]
    s = b.summarize(ds)
    assert s == {"decisions": 5, "graded": 4, "bestOrClose": 2, "leftOnTable": 0.09}


def test_history_range_parsing():
    assert b.parse_history("2019-2021") == [2019, 2020, 2021]
    assert b.parse_history("2020,2023") == [2020, 2023]


def test_the_clock_and_elapsed_helpers():
    assert b.elapsed(1, 900) == 0
    assert b.elapsed(4, 0) == 3600
    assert b.elapsed(5, 300) == 3900
    assert b.clean_desc("(2:17) (Shotgun) 6-T.Shough pass short left to 81-B.Bowers.") == "T.Shough pass short left to B.Bowers."
