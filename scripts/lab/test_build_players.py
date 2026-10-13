import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_players as b  # noqa: E402
import situations as sit  # noqa: E402

TEAMS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]
# (week, home, away). AAA has a bye in week 3, and week 6 is still in progress.
SCHEDULE = [
    (1, "AAA", "BBB"), (1, "CCC", "DDD"), (1, "EEE", "FFF"),
    (2, "AAA", "CCC"), (2, "BBB", "EEE"), (2, "DDD", "FFF"),
    (3, "BBB", "CCC"), (3, "DDD", "EEE"),
    (4, "AAA", "BBB"), (4, "CCC", "DDD"), (4, "EEE", "FFF"),
    (5, "AAA", "CCC"), (5, "BBB", "EEE"), (5, "DDD", "FFF"),
    (6, "BBB", "AAA"),
]
UNFINISHED = 6
# PFR has not posted this week yet.
NO_PFR = 5


def epa_for(team: str, week: int) -> float:
    base = {"AAA": 0.10, "BBB": 0.0, "CCC": -0.05, "DDD": 0.05, "EEE": -0.10, "FFF": 0.02}[team]
    # AAA gets better in its last two finished games (weeks 4 and 5).
    return base + (0.30 if team == "AAA" and week >= 4 else 0.0)


def situation(i: int, k: int) -> dict:
    """Where on the field and on what down a play of the fixture happens, in a repeating pattern."""
    return dict(down=i % 4 + 1, ydstogo=(10, 8, 5, 2)[i % 4], yardline_100=75 - (i % k) * 15, qtr=i // 12 + 1,
                first_down=1 if i % 4 == 3 else 0, touchdown=1 if i % 20 == 19 else 0)


def plays(week: int, home: str, away: str, first_id: int):
    gid = f"2026_{week:02d}_{away}_{home}"
    rows, pid = [], first_id
    for team, other in ((home, away), (away, home)):
        epa = epa_for(team, week)
        for i in range(30):
            sack = i % 6 == 0
            rows.append(dict(
                game_id=gid, play_id=pid, week=week, season_type="REG", posteam=team, defteam=other, play_type="pass",
                epa=epa + (i % 3 - 1) * 0.05, success=1 if epa + (i % 3 - 1) * 0.05 > 0 else 0, yards_gained=0 if sack else 9,
                pass_attempt=0 if sack else 1, complete_pass=0 if sack else i % 2, qb_dropback=1, qb_scramble=0, interception=0,
                sack=1 if sack else 0, air_yards=np.nan if sack else 8.0, yards_after_catch=3.0 if (not sack and i % 2) else np.nan,
                receiver_player_id=None if sack else f"r-{team}", passer_player_id=f"q-{team}", rusher_player_id=None,
                cpoe=np.nan if sack else 1.0, cp=np.nan if sack else 0.6, xyac_mean_yardage=np.nan if sack else 2.0, penalty=0, desc="x", **situation(i, 3)))
            pid += 1
        for i in range(20):
            rows.append(dict(
                game_id=gid, play_id=pid, week=week, season_type="REG", posteam=team, defteam=other, play_type="run",
                epa=epa, success=1 if epa > 0 else 0, yards_gained=12 if i % 5 == 0 else 3, pass_attempt=0, complete_pass=0,
                qb_dropback=0, qb_scramble=0, interception=0, sack=0, air_yards=np.nan, yards_after_catch=np.nan,
                receiver_player_id=None, passer_player_id=None, rusher_player_id=f"b-{team}", cpoe=np.nan, cp=np.nan,
                xyac_mean_yardage=np.nan, penalty=0, desc="x", **situation(i, 5)))
            pid += 1
    for team, other in ((home, away), (away, home)):
        # Two field goals a game: a short one every kicker makes and a long one only AAA's kicker makes once the team is rolling.
        for dist, made in ((30, True), (52, team == "AAA" and week >= 4)):
            rows.append(dict(game_id=gid, play_id=pid, week=week, season_type="REG", posteam=team, defteam=other, play_type="field_goal",
                             epa=0.4 if made else -2.0, penalty=0, desc="x", kicker_player_id=f"k-{team}", kick_distance=dist,
                             field_goal_result="made" if made else "missed"))
            pid += 1
        for _ in range(2):
            rows.append(dict(game_id=gid, play_id=pid, week=week, season_type="REG", posteam=team, defteam=other, play_type="punt",
                             epa=-0.2, penalty=0, desc="x", punter_player_id=f"u-{team}", kick_distance=45, return_yards=8,
                             punt_returner_player_id=f"r-{other}", punt_fair_catch=0, touchback=0, punt_inside_twenty=1))
            pid += 1
    if week != UNFINISHED:
        rows.append(dict(game_id=gid, play_id=pid, week=week, season_type="REG", posteam=None, defteam=None, play_type="no_play",
                         epa=np.nan, penalty=0, desc="END GAME"))
        pid += 1
    return rows, pid


