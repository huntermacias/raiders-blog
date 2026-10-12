import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_players as b  # noqa: E402

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
                cpoe=np.nan if sack else 1.0, cp=np.nan if sack else 0.6, xyac_mean_yardage=np.nan if sack else 2.0, penalty=0, desc="x"))
            pid += 1
        for i in range(20):
            rows.append(dict(
                game_id=gid, play_id=pid, week=week, season_type="REG", posteam=team, defteam=other, play_type="run",
                epa=epa, success=1 if epa > 0 else 0, yards_gained=12 if i % 5 == 0 else 3, pass_attempt=0, complete_pass=0,
                qb_dropback=0, qb_scramble=0, interception=0, sack=0, air_yards=np.nan, yards_after_catch=np.nan,
                receiver_player_id=None, passer_player_id=None, rusher_player_id=f"b-{team}", cpoe=np.nan, cp=np.nan,
                xyac_mean_yardage=np.nan, penalty=0, desc="x"))
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
    assert [g["w"] for g in out["games"]] == [1, 2, 4, 5]
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
    assert rec["snaps"]["form"] == 0.9


def test_an_unrostered_pfr_player_is_matched_by_name_within_his_team():
    src = sources()
    src["roster"].loc[src["roster"]["gsis_id"] == "r-AAA", "pfr_id"] = np.nan
    src["rec"]["pfr_player_name"] = src["rec"]["pfr_player_name"].replace({"pr-AAA": "Rex AAA"})
    src["snaps"]["player"] = src["snaps"]["player"].replace({"pr-AAA": "Rex AAA"})
    out = b.build(src, 2026, "AAA")
    assert stat(player(out, "r-AAA"), "drop")["season"]["n"] == 75


def test_a_team_with_no_finished_games_gives_no_players():
    assert b.build(sources(), 2026, "ZZZ")["players"] == []


def test_the_file_is_written_only_when_the_numbers_change(tmp_path, monkeypatch, capsys):
    out = tmp_path / "players.json"
    monkeypatch.setattr(b, "load", lambda season, folder: sources())
    assert b.main(["--season", "2026", "--team", "AAA", "--out", str(out)]) == 0
    first = out.read_text()
    assert b.main(["--season", "2026", "--team", "AAA", "--out", str(out)]) == 0
    assert out.read_text() == first
    assert "data unchanged" in capsys.readouterr().out
    json.loads(first)
