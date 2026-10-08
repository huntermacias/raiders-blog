import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_units as b  # noqa: E402

TEAMS = ["AAA", "BBB", "CCC", "DDD"]
STRENGTH = {"AAA": 0.4, "BBB": 0.1, "CCC": -0.1, "DDD": -0.4}
COACH = {"AAA": "Ann Able", "BBB": "Bo Baker", "CCC": "Cy Clark", "DDD": "Klint Kubliak"}
# (week, home, away): everyone plays everyone once in three weeks.
SCHEDULE = [(1, "AAA", "BBB"), (1, "CCC", "DDD"), (2, "AAA", "CCC"), (2, "BBB", "DDD"), (3, "AAA", "DDD"), (3, "BBB", "CCC")]


def plays(week, home, away, first_id):
    rows = []
    pid = first_id
    for pos in (home, away):
        de = away if pos == home else home
        for i in range(20):
            is_pass = i % 2 == 0
            epa = STRENGTH[pos] - STRENGTH[de] * 0.5
            rows.append(dict(
                game_id=f"2026_{week:02d}_{away}_{home}", play_id=pid, week=week, season_type="REG", posteam=pos, defteam=de,
                play_type="pass" if is_pass else "run", down=1, epa=epa, success=1 if epa > 0 else 0,
                yards_gained=22 if (is_pass and i % 4 == 0) else (0 if i == 1 else 5), pass_attempt=1 if is_pass else 0,
                complete_pass=1 if is_pass else 0, qb_dropback=1 if is_pass else 0, sack=1 if i == 2 else 0, qb_scramble=0,
                qb_hit=1 if i in (2, 4) else 0, interception=1 if i == 6 else 0, yards_after_catch=4 if is_pass else np.nan,
                receiver_player_id="r-" + pos if is_pass and i != 2 else None, receiver_player_name="R." + pos,
                passer_player_id="q-" + pos if is_pass else None, passer_player_name="Q." + pos,
                rusher_player_id=None if is_pass else "b-" + pos, rusher_player_name="B." + pos,
                cpoe=2.0 if is_pass else np.nan, pass_oe=3.0 if is_pass else -3.0, no_huddle=0, shotgun=1 if is_pass else 0, penalty=0,
            ))
            pid += 1
    return rows, pid