def sources():
    rows, pid = [], 1
    for wk, home, away in SCHEDULE:
        r, pid = plays(wk, home, away, pid)
        rows += r
    pbp = pd.DataFrame(rows)

    pairs = [(h, a, wk) for wk, h, a in SCHEDULE] + [(a, h, wk) for wk, h, a in SCHEDULE]
    base = lambda t, o, wk, pid_: dict(game_id="x", season=2026, week=wk, game_type="REG", team=t, opponent=o, pfr_player_id=pid_, pfr_player_name=pid_)  # noqa: E731
    posted = [(t, o, wk) for t, o, wk in pairs if wk != NO_PFR]
    pfr = {
        "pass": pd.DataFrame([{**base(t, o, wk, f"pq-{t}"), "passing_bad_throws": 3} for t, o, wk in posted]),
        "rush": pd.DataFrame([{**base(t, o, wk, f"pb-{t}"), "carries": 20, "rushing_yards_before_contact": 40,
                               "rushing_yards_after_contact": 30 + (20 if t == "AAA" and wk >= 4 else 0),
                               "rushing_broken_tackles": 1} for t, o, wk in posted]),
        "rec": pd.DataFrame([{**base(t, o, wk, f"pr-{t}"), "receiving_drop": 1} for t, o, wk in posted]),
        "defense": pd.DataFrame([{**base(t, o, wk, f"pd-{t}"), "def_pressures": 3 + (4 if t == "AAA" and wk >= 4 else 0), "def_sacks": 1,
                                  "def_tackles_combined": 6, "def_missed_tackles": 1, "def_targets": 6, "def_completions_allowed": 4,
                                  "def_yards_allowed": 50, "def_receiving_td_allowed": 0, "def_ints": 0} for t, o, wk in posted]),
    }
    snap_rows = []
    for t, o, wk in pairs:
        if wk == NO_PFR:
            continue
        for pid_, pos, off, de in ((f"pq-{t}", "QB", 1.0, 0.0), (f"pr-{t}", "WR", 0.9, 0.0), (f"pb-{t}", "RB", 0.6, 0.0), (f"pd-{t}", "DE", 0.0, 0.8)):
            snap_rows.append(dict(game_id="x", season=2026, game_type="REG", week=wk, player=pid_, pfr_player_id=pid_, position=pos, team=t,
                                  opponent=o, offense_snaps=60 * off, offense_pct=off, defense_snaps=60 * de, defense_pct=de, st_snaps=0, st_pct=0))
    roster = pd.DataFrame([
        row for t in TEAMS for row in (
            dict(gsis_id=f"q-{t}", pfr_id=f"pq-{t}", full_name=f"Quinn {t}", position="QB", team=t),
            dict(gsis_id=f"r-{t}", pfr_id=f"pr-{t}", full_name=f"Rex {t}", position="WR", team=t),
            dict(gsis_id=f"b-{t}", pfr_id=f"pb-{t}", full_name=f"Rob {t}", position="RB", team=t),
            dict(gsis_id=f"d-{t}", pfr_id=f"pd-{t}", full_name=f"Dan {t}", position="DE", team=t),
            dict(gsis_id=f"k-{t}", pfr_id=f"pk-{t}", full_name=f"Kip {t}", position="K", team=t),
            dict(gsis_id=f"u-{t}", pfr_id=f"pu-{t}", full_name=f"Upton {t}", position="P", team=t),
        )
    ])
    # The defender's play-by-play id is not used; his PFR row carries pfr id pd-T, which the roster maps to d-T.
    return {"pbp": pbp, "roster": roster, "snaps": pd.DataFrame(snap_rows), **pfr}


def built(team="AAA"):
    return b.build(sources(), 2026, team)


def player(out, pid):
    return next(p for p in out["players"] if p["id"] == pid)


def stat(p, key):
    return next(s for s in p["stats"] if s["k"] == key)


def test_percentiles_put_the_best_at_100_and_flip_for_lower_is_better():
    assert b.percentiles({"a": 1.0, "b": 2.0, "c": 3.0}, True) == {"a": 0.0, "b": 50.0, "c": 100.0}
    assert b.percentiles({"a": 1.0, "b": 2.0, "c": 3.0}, False) == {"a": 100.0, "b": 50.0, "c": 0.0}


