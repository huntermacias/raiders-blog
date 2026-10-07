import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_history as h  # noqa: E402

TEAMS = ["AAA", "BBB", "CCC", "DDD"]


def play(game, week, home, away, pos, epa, pid, **kw):
    de = away if pos == home else home
    row = dict(
        game_id=game, week=week, season_type="REG", home_team=home, away_team=away, posteam=pos, defteam=de,
        play_type="pass", down=1, epa=epa, success=1 if epa > 0 else 0, yards_gained=5, pass_attempt=1, rush_attempt=0,
        qb_dropback=1, sack=0, qb_scramble=0, third_down_converted=np.nan, third_down_failed=np.nan, fixed_drive=1,
        fixed_drive_result="Punt", yardline_100=70, interception=0, fumble_lost=0, wp=0.5, half_seconds_remaining=900,
        total_home_score=0, total_away_score=0, play_id=pid, desc="x", two_point_attempt=0, penalty=0,
    )
    row.update(kw)
    return row


def season(with_scores=True, with_end=True, games_each=18):
    """Four teams play each other over and over. AAA's passing is great for its first 6 games, then poor."""
    rows = []
    pid = 1
    pairs = [("AAA", "BBB"), ("CCC", "DDD"), ("AAA", "CCC"), ("BBB", "DDD"), ("AAA", "DDD"), ("BBB", "CCC")]
    rounds = games_each // 3
    for r in range(rounds):
        for j, (home, away) in enumerate(pairs):
            week = r * 3 + (j % 3) + 1
            game = f"{week}_{home}_{away}_{j}"
            for pos in (home, away):
                e = 0.4 if (pos == "AAA" and week <= 6) else (-0.2 if pos == "AAA" else 0.0)
                for _ in range(8):
                    extra = {"home_score": 20, "away_score": 10} if with_scores else {}
                    rows.append(play(game, week, home, away, pos, e, pid, **extra))
                    pid += 1
            if with_end:
                extra = {"home_score": 20, "away_score": 10} if with_scores else {}
                rows.append(play(game, week, home, away, home, np.nan, pid, play_type="no_play", desc="END GAME", total_home_score=20, total_away_score=10, **extra))
                pid += 1
    df = pd.DataFrame(rows)
    # a playoff team shows up in the postseason rows
    post = df.iloc[:1].copy()
    post["season_type"] = "POST"
    post["posteam"] = "BBB"
    return pd.concat([df, post], ignore_index=True)


def teams_of(df, **kw):
    return {r["team"]: r for r in h.team_rows(df, **kw)}


def test_each_team_gets_a_start_and_a_rest_at_every_checkpoint():
    rows = teams_of(season(games_each=18))
    # 4 teams, 3 games per pairing per round... every team plays the same number of games, at least 16.
    assert set(rows) == set(TEAMS)
    aaa = rows["AAA"]
    assert set(aaa["n"]) == set(h.CHECKPOINTS)
    for n in h.CHECKPOINTS:
        assert set(aaa["n"][n]["s"]) == set(h.KEYS)
        assert set(aaa["n"][n]["r"]) == set(h.KEYS)


def test_start_and_rest_are_measured_over_different_games():
    rows = teams_of(season())
    n4 = rows["AAA"]["n"][4]
    # AAA threw well early (+0.4 a pass) and badly later (-0.2), so the first games must beat the rest.
    assert n4["s"]["off.epaPass"] == 400
    assert n4["r"]["off.epaPass"] < 100
    # The early games are the same ones the win count is taken from.
    assert n4["w"] == 4
    assert n4["l"] == 0
    assert rows["AAA"]["losses"] == 0
    # By checkpoint 8 the start window includes two of the weak weeks, so it is lower than at checkpoint 4.
    assert rows["AAA"]["n"][8]["s"]["off.epaPass"] < n4["s"]["off.epaPass"]


def test_playoffs_and_wins():
    rows = teams_of(season())
    assert rows["BBB"]["po"] == 1
    assert rows["AAA"]["po"] == 0
    assert rows["AAA"]["wins"] > rows["DDD"]["wins"]


def test_final_scores_come_from_the_score_columns_when_the_end_row_is_missing():
    df = season(with_end=False)
    scores = h.game_scores(df[df["season_type"] == "REG"])
    assert len(scores) > 0
    assert set(scores["for"]) == {20, 10}


def test_falls_back_to_the_end_of_game_row_without_score_columns():
    df = season(with_scores=False)
    scores = h.game_scores(df[df["season_type"] == "REG"])
    assert len(scores) > 0
    assert set(scores["for"]) == {20, 10}


def test_teams_with_too_few_games_are_left_out():
    assert teams_of(season(games_each=12)) == {}


def test_assemble_lines_every_list_up_and_scales_to_whole_numbers():
    rows = h.team_rows(season())
    out = h.assemble({2001: rows, 2002: rows})
    assert out["first"] == 2001 and out["last"] == 2002
    assert out["teams"][0] == "2001 AAA"
    assert len(out["teams"]) == len(out["po"]) == len(out["wins"]) == len(out["losses"]) == 2 * len(rows)
    b = out["n"]["4"]
    assert len(b["w"]) == len(b["l"]) == len(out["teams"])
    for k in out["stats"]:
        assert len(b["s"][k]) == len(b["r"][k]) == len(out["teams"])
    assert all(v is None or isinstance(v, int) for v in b["s"]["off.epaPass"])
    json.dumps(out)  # serializable


def test_unmeasurable_values_become_null_not_nan():
    assert h._scaled(None) is None
    assert h._scaled(float("nan")) is None
    assert h._scaled(0.12345) == 123
    assert h._scaled(-2.5) == -2500


def test_the_stats_are_the_ones_the_scouting_reports_rank():
    for side, key in h.STATS:
        assert key in (h.bs.OFFENSE if side == "off" else h.bs.DEFENSE)