def sources():
    rows, pid = [], 1
    for wk, home, away in SCHEDULE:
        r, pid = plays(wk, home, away, pid)
        rows += r
    pbp = pd.DataFrame(rows)
    ftn = pd.DataFrame({
        "nflverse_game_id": pbp["game_id"], "nflverse_play_id": pbp["play_id"], "is_play_action": (pbp["play_id"] % 4 == 0).astype(int),
        "is_motion": (pbp["play_id"] % 2 == 0).astype(int), "n_blitzers": (pbp["play_id"] % 3 == 0).astype(int),
        "n_pass_rushers": 4, "n_defense_box": np.where(pbp["play_type"] == "run", 8, 5),
    })
    pfr = {}
    pairs = [(h, a, wk) for wk, h, a in SCHEDULE] + [(a, h, wk) for wk, h, a in SCHEDULE]
    base = lambda t, o, wk, pid_: dict(game_id="x", season=2026, week=wk, game_type="REG", team=t, opponent=o, pfr_player_name=pid_, pfr_player_id=pid_)  # noqa: E731
    pfr["pass"] = pd.DataFrame([{**base(t, o, wk, "Q." + t), "times_pressured": 5} for t, o, wk in pairs])
    pfr["rush"] = pd.DataFrame([{**base(t, o, wk, "B." + t), "carries": 10, "rushing_yards_before_contact": 20 + 5 * (t == "AAA"),
                                 "rushing_yards_after_contact": 15} for t, o, wk in pairs])
    pfr["rec"] = pd.DataFrame([{**base(t, o, wk, "R." + t), "receiving_drop": 1, "receiving_broken_tackles": 1} for t, o, wk in pairs])
    pfr["defense"] = pd.DataFrame([{**base(t, o, wk, "D." + t), "def_pressures": 3 + 3 * (t == "AAA"), "def_sacks": 1, "def_tackles_combined": 9,
                                    "def_missed_tackles": 1, "def_targets": 8, "def_completions_allowed": 5, "def_yards_allowed": 60,
                                    "def_receiving_td_allowed": 0, "def_ints": 1} for t, o, wk in pairs])
    snaps = pd.DataFrame([dict(game_id="x", season=2026, game_type="REG", week=wk, player=f"Guard {t}", pfr_player_id="G." + t, position="G",
                               team=t, opponent=o, offense_snaps=60, offense_pct=1.0, defense_snaps=0, defense_pct=0.0, st_snaps=0, st_pct=0.0)
                          for t, o, wk in pairs] + [dict(game_id="x", season=2026, game_type="REG", week=1, player="Backup Bob", pfr_player_id="B.1",
                                                          position="WR", team="AAA", opponent="BBB", offense_snaps=5, offense_pct=0.1,
                                                          defense_snaps=0, defense_pct=0.0, st_snaps=0, st_pct=0.0)])
    roster = pd.DataFrame([
        dict(gsis_id="g1", pfr_id="G.AAA", full_name="Guard AAA", position="G", team="AAA"),
        dict(gsis_id="g2", pfr_id="B.1", full_name="Backup Bob", position="WR", team="AAA"),
        dict(gsis_id="q-AAA", pfr_id="Q.AAA", full_name="Quinn AAA", position="QB", team="AAA"),
        dict(gsis_id="r-AAA", pfr_id="R.AAA", full_name="Rex AAA", position="WR", team="AAA"),
        dict(gsis_id="b-AAA", pfr_id="B.AAA", full_name="Rob AAA", position="RB", team="AAA"),
    ])
    injuries = pd.DataFrame([
        dict(season=2026, team="AAA", week=2, gsis_id="g1", position="G", full_name="Old Report", report_status="Out", report_primary_injury="Knee",
             practice_status="Did Not Participate in Practice"),
        dict(season=2026, team="AAA", week=3, gsis_id="g1", position="G", full_name="Guard AAA", report_status="Out", report_primary_injury="Knee",
             practice_status="Did Not Participate in Practice"),
        dict(season=2026, team="AAA", week=3, gsis_id="g2", position="WR", full_name="Backup Bob", report_status="Questionable", report_primary_injury="Ankle",
             practice_status="Limited Participation in Practice"),
        dict(season=2026, team="AAA", week=3, gsis_id="g3", position="K", full_name="Kicker Kyle", report_status="Out", report_primary_injury="Hip",
             practice_status="Did Not Participate in Practice"),
        dict(season=2026, team="AAA", week=3, gsis_id="g4", position="CB", full_name="Practice Pete", report_status=np.nan, report_primary_injury=np.nan,
             practice_status="Limited Participation in Practice"),
        dict(season=2026, team="AAA", week=3, gsis_id="g5", position="TE", full_name="Healthy Hal", report_status=np.nan, report_primary_injury=np.nan,
             practice_status="Full Participation in Practice"),
    ])
    rows = []
    for wk, home, away in SCHEDULE:
        hs = 30 if home == "AAA" else 20
        rows.append(dict(game_id=f"2026_{wk:02d}_{away}_{home}", season=2026, game_type="REG", week=wk, gameday="2026-09-20", gametime="13:00",
                         away_team=away, away_score=17, home_team=home, home_score=hs, spread_line=3.0, total_line=44.5,
                         away_rest=7, home_rest=7 if wk != 3 else 14, home_coach=COACH[home], away_coach=COACH[away]))
    # Next week, and two old meetings of the same coaches.
    rows.append(dict(game_id="2026_04_BBB_AAA", season=2026, game_type="REG", week=4, gameday="2026-09-27", gametime="13:00", away_team="BBB",
                     away_score=np.nan, home_team="AAA", home_score=np.nan, spread_line=-2.5, total_line=41.0, away_rest=7, home_rest=7,
                     home_coach=COACH["AAA"], away_coach=COACH["BBB"]))
    rows.append(dict(game_id="2025_01_BBB_AAA", season=2025, game_type="REG", week=1, gameday="2025-09-07", gametime="13:00", away_team="BBB",
                     away_score=10, home_team="OAK" if False else "AAA", home_score=24, spread_line=-3.0, total_line=40.0, away_rest=7, home_rest=7,
                     home_coach=COACH["AAA"], away_coach=COACH["BBB"]))
    rows.append(dict(game_id="2024_01_AAA_BBB", season=2024, game_type="REG", week=1, gameday="2024-09-08", gametime="13:00", away_team="AAA",
                     away_score=13, home_team="BBB", home_score=20, spread_line=1.0, total_line=40.0, away_rest=7, home_rest=7,
                     home_coach=COACH["BBB"], away_coach=COACH["AAA"]))
    return {"pbp": pbp, "ftn": ftn, **pfr, "snaps": snaps, "roster": roster, "injuries": injuries, "games": pd.DataFrame(rows)}


