"""Run with: python -m pytest scripts/lab -q"""
import pandas as pd

from build_lab_data import build_game, clean_desc, elapsed_seconds, lane_fields

COLS = [
    "game_id", "play_id", "week", "home_team", "away_team", "qtr", "time", "quarter_seconds_remaining",
    "posteam", "play_type", "down", "ydstogo", "yardline_100", "yards_gained", "desc", "touchdown",
    "field_goal_result", "safety", "interception", "fumble_lost", "first_down", "td_team",
    "home_wp", "away_wp", "home_wp_post", "away_wp_post", "total_home_score", "total_away_score",
    "home_score", "away_score", "spread_line", "roof", "game_date", "fixed_drive", "fixed_drive_result",
    "drive_time_of_possession", "run_location", "run_gap", "pass_location", "air_yards", "yards_after_catch",
]


def frame(rows):
    df = pd.DataFrame(rows)
    for c in COLS:
        if c not in df.columns:
            df[c] = float("nan")
    return df


def base(**kw):
    row = dict(game_id="2026_03_LV_NO", week=3, home_team="NO", away_team="LV", qtr=1, time="10:00",
               quarter_seconds_remaining=600, home_wp=0.5, away_wp=0.5, home_wp_post=0.5, away_wp_post=0.5,
               total_home_score=0, total_away_score=0, home_score=27, away_score=35, game_date="2026-09-27",
               fixed_drive=1)
    row.update(kw)
    return row


def test_elapsed_seconds_regulation_and_overtime():
    assert elapsed_seconds(1, 900) == 0
    assert elapsed_seconds(2, 0) == 1800
    assert elapsed_seconds(4, 0) == 3600
    assert elapsed_seconds(5, 600) == 3600
    assert elapsed_seconds(5, 0) == 4200


def test_clean_desc_strips_clock_and_formation():
    assert clean_desc("(7:39) (Shotgun) 8-K.Cousins pass short left.") == "K.Cousins pass short left."
    assert clean_desc("(:54)  14-M.Gay  41 yard field goal is GOOD.") == "M.Gay 41 yard field goal is GOOD."


def test_clean_desc_drops_jersey_numbers_but_keeps_scores_and_yardage():
    text = "(5:49) 8-K.Cousins pass short right to 87-M.Mayer for 3 yards, TOUCHDOWN. PENALTY on LV-47-A.Ward, False Start, 5 yards."
    assert clean_desc(text) == "K.Cousins pass short right to M.Mayer for 3 yards, TOUCHDOWN. PENALTY on LV-A.Ward, False Start, 5 yards."


def test_unfinished_game_is_skipped():
    df = frame([base(play_id=1, play_type="run", posteam="LV", desc="run", yardline_100=75, down=1, ydstogo=10)])
    assert build_game(df, "LV") is None


def test_stale_score_on_timeout_row_does_not_create_a_fake_score():
    rows = [
        base(play_id=1, play_type="field_goal", posteam="LV", desc="(:04) 14-M.Gay 25 yard field goal is GOOD.",
             field_goal_result="made", total_away_score=3, home_wp=0.45, away_wp=0.55, home_wp_post=0.44,
             away_wp_post=0.56, yardline_100=8, down=4, ydstogo=7),
        base(play_id=2, play_type="no_play", desc="Timeout #2 by NO.", total_away_score=0),  # stale score
        base(play_id=3, play_type="kickoff", posteam="LV", desc="kicks 60 yards", total_away_score=3, qtr=3),
        base(play_id=4, play_type=None, desc="END GAME", total_away_score=35, total_home_score=27),
    ]
    game = build_game(frame(rows), "LV")
    kinds = [k["kind"] for k in game["keyPlays"]]
    assert kinds == ["FG"]
    assert game["score"] == [35, 27] and game["result"] == "W" and game["opp"] == "NO" and game["home"] is False


def test_wp_series_is_team_perspective_and_ends_at_final_result():
    rows = [
        base(play_id=1, play_type="run", posteam="NO", desc="run", yardline_100=75, down=1, ydstogo=10,
             home_wp=0.6, away_wp=0.4),
        base(play_id=2, play_type=None, desc="END GAME"),
    ]
    game = build_game(frame(rows), "LV")
    assert game["wp"][0][1] == 0.4  # LV is away, so away_wp
    assert game["wp"][-1] == [3600, 1.0]
    assert [p[0] for p in game["wp"]] == sorted(p[0] for p in game["wp"])


def test_score_log_includes_extra_points_and_ends_on_the_final_score():
    rows = [
        base(play_id=1, play_type="pass", posteam="LV", touchdown=1, td_team="LV", desc="TOUCHDOWN", total_away_score=6,
             yardline_100=4, down=1, ydstogo=4),
        base(play_id=2, play_type="extra_point", posteam="LV", desc="extra point is GOOD", total_away_score=7),
        base(play_id=3, play_type=None, desc="END GAME", total_away_score=7, total_home_score=0, home_score=0, away_score=7),
    ]
    game = build_game(frame(rows), "LV")
    assert [s[1:] for s in game["scores"]] == [[6, 0], [7, 0]]
    assert game["scores"][-1][1:] == game["score"]


def test_lane_fields_for_runs_passes_and_plays_with_no_lane():
    assert lane_fields({"run_location": "left", "run_gap": "end"}, "run") == {"loc": "L", "gap": "E"}
    assert lane_fields({"run_location": "middle", "run_gap": float("nan")}, "run") == {"loc": "M"}
    assert lane_fields({"pass_location": "right", "air_yards": 8.0, "yards_after_catch": 3.0}, "pass") == {"loc": "R", "ay": 8, "yac": 3}
    # A sack has no pass location: nothing to draw, so the keys are left out.
    assert lane_fields({"pass_location": float("nan"), "air_yards": float("nan")}, "pass") == {}
    assert lane_fields({"run_location": "left"}, "punt") == {}


def test_drive_plays_carry_their_lane():
    rows = [
        base(play_id=1, play_type="run", posteam="LV", down=1, ydstogo=10, yardline_100=75, yards_gained=5, desc="run left end",
             run_location="left", run_gap="end"),
        base(play_id=2, play_type="pass", posteam="LV", down=2, ydstogo=5, yardline_100=70, yards_gained=9, desc="pass short right",
             pass_location="right", air_yards=6.0, yards_after_catch=3.0),
        base(play_id=3, play_type=None, desc="END GAME", home_score=0, away_score=0),
    ]
    game = build_game(frame(rows), "LV")
    plays = game["drives"][0]["plays"]
    assert plays[0]["loc"] == "L" and plays[0]["gap"] == "E"
    assert plays[1]["loc"] == "R" and plays[1]["ay"] == 6 and plays[1]["yac"] == 3