def test_grades_are_50_at_the_average_and_ten_points_per_standard_deviation():
    got = b.grades({"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0, "e": 5.0}, True)
    assert got["c"] == 50.0
    assert abs(got["e"] - (50 + 10 * 2 / 2 ** 0.5)) < 0.1 and got["a"] < got["b"] < got["c"]
    # A lower number is the better one for a stat like bad throws, so the scale flips.
    flipped = b.grades({"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0, "e": 5.0}, False)
    assert flipped["a"] == got["e"] and flipped["e"] == got["a"]


def test_a_grade_has_no_ceiling_so_the_best_player_can_still_be_seen_improving():
    before = b.grades({"star": 5.0, **{c: float(i) for i, c in enumerate("abcde")}}, True)["star"]
    after = b.grades({"star": 9.0, **{c: float(i) for i, c in enumerate("abcde")}}, True)["star"]
    assert after > before


def test_everyone_equal_is_everyone_average():
    assert b.grades({"a": 2.0, "b": 2.0, "c": 2.0}, True) == {"a": 50.0, "b": 50.0, "c": 50.0}


def test_a_tie_for_the_best_value_is_100_for_everyone_in_it():
    # Nobody is better than a receiver with no drops, so a quiet week cannot look like a slide.
    got = b.percentiles({"a": 0.0, "b": 0.0, "c": 0.0, "d": 0.2}, False)
    assert got["a"] == got["b"] == got["c"] == 100.0 and got["d"] == 0.0


def test_one_player_cannot_be_ranked_against_nobody():
    assert b.percentiles({"a": 1.0}, True) == {}


def test_form_is_a_teams_last_finished_games_not_the_calendar():
    form, earlier = b.window_of({1: "BBB", 2: "CCC", 4: "BBB", 5: "CCC"})
    assert form == {4, 5} and earlier == {1, 2}


def test_a_game_still_being_played_is_left_out_and_a_bye_does_not_break_the_windows():
    out = built()
    assert out["week"] == 5
    assert out["weeks"] == [1, 2, 3, 4, 5]
    assert out["opp"]["AAA"] == {"1": "BBB", "2": "CCC", "4": "BBB", "5": "CCC"}
    assert out["formWeeks"] == [4, 5]


def test_a_quarterback_whose_efficiency_jumps_in_his_last_two_games_is_a_riser():
    out = built()
    qb = player(out, "q-AAA")
    assert qb["mover"] and qb["mover"]["score"] > 0
    epa = stat(qb, "epaDb")
    assert epa["form"]["v"] > epa["earlier"]["v"] and epa["delta"] > 0
    assert epa["season"]["n"] == 30 * 4


def test_rivals_who_did_not_change_are_not_movers():
    out = b.build(sources(), 2026, "CCC")
    qb = player(out, "q-CCC")
    assert qb["mover"] is None or abs(qb["mover"]["score"]) < 6


def test_rates_that_need_pfr_leave_out_a_game_pfr_has_not_posted():
    out = built()
    qb = player(out, "q-AAA")
    bad = stat(qb, "badThrow")
    # 25 attempts a game in weeks 1, 2 and 4; week 5's attempts would dilute the rate if they were counted.
    assert bad["season"]["n"] == 75
    assert abs(bad["season"]["v"] - 9 / 75) < 1e-6
    rec = player(out, "r-AAA")
    assert stat(rec, "drop")["season"]["n"] == 75


def test_defenders_use_the_weeks_pfr_has_posted_for_their_own_windows():
    out = built()
    assert out["defWeek"] == 4
    assert out["defFormWeeks"] == [2, 4]
    de = player(out, "d-AAA")
    press = stat(de, "pressRate")
    assert press["form"]["v"] > press["earlier"]["v"]


def test_snap_share_ignores_a_game_with_no_snap_counts_yet():
    out = built()
    rec = player(out, "r-AAA")
    # Week 5 has no snap counts, so the form window is week 4 alone and he still reads 0.9, not 0.45.
    assert rec["snaps"]["form"] == [0.9, 1, 1]
    assert rec["snaps"]["season"] == [0.9, 3, 3]


def test_an_unrostered_pfr_player_is_matched_by_name_within_his_team():
    src = sources()
    src["roster"].loc[src["roster"]["gsis_id"] == "r-AAA", "pfr_id"] = np.nan
    src["rec"]["pfr_player_name"] = src["rec"]["pfr_player_name"].replace({"pr-AAA": "Rex AAA"})
    src["snaps"]["player"] = src["snaps"]["player"].replace({"pr-AAA": "Rex AAA"})
    out = b.build(src, 2026, "AAA")
    assert stat(player(out, "r-AAA"), "drop")["season"]["n"] == 75


def test_nothing_is_built_before_a_game_is_finished():
    src = sources()
    src["pbp"] = src["pbp"][src["pbp"]["desc"] != "END GAME"]
    assert b.build(src, 2026, "AAA")["players"] == []


def test_the_file_is_written_only_when_the_numbers_change(tmp_path, monkeypatch, capsys):
    out = tmp_path / "players.json"
    monkeypatch.setattr(b, "load", lambda season, folder: sources())
    assert b.main(["--season", "2026", "--team", "AAA", "--out", str(out)]) == 0
    first = out.read_text()
    logs = (tmp_path / "player-logs.json").read_text()
    assert b.main(["--season", "2026", "--team", "AAA", "--out", str(out)]) == 0
    assert out.read_text() == first and (tmp_path / "player-logs.json").read_text() == logs
    assert "data unchanged" in capsys.readouterr().out
    assert "_logs" not in json.loads(first) and "logs" in json.loads(logs)


# ------------------------------------------------------------------------------------------ the league-wide additions


def test_a_player_is_ranked_with_the_best_first_and_a_tie_shares_the_better_place():
    assert b.ranks({"a": 3.0, "b": 1.0, "c": 3.0, "d": 2.0}, True) == {"a": 1, "c": 1, "d": 3, "b": 4}
    assert b.ranks({"a": 3.0, "b": 1.0, "c": 2.0}, False) == {"b": 1, "c": 2, "a": 3}


def test_more_plays_behind_a_rate_make_it_less_uncertain_and_a_zero_is_never_certain():
    st = b.Stat("x", "n", True, (1, 1, 1))
    small, big = b.standard_error(st, 2, 10), b.standard_error(st, 20, 100)
    assert big < small
    assert b.standard_error(st, 0, 8) > 0
    per = b.Stat("x", "n", True, (1, 1, 1), se=1.5)
    assert abs(b.standard_error(per, 0, 9) - 0.5) < 1e-9
    assert b.standard_error(st, 1, 0) is None


def test_a_field_goal_is_judged_against_the_distance_it_was_kicked_from():
    rows = [dict(play_type="field_goal", kick_distance=d, field_goal_result="made" if (d < 45 or i % 3 == 0) else "missed")
            for i, d in enumerate([25, 30, 35, 40, 44, 48, 52, 55, 58] * 4)]
    p = b.fit_fg(pd.DataFrame(rows))
    assert p(30.0) > p(50.0) > p(58.0)


def test_slugs_are_the_name_and_a_team_or_id_piece_only_when_two_players_share_it():
    src = sources()
    src["roster"].loc[src["roster"]["gsis_id"] == "r-BBB", "full_name"] = "Rex AAA"
    out = b.build(src, 2026, "AAA")
    slugs = {p["id"]: p["slug"] for p in out["players"]}
    assert slugs["r-AAA"] == "rex-aaa" or slugs["r-BBB"] == "rex-aaa"
    assert slugs["r-AAA"] != slugs["r-BBB"]
    assert len(set(slugs.values())) == len({p["id"] for p in out["players"]})


def test_every_player_row_carries_rank_uncertainty_and_the_leagues_yardstick():
    out = built()
    qb = player(out, "q-AAA")
    epa = stat(qb, "epaDb")
    assert epa["season"]["r"] == 1 and epa["season"]["se"] > 0 and epa["season"]["g"] > 50
    assert out["yard"]["qb"]["epaDb"]["n"] == 6
    assert len(out["yard"]["qb"]["epaDb"]["q"]) == 5
    assert out["leagueN"]["qb"] == 6
    assert "z" in epa and "z" in qb["mover"]


def test_a_stat_that_is_only_style_is_shown_but_never_moves_a_player():
    out = built()
    qb = player(out, "q-AAA")
    adot = stat(qb, "adot")
    assert adot["season"]["v"] == 8.0 and "g" not in adot["season"] and "delta" not in adot


def test_a_kicker_is_graded_over_the_field_goals_the_league_expects_him_to_make():
    out = built()
    aaa = stat(player(out, "k-AAA"), "fgOe")
    other = stat(player(out, "k-EEE"), "fgOe")
    assert aaa["season"]["v"] > other["season"]["v"] and aaa["season"]["r"] == 1


def test_a_punt_returner_is_scored_from_the_returning_teams_side_of_the_play():
    out = built()
    pr = [p for p in out["players"] if p["group"] == "pr" and p["id"] == "r-AAA"]
    assert pr and stat(pr[0], "epaRet")["season"]["v"] > 0  # the punting team's -0.2 is the returning team's +0.2


def test_one_person_in_two_roles_has_one_slug_and_two_rows():
    out = built()
    rows = [p for p in out["players"] if p["id"] == "r-AAA"]
    assert {p["group"] for p in rows} == {"wr", "pr"} and len({p["slug"] for p in rows}) == 1


def test_comparables_are_in_the_same_group_and_never_the_player_himself():
    out = built()
    qb = player(out, "q-AAA")
    by_slug = {p["slug"]: p for p in out["players"]}
    assert qb["like"] and qb["slug"] not in qb["like"]
    assert all(by_slug[s]["group"] == "qb" for s in qb["like"])


def test_the_trail_has_the_games_the_player_played_the_percentile_after_each_and_his_snap_share():
    out = b.build(sources(), 2026, "AAA")
    logs = out["_logs"]["logs"]
    qb = player(out, "q-AAA")
    trail = logs[qb["slug"]]["qb"]["g"]["epaDb"]
    assert [t[0] for t in trail] == [1, 2, 4, 5]
    assert all(len(t) == 4 for t in trail)
    # AAA is the best offense from week 4 on, so by then he is at the top of the league's quarterbacks.
    assert trail[-1][3] == 100.0
    assert [s[0] for s in logs[qb["slug"]]["qb"]["s"]] == [1, 2, 4]  # week 5 has no snap counts yet


# ---------------------------------------------------------------------------------------------- profiles: bios, results, wins


def test_results_come_from_the_last_plays_running_score_and_are_seen_from_both_sides():
    pbp = pd.DataFrame({
        "game_id": ["g1", "g1", "g2"], "play_id": [1, 2, 1], "week": [1, 1, 2],
        "home_team": ["AAA", "AAA", "BBB"], "away_team": ["BBB", "BBB", "CCC"],
        "total_home_score": [0, 27, 3], "total_away_score": [0, 20, 3],
    })
    games = pd.DataFrame({"game_id": ["g1"], "week": [1], "teams": [["AAA", "BBB"]]})
    assert b.game_results(pbp, games) == {"AAA": {1: [27, 20]}, "BBB": {1: [20, 27]}}  # g2 is not finished
    assert b.game_results(pbp.drop(columns=["total_home_score"]), games) == {}  # an older file without scores still builds


def test_a_better_game_that_goes_with_winning_shows_as_a_higher_win_share():
    rows = [{"id": f"p{i}", "team": f"T{i}"} for i in range(60)]
    # Sixty one-game quarterbacks; the better the game, the more likely the team won (the top 30 won, the bottom 30 lost).
    logs = {(f"p{i}", "qb"): {"g": {"epaDb": [[1, i / 10, 30.0, None]]}} for i in range(60)}
    results = {f"T{i}": {1: [24, 10] if i >= 30 else [10, 24]} for i in range(60)}
    win = b.win_translation(logs, rows, results)["qb"]["epaDb"]
    assert win["n"] == 60 and win["t"][0] == 0.0 and win["t"][2] == 1.0
    # A game with too few plays behind it is not counted, and a thin sample says nothing.
    thin = {k: {"g": {"epaDb": [[1, v["g"]["epaDb"][0][1], 2.0, None]]}} for k, v in logs.items()}
    assert b.win_translation(thin, rows, results) == {}


def test_lower_is_better_stats_flip_before_they_are_cut_into_thirds():
    rows = [{"id": f"p{i}", "team": f"T{i}"} for i in range(60)]
    logs = {(f"p{i}", "qb"): {"g": {"badThrow": [[1, i / 100, 30.0, None]]}} for i in range(60)}
    results = {f"T{i}": {1: [24, 10] if i < 30 else [10, 24]} for i in range(60)}  # the fewer bad throws, the more wins
    win = b.win_translation(logs, rows, results)["qb"]["badThrow"]
    assert win["t"][2] == 1.0 and win["t"][0] == 0.0


def test_the_roster_gives_the_bio_and_leaves_out_what_it_does_not_know():
    roster = pd.DataFrame([
        {"gsis_id": "a", "jersey_number": 89.0, "height": 75.0, "weight": 235, "birth_date": "2002-12-13", "college": "Georgia",
         "draft_club": "LV", "draft_number": 13.0, "entry_year": 2024, "years_exp": 2, "espn_id": 4432665.0},
        {"gsis_id": "b", "jersey_number": np.nan, "height": np.nan, "weight": np.nan, "birth_date": None, "college": None,
         "draft_club": None, "draft_number": np.nan, "entry_year": 2026, "years_exp": 0, "espn_id": np.nan},
    ])
    out = b.bios_of(roster, {"a", "b"}, 2026)
    assert out["a"] == {"no": 89, "ht": 75, "wt": 235, "born": "2002-12-13", "college": "Georgia", "draft": ["LV", 13, 2024], "exp": 2, "espn": 4432665}
    assert out["b"] == {"exp": 0}  # an undrafted rookie with nothing else on file


def test_the_game_by_game_box_score_adds_up_to_the_season_total():
    out = built()
    logs = out["_logs"]["logs"]
    checked = 0
    for p in out["players"]:
        bx = logs.get(p["slug"], {}).get(p["group"], {}).get("b")
        if not bx:
            continue
        for k, pts in bx.items():
            if k in p["box"]:
                assert abs(sum(v for _, v in pts) - p["box"][k]) < 0.51
                checked += 1
    assert checked > 0
    assert set(out["_logs"]) >= {"bio", "res", "win"}


def test_the_volume_beside_each_game_is_the_sample_and_adds_up_to_the_seasons():
    # A receiver's target share is over his team's pass attempts, but the volume a reader sees beside each game must be his
    # targets, so the games add up to the targets on his season line (never to the team's attempts).
    out = built()
    logs = out["_logs"]["logs"]
    checked = 0
    for p in out["players"]:
        trail = logs.get(p["slug"], {}).get(p["group"], {}).get("g", {})
        for s in p["stats"]:
            pts = trail.get(s["k"])
            if pts:
                assert abs(sum(t[2] for t in pts) - s["season"]["n"]) < 0.6, (p["name"], s["k"])
                checked += 1
    assert checked > 0
    share = [s for p in out["players"] if p["group"] in ("wr", "te") for s in p["stats"] if s["k"] == "share"]
    assert share, "the fixture should have a receiver with a target share"


# ---------------------------------------------------------------------------------------------- situational football


def test_a_distance_is_put_in_its_bucket():
    assert [sit.bucket(d) for d in (1, 3, 4, 6, 7, 10, 11, 25)] == ["S", "S", "M", "M", "L", "L", "X", "X"]


def test_every_play_lands_in_one_down_by_distance_cell_and_the_game_by_game_plays_match_them():
    out = built()
    s = out["_sit"]
    assert s["players"]
    checked = 0
    for slug, roles in s["players"].items():
        for role, e in roles.items():
            cells_n = sum(c[0] for c in e["c"].values())
            plays_n = sum(len(v) for v in e["p"].values())
            assert cells_n == plays_n, (slug, role)
            assert sum(c[2] for c in e["c"].values()) == sum(pl[5] for v in e["p"].values() for pl in v)
            assert sum(c[1] for c in e["c"].values()) == sum(pl[4] for v in e["p"].values() for pl in v)
            checked += 1
    assert checked >= 6
    rb = s["players"][player(out, "b-AAA")["slug"]]["rush"]
    assert rb["g"] == "rb"
    assert {k.split(".")[0] for k in rb["c"]} == {"1", "2", "3", "4"}
    # the red zone is the plays inside the 20: the fixture's 15-yard line
    inside = sum(1 for v in rb["p"].values() for pl in v if pl[3] <= sit.RED_ZONE)
    assert rb["rz"][0] == inside


def test_a_quarterbacks_dropbacks_include_his_sacks_and_a_target_is_a_pass_to_a_receiver():
    out = built()
    s = out["_sit"]
    qb = s["players"][player(out, "q-AAA")["slug"]]["pass"]
    wr = s["players"][player(out, "r-AAA")["slug"]]["rec"]
    sacks = sum(1 for v in qb["p"].values() for pl in v if pl[7] & sit.SACK)
    assert sacks > 0
    assert sum(len(v) for v in qb["p"].values()) > sum(len(v) for v in wr["p"].values())  # a sack has no target
    assert all(not (pl[7] & sit.SACK) for v in wr["p"].values() for pl in v)


def test_the_league_row_is_the_sum_of_its_players_and_the_yardstick_needs_enough_peers():
    out = built()
    s = out["_sit"]
    assert set(s["league"]) <= set(sit.COMBOS)
    mine = [e for roles in s["players"].values() for r, e in roles.items() if r == "rush" and e["g"] == "rb"]
    assert s["league"]["rush.rb"]["all"][0] == sum(sum(c[0] for c in e["c"].values()) for e in mine)
    # six teams are fewer than the eight peers a yardstick needs
    assert s["yard"] == {}


def test_nothing_situational_is_built_without_the_down_and_distance_columns():
    src = sources()
    src["pbp"] = src["pbp"].drop(columns=["down", "ydstogo"])
    out = b.build(src, 2026, "AAA")
    assert out["_sit"]["players"] == {}


def test_the_situations_file_is_written_beside_the_others(tmp_path, monkeypatch):
    monkeypatch.setattr(b, "load", lambda season, folder: sources())
    assert b.main(["--season", "2026", "--out", str(tmp_path / "players.json")]) == 0
    sit_file = json.loads((tmp_path / "player-situations.json").read_text())
    assert sit_file["season"] == 2026 and sit_file["players"] and "source" in sit_file



# ---------------------------------------------------------------------------------------------- stabilizing, windows, linemen


def test_stabilizing_pulls_a_thin_sample_toward_the_league_so_a_zero_on_few_plays_does_not_tie_for_first():
    # Three cornerbacks with a 0% missed-tackle rate on 6, 16 and 60 chances, and others around 12%.
    items = {"a": (0.0, 0.06), "b": (0.0, 0.03), "c": (0.0, 0.015), **{f"x{i}": (0.10 + 0.01 * i, 0.04) for i in range(8)}}
    shr, rel, sd = b.stabilize(items)
    assert shr["c"] < shr["b"] < shr["a"]  # more plays, less pulled back toward the mean
    assert shr["a"] > 0.0 and sd > 0


def test_reliability_is_near_zero_when_the_spread_is_only_sampling_noise_and_high_when_it_is_real():
    noise = {f"p{i}": (0.10 + (0.02 if i % 2 else -0.02), 0.05) for i in range(20)}
    real = {f"p{i}": (0.10 + 0.01 * i, 0.005) for i in range(20)}
    assert b.stabilize(noise)[1] < 0.1
    assert b.stabilize(real)[1] > 0.8


def test_a_player_with_no_standard_error_keeps_his_value():
    shr, rel, _ = b.stabilize({"a": (1.0, None), "b": (2.0, None), "c": (3.0, None)})
    assert shr == {"a": 1.0, "b": 2.0, "c": 3.0} or rel >= 0


def test_the_recent_stretch_grows_to_about_a_third_of_the_games_played_and_never_below_two():
    assert [b.form_size(n) for n in (2, 4, 5, 8, 12, 17)] == [2, 2, 2, 3, 4, 6]
    form, earlier = b.window_of({w: "X" for w in range(1, 13)})
    assert len(form) == 4 and len(earlier) == 8


def test_a_nickname_is_matched_by_last_name_and_first_initial_only_when_that_is_unique_on_the_team():
    to_gsis = {"someone-else": "x1"}
    df = pd.DataFrame({"pfr_player_id": ["zz"], "player": ["Delmar Glaze"], "team": ["LV"]})
    got = b.attach_ids(df, "player", to_gsis, {("~" + b.short_key("DJ Glaze"), "LV"): "g1"})
    assert got["id"].tolist() == ["g1"]
    other = b.attach_ids(df, "player", to_gsis, {("~" + b.short_key("Mike Glaze"), "LV"): "g2"})
    assert other["id"].isna().all()


def line_fixture():
    snaps = pd.DataFrame([
        dict(id=i, team="AAA", week=w, offense_snaps=60 * p, offense_pct=p, position="T")
        for i, w, p in (("ol1", 1, 1.0), ("ol1", 2, 1.0), ("ol2", 1, 1.0), ("ol2", 2, 0.2), ("qq", 1, 1.0))
    ])
    grp = {"ol1": "ol", "ol2": "ol", "qq": "qb"}
    plays = []
    for w in (1, 2):
        for i in range(10):
            plays.append(dict(week=w, posteam="AAA", play_type="pass", epa=0.1, qb_dropback=1, sack=1 if i < 2 else 0, success=1, qb_scramble=0, penalty=0, desc="x"))
        for i in range(10):
            plays.append(dict(week=w, posteam="AAA", play_type="run", epa=0.0, qb_dropback=0, sack=0, success=1 if i < 4 else 0, qb_scramble=0, penalty=0, desc="x"))
    raw = pd.DataFrame(plays + [
        dict(week=1, posteam="AAA", play_type="no_play", epa=np.nan, penalty=1, penalty_team="AAA", penalty_player_id="ol1", penalty_type="Offensive Holding", desc="PENALTY on AAA-1, Offensive Holding, enforced"),
        dict(week=2, posteam="AAA", play_type="no_play", epa=np.nan, penalty=1, penalty_team="AAA", penalty_player_id="ol1", penalty_type="False Start", desc="PENALTY on AAA-1, False Start, declined"),
        dict(week=2, posteam="AAA", play_type="no_play", epa=np.nan, penalty=1, penalty_team="BBB", penalty_player_id="d1", penalty_type="Defensive Offside", desc="PENALTY on BBB-9, enforced"),
    ])
    pbp = raw[raw["penalty"] != 1]
    return raw, pbp, snaps, grp


def test_an_offensive_lineman_gets_his_snaps_his_accepted_penalties_and_his_lines_results_in_games_he_started():
    raw, pbp, snaps, grp = line_fixture()
    out = b.line_components(raw, pbp, snaps, grp, {("AAA", 1), ("AAA", 2)}).set_index(["id", "week"])
    assert set(out.index.get_level_values(0)) == {"ol1", "ol2"}  # the quarterback is not a lineman
    assert out.loc[("ol1", 1), "pen"] == 1 and out.loc[("ol1", 1), "hold"] == 1
    # A declined flag and a penalty on the other team are not his.
    assert out.loc[("ol1", 2), "pen"] == 0
    # He started in week 1 and week 2; the other lineman started week 1 only (20% of the snaps in week 2).
    assert out.loc[("ol1", 2), "u_db"] == 10 and out.loc[("ol1", 2), "u_sck"] == 2
    assert out.loc[("ol2", 2), "u_db"] == 0 and out.loc[("ol2", 1), "u_run"] == 10 and out.loc[("ol2", 1), "u_rs"] == 4


def test_linemen_are_graded_as_their_own_group_with_the_line_stats_marked_as_shared():
    assert "ol" in b.GROUP_ORDER and b.SIDE_OF["ol"] == "off"
    assert b.GROUPS["ol"].headline == "runSucc"
    assert b.GROUPS["ol"].stats["sackRate"].higher is False and b.GROUPS["ol"].stats["snapShare"].higher is None


def test_a_game_pfr_has_not_posted_is_not_in_yet_rather_than_a_zero():
    # Sacks, pressures, interceptions and missed tackles come from PFR's table, which posts after play-by-play. For a game it has not
    # posted the box score leaves them out (the game log prints a dash) instead of showing a 0 the player never had.
    weeks_of = {"LV": {1: "a", 2: "b", 4: "c"}}
    assert b.posted(weeks_of, "LV", 4) and not b.posted(weeks_of, "LV", 5)
    assert not b.posted(weeks_of, "KC", 1)
    assert b.PFR_BOX == {"sacks", "press", "ints", "missed"}


def test_a_defenders_passer_rating_is_the_rating_of_his_season_line_not_an_average_of_weekly_ratings():
    # Hezekiah Masses, 2026 weeks 1-4: 1, 5, 8 and 6 targets. Weekly ratings are 39.6, 9.2, 33.3 and 120.8 (an average weighted by
    # targets is 53.9), but the four weeks together are 20 targets, 9 catches, 126 yards, 1 touchdown and 3 interceptions: 42.9.
    weeks = pd.DataFrame(
        {"tgts": [1, 5, 8, 6], "cmp": [0, 2, 4, 3], "yds": [0, 16, 56, 54], "td": [0, 0, 0, 1], "ints": [0, 2, 1, 0]}, index=["m"] * 4
    )
    tot = weeks.groupby(level=0).sum()
    value, volume, _, _ = b.slice_values(tot, b.Stat("tgts", "tgts", False, (10, 5, 5), calc="rating"))["m"]
    assert round(value, 1) == 42.9 and volume == 20
    weekly = [b.passer_rating(*r) for r in weeks[["tgts", "cmp", "yds", "td", "ints"]].itertuples(index=False)]
    assert round(sum(w * t for w, t in zip(weekly, weeks["tgts"])) / 20, 1) == 53.9


def test_a_lines_shared_numbers_never_count_toward_a_lineman_or_his_look_alikes():
    ol = b.GROUPS["ol"].stats
    assert ol["runSucc"].unit and ol["sackRate"].unit and not ol["runSucc"].counts and not ol["sackRate"].counts
    assert ol["penRate"].counts and not ol["penRate"].unit
    # Two linemen on one line share every unit grade, and a third on another line is far from both on those grades; the match is
    # made on what is each man's own (penalties), so the third man, whose penalties match, is the closest.
    def row(pid, unit, pen, hold, fs):
        g = lambda k, v: {"k": k, "season": {"g": v}}
        return {"id": pid, "stats": [g("runSucc", unit), g("sackRate", unit), g("penRate", pen), g("holdRate", hold), g("fsRate", fs)]}
    rows = [row("a", 70, 40, 40, 40), row("b", 70, 62, 62, 62), row("c", 30, 41, 41, 41)]
    assert b.comparables(rows, "ol")["a"][0] == "c"