def test_passer_rating_matches_the_nfl_formula():
    assert round(b.passer_rating(10, 10, 200, 4, 0)) == 158  # a perfect game scores 158.3
    assert b.passer_rating(0, 0, 0, 0, 0) is None
    assert round(b.passer_rating(10, 5, 50, 0, 1), 1) == 25.0


def test_rank_one_is_best_whichever_way_the_stat_runs():
    vals = {"A": 1.0, "B": 3.0, "C": 2.0, "D": None}
    high = b.rank_stat(vals, True)
    low = b.rank_stat(vals, False)
    assert high["B"]["rank"] == 1 and high["A"]["rank"] == 3 and "D" not in high
    assert low["A"]["rank"] == 1 and low["B"]["rank"] == 3
    # Style stats rank the highest rate first.
    assert b.rank_stat(vals, None)["B"]["rank"] == 1


def test_grade_is_a_percentile_and_needs_a_league():
    assert b.grade([1, 1], 32) == 100.0
    assert b.grade([32], 32) == 0.0
    assert b.grade([], 32) is None and b.grade([1], 1) is None


def test_groups_cover_every_stat_and_rank_the_strongest_team_first():
    out = b.build(sources(), 2026)
    assert set(out["teams"]) == set(TEAMS)
    for t in TEAMS:
        assert set(out["teams"][t]["groups"]) == set(b.GROUPS)
        for grp, stats in b.GROUPS.items():
            assert set(out["teams"][t]["groups"][grp]["stats"]) == set(stats)
    qb = lambda t: out["teams"][t]["groups"]["qb"]["stats"]["epaDb"]["rank"]  # noqa: E731
    assert qb("AAA") == 1 and qb("DDD") == 4
    # Pass defense: the team that faced the weakest offenses allowed the least.
    assert out["teams"]["AAA"]["overall"]["def"]["rank"] == 1
    assert out["teams"]["AAA"]["overall"]["off"]["rank"] == 1


def test_a_group_rank_follows_its_score():
    out = b.build(sources(), 2026)
    for grp in b.GROUPS:
        by_rank = sorted(TEAMS, key=lambda t: out["teams"][t]["groups"][grp]["rank"])
        scores = [out["teams"][t]["groups"][grp]["score"] for t in by_rank]
        assert scores == sorted(scores, reverse=True)
        assert [out["teams"][t]["groups"][grp]["rank"] for t in by_rank] == [1, 2, 3, 4]


def test_pfr_numbers_flow_into_the_right_groups():
    out = b.build(sources(), 2026)
    t = out["teams"]
    # AAA has more yards before contact and more pressures than anyone.
    assert t["AAA"]["groups"]["ol"]["stats"]["ybc"]["rank"] == 1
    assert t["AAA"]["groups"]["rush"]["stats"]["pressure"]["rank"] == 1
    assert t["AAA"]["groups"]["ol"]["stats"]["pressure"]["v"] == round(15 / 30, 4)


def test_style_stats_have_no_good_or_bad_just_a_spectrum():
    out = b.build(sources(), 2026)
    off = out["teams"]["AAA"]["style"]["off"]
    assert set(off) == set(b.STYLE["off"])
    assert off["proe"]["v"] == 0.0 or isinstance(off["proe"]["v"], float)
    assert set(out["teams"]["AAA"]["style"]["def"]) == set(b.STYLE["def"])
    assert out["league"]["style"]["def"]["rushers"] == 4.0


def test_record_and_points_come_from_the_games_file():
    t = b.build(sources(), 2026)["teams"]
    assert (t["AAA"]["w"], t["AAA"]["l"], t["AAA"]["g"]) == (3, 0, 3)
    assert t["AAA"]["pf"] == 90 and t["AAA"]["pa"] == 51
    assert t["DDD"]["w"] == 0 and t["DDD"]["g"] == 3


def test_coach_name_typos_are_fixed_and_records_are_per_coach():
    out = b.build(sources(), 2026)["teams"]
    assert out["DDD"]["coach"]["name"] == "Klint Kubiak"
    ann = out["AAA"]["coach"]
    assert ann["name"] == "Ann Able"
    assert (ann["career"]["w"], ann["career"]["l"]) == (4, 1)
    assert ann["withTeam"]["since"] == 2024


