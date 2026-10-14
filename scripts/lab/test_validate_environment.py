import pandas as pd
import pytest

import validate_environment as E


def games():
    rows = []
    for season, home, away, hc, ac in [(2020, "AAA", "BBB", "Coach One", "Coach Two"), (2021, "AAA", "BBB", "Coach One", "Coach Three"), (2021, "BBB", "AAA", "Coach Three", "Coach One")]:
        for g in range(3):
            rows.append(dict(season=season, game_id=f"{season}_{g}_{home}", home_team=home, away_team=away, home_coach=hc, away_coach=ac))
    return pd.DataFrame(rows)


def test_a_team_s_head_coach_is_the_one_who_coached_most_of_its_games():
    c = E.coach_of(games())
    assert c[(2020, "AAA")] == "Coach One" and c[(2021, "AAA")] == "Coach One"
    assert c[(2020, "BBB")] == "Coach Two" and c[(2021, "BBB")] == "Coach Three"


def test_what_changed_around_a_quarterback_is_named_from_his_last_season_to_this_one():
    seasons = []
    for T in range(2018, 2026):
        seasons.append(dict(season=T, id="q1", n=400, v=0.05, team="AAA"))   # never moves
        seasons.append(dict(season=T, id="q2", n=400, v=0.0, team="AAA" if T < 2025 else "BBB"))  # new team in 2025
    S = pd.DataFrame(seasons)
    coach = {(T, "AAA"): "One" for T in range(2018, 2026)} | {(T, "BBB"): "Two" for T in range(2018, 2026)}
    D = E.rows_of(S, coach, 1.7, 0.1, 0.003)
    last = D[D.season == 2025].set_index("id")["env"]
    assert last["q1"] == "same team, same head coach"
    assert last["q2"] == "new team"
    # A head coach who changed on the same team is its own case.
    coach2 = dict(coach) | {(2025, "AAA"): "Three"}
    assert E.rows_of(S, coach2, 1.7, 0.1, 0.003).query("season == 2025 and id == 'q1'")["env"].iloc[0] == "same team, new head coach"
