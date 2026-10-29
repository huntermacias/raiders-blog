"""Run with: python -m pytest scripts/lab -q"""
import pandas as pd

from game_box import game_box, team_box


def plays(rows):
    return pd.DataFrame(rows)


def rows():
    return [
        # LV: a 12-yard run (success, explosive), a 25-yard pass to a receiver, a sack, a third-down conversion
        dict(posteam="LV", defteam="NO", play_type="run", down=1, yards_gained=12, epa=0.8, success=1, rush_attempt=1, rushing_yards=12,
             rusher_player_id="r1", rusher_player_name="A.Back", fixed_drive=1, yardline_100=70, solo_tackle_1_player_id="d1", solo_tackle_1_player_name="D.Safety"),
        dict(posteam="LV", defteam="NO", play_type="pass", down=2, yards_gained=25, epa=1.5, success=1, qb_dropback=1, pass_attempt=1, complete_pass=1,
             passing_yards=25, receiving_yards=25, passer_player_id="q1", passer_player_name="Q.Back", receiver_player_id="w1", receiver_player_name="W.Out",
             air_yards=20, yards_after_catch=5, cpoe=10.0, fixed_drive=1, yardline_100=58, third_down_converted=0),
        dict(posteam="LV", defteam="NO", play_type="pass", down=3, yards_gained=-7, epa=-1.2, success=0, qb_dropback=1, sack=1, passer_player_id="q1",
             passer_player_name="Q.Back", fixed_drive=1, yardline_100=33, third_down_failed=1, sack_player_id="d2", sack_player_name="E.Edge"),
        dict(posteam="LV", defteam="NO", play_type="run", down=1, yards_gained=3, epa=-0.1, success=0, rush_attempt=1, rushing_yards=3,
             rusher_player_id="r1", rusher_player_name="A.Back", fixed_drive=2, yardline_100=15, penalty=1, penalty_team="LV", penalty_yards=10),
        # NO has the ball once
        dict(posteam="NO", defteam="LV", play_type="pass", down=1, yards_gained=6, epa=0.2, success=1, qb_dropback=1, pass_attempt=1, complete_pass=1,
             passing_yards=6, passer_player_id="q2", passer_player_name="N.Pass", receiver_player_id="w2", receiver_player_name="N.Catch",
             air_yards=2, yards_after_catch=4, fixed_drive=3, yardline_100=60),
    ]


def test_team_box_counts_the_numbers_that_decide_games():
    g = plays(rows())
    for col in ("third_down_converted", "third_down_failed", "fourth_down_converted", "fourth_down_failed", "interception", "fumble_lost",
                "sack", "qb_dropback", "fixed_drive_result", "penalty", "penalty_yards", "penalty_team"):
        if col not in g.columns:
            g[col] = float("nan")
    box = team_box(g, "LV", 21)
    assert box["points"] == 21 and box["plays"] == 4 and box["yards"] == 33
    assert box["rushAtt"] == 2 and box["rushYds"] == 15
    assert box["explosive"] == 2  # the 12-yard run and the 25-yard pass
    assert box["sacks"] == 1 and box["dropbacks"] == 2
    assert box["thirdAtt"] == 1 and box["thirdConv"] == 0
    assert box["penalties"] == 1 and box["penaltyYards"] == 10
    assert box["redZoneTrips"] == 1  # the drive that reached the 15
    assert box["epa"] == round((0.8 + 1.5 - 1.2 - 0.1) / 4, 4)
    assert box["earlySuccess"] == round(2 / 3, 4)  # downs 1 and 2: success, success, failure


def test_game_box_has_both_sides_and_their_players():
    out = game_box(plays(rows()), "LV", "NO", 21, 14)
    assert out["teams"]["me"]["points"] == 21 and out["teams"]["opp"]["points"] == 14
    me, opp = out["players"]["me"], out["players"]["opp"]
    assert me["pass"][0]["name"] == "Q.Back" and me["pass"][0]["sacks"] == 1 and me["pass"][0]["yds"] == 25
    assert me["rush"][0]["name"] == "A.Back" and me["rush"][0]["car"] == 2 and me["rush"][0]["yds"] == 15
    assert opp["pass"][0]["name"] == "N.Pass"
    # Defenders are credited on the plays the other team ran: NO's defense made the tackles on LV's plays.
    names = {p["name"]: p for p in opp["def"]}
    assert names["D.Safety"]["tkl"] == 1 and names["E.Edge"]["sack"] == 1


def test_a_frame_without_the_columns_does_not_crash():
    out = game_box(pd.DataFrame([dict(posteam="LV", defteam="NO", play_type="run")]), "LV", "NO", 0, 0)
    assert out["teams"]["me"]["plays"] == 0 and out["players"]["me"]["pass"] == []