def test_against_the_spread_uses_the_home_teams_line():
    ann = b.build(sources(), 2026)["teams"]["AAA"]["coach"]["ats"]
    # 2026 home wins by 13 as 3-point favourites (x3 weeks) cover every time.
    assert ann["season"] == {"w": 3, "l": 0, "p": 0}
    # The old games: 24-10 as a 3-point home underdog is a cover; at BBB, losing 20-13 as a 1-point dog (BBB -1) is a loss ATS only by margin.
    assert ann["career"]["w"] >= 3


def test_head_to_head_lists_coach_and_franchise_history_newest_first():
    vs = b.build(sources(), 2026)["teams"]["AAA"]["coach"]["vs"]
    assert "AAA" not in vs
    bbb = vs["BBB"]
    assert bbb["coach"] == "Bo Baker"
    assert bbb["coachMeet"]["n"] == bbb["teamMeet"]["n"] == 3
    assert bbb["recent"][0]["season"] == 2026 and bbb["recent"][-1]["season"] == 2024
    assert (bbb["coachMeet"]["w"], bbb["coachMeet"]["l"]) == (2, 1)


def test_old_franchise_names_roll_up_to_the_current_abbreviation():
    games = sources()["games"].copy()
    games.loc[games["season"] == 2025, "home_team"] = "OAK"
    log = b.coach_log(b.site(games, ("home_team", "away_team")))
    assert "OAK" not in set(log["team"]) and "LV" in set(log["team"])


def test_the_slate_is_the_first_week_with_unplayed_games():
    out = b.build(sources(), 2026)
    assert out["week"] == 3
    assert out["slate"]["week"] == 4
    assert out["slate"]["games"] == [{"away": "BBB", "home": "AAA", "day": "2026-09-27", "time": "13:00", "spread": -2.5, "total": 41.0}]


def test_a_finished_season_has_no_slate():
    src = sources()
    src["games"] = src["games"][src["games"]["week"] != 4]
    assert b.build(src, 2026)["slate"] is None


def test_injuries_use_the_latest_report_and_group_by_position():
    inj = b.build(sources(), 2026)["teams"]["AAA"]["injuries"]
    assert inj["week"] == 3
    names = [p["name"] for p in inj["players"]]
    assert "Old Report" not in names and "Kicker Kyle" not in names and "Healthy Hal" not in names
    guard = next(p for p in inj["players"] if p["name"] == "Guard AAA")
    assert guard["group"] == "ol" and guard["status"] == "Out" and guard["starter"] is True
    bob = next(p for p in inj["players"] if p["name"] == "Backup Bob")
    assert bob["group"] == "rec" and bob["starter"] is False
    pete = next(p for p in inj["players"] if p["name"] == "Practice Pete")
    assert pete["status"] == "Limited" and pete["group"] == "cov"
    # Out first, then the rest.
    assert names[0] == "Guard AAA"


def test_teams_without_a_report_get_an_empty_one():
    inj = b.build(sources(), 2026)["teams"]["BBB"]["injuries"]
    assert inj == {"week": None, "players": []}


def test_leaders_name_the_players_behind_each_group():
    t = b.build(sources(), 2026)["teams"]["AAA"]["groups"]
    assert t["qb"]["leaders"][0]["name"] == "Quinn AAA"
    assert t["rec"]["leaders"][0]["name"] == "Rex AAA"
    assert t["run"]["leaders"][0]["name"] == "Rob AAA"
    assert t["ol"]["leaders"][0]["name"] == "Guard AAA"
    assert t["rush"]["leaders"][0]["stat"] == "pressures"


def test_cli_writes_json_and_leaves_an_unchanged_file_alone(tmp_path, monkeypatch, capsys):
    src = sources()
    monkeypatch.setattr(b, "load", lambda season, folder: src)
    out = tmp_path / "units.json"
    assert b.main(["--season", "2026", "--out", str(out)]) == 0
    data = json.loads(out.read_text())
    assert data["season"] == 2026 and set(data["teams"]) == set(TEAMS)
    before = out.read_text()
    assert b.main(["--season", "2026", "--out", str(out)]) == 0
    assert "unchanged" in capsys.readouterr().out
    assert out.read_text() == before


def test_no_finished_games_leaves_the_existing_file_alone(tmp_path, monkeypatch):
    src = sources()
    src["games"] = src["games"][src["games"]["home_score"].isna()]
    monkeypatch.setattr(b, "load", lambda season, folder: src)
    out = tmp_path / "units.json"
    out.write_text("keep me")
    assert b.main(["--season", "2026", "--out", str(out)]) == 0
    assert out.read_text() == "keep me"
