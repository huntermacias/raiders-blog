import gzip
import json
import sys

import pandas as pd
import pytest

import build_flags as bf


def pbp(rows: list[dict]) -> pd.DataFrame:
    base = {c: None for c in bf.COLS}
    out = []
    for i, r in enumerate(rows, start=1):
        row = {**base, "game_id": "2026_05_LV_KC", "play_id": i * 10, "season": 2026, "season_type": "REG", "week": 5, "game_date": "2026-10-11",
               "home_team": "KC", "posteam": "LV", "defteam": "KC", "qtr": 2, "time": "08:00", "down": 1, "ydstogo": 10, "yrdln": "LV 25",
               "score_differential": 0, "play_type": "pass", "penalty": 0, "epa": 0.0, "wpa": 0.0, "first_down_penalty": 0, "desc": "x", **r}
        out.append(row)
    return pd.DataFrame(out)


def one(rows, which=-1):
    flags = bf.build_flags(pbp(rows))
    return flags[which]


PASS = {"play_type": "pass", "passer_player_id": "00-0000001", "passer_player_name": "J.Qb", "desc": "(5:00) 1-J.Qb pass short left to 2-X.Y for 5 yards."}


def flag(**kw):
    base = {"penalty": 1, "play_type": "no_play", "penalty_team": "LV", "penalty_player_id": "00-0000009", "penalty_player_name": "P.Lineman",
            "penalty_type": "Offensive Holding", "penalty_yards": 10, "desc": "(3:00) 5-X.Y run. PENALTY on LV-70-P.Lineman, Offensive Holding, 10 yards - No Play."}
    return {**base, **kw}


def test_cost_is_positive_when_it_hurts_the_team_that_committed_it():
    # EPA is from the offense's side. The offense holds: EPA drops, cost is positive. The defense is flagged: EPA rises, cost is positive.
    off = one([flag(epa=-1.5, wpa=-0.03)])
    assert off["t"] == "LV" and off["o"] == "KC" and off["c"] == 1.5 and off["wp"] == -3.0 and off["u"] == "offense"
    dfn = one([flag(penalty_team="KC", penalty_type="Defensive Holding", epa=2.0, wpa=0.04)])
    assert dfn["t"] == "KC" and dfn["o"] == "LV" and dfn["c"] == 2.0 and dfn["wp"] == -4.0 and dfn["u"] == "defense"


def test_a_flag_that_helps_the_team_has_a_negative_cost():
    f = one([flag(epa=0.3)])
    assert f["c"] == -0.3


def test_roughing_the_kicker_on_fourth_down_is_a_gift():
    f = one([flag(penalty_team="KC", down=4, ydstogo=7, penalty_type="Roughing the Kicker", penalty_yards=15, first_down_penalty=1, epa=3.2,
                  desc="(10:20) 16-C.Johnston punts 49 yards to KC 2, downed. PENALTY on KC-92-Z.Sieler, Roughing the Kicker, 15 yards - No Play.")])
    assert "gift" in f["tg"] and f["au"] == 1 and f["pl"] == "punt" and f["u"] == "special" and f["ck"] == "player" and f["pn"] == "P.Lineman"


def test_a_defensive_flag_on_third_down_is_not_a_gift():
    f = one([flag(penalty_team="KC", down=3, penalty_type="Defensive Holding", first_down_penalty=1, epa=1.1)])
    assert "gift" not in f["tg"]


def test_an_offensive_flag_on_fourth_down_is_not_a_gift():
    f = one([flag(down=4, first_down_penalty=0, epa=-0.5)])
    assert "gift" not in f["tg"]


def test_a_defence_that_loses_its_own_takeaway_to_its_own_flag():
    d = "(2:11) 2-S.R pass deep left INTERCEPTED by 0-W.Johnson at KC -5. PENALTY on KC-16-M.Melton, Illegal Contact, 5 yards - No Play."
    f = one([flag(penalty_team="KC", penalty_type="Illegal Contact", epa=1.1, desc=d)])
    assert "wipedTurnover" in f["tg"] and f["np"] == 1
    # an offensive flag on a play that was an interception does not make the interception go away
    g = one([flag(penalty_team="LV", epa=-1.0, desc="(2:11) pass INTERCEPTED by 0-W.Johnson. PENALTY on LV-70-P.Lineman, Offensive Holding - No Play.")])
    assert "wipedTurnover" not in g["tg"]


def test_a_fumble_recovery_counts_only_when_the_flagged_defence_recovered_it():
    mine = "(3:00) 2-X FUMBLES, recovered by KC-55-D.Jones at LV 40. PENALTY on KC-9-Z, Defensive Offside, 5 yards - No Play."
    theirs = "(3:00) 2-X FUMBLES, recovered by LV-12-A.B at LV 40. PENALTY on KC-9-Z, Defensive Offside, 5 yards - No Play."
    assert "wipedTurnover" in one([flag(penalty_team="KC", penalty_type="Defensive Offside", epa=0.6, desc=mine)])["tg"]
    assert "wipedTurnover" not in one([flag(penalty_team="KC", penalty_type="Defensive Offside", epa=0.6, desc=theirs)])["tg"]


def test_a_touchdown_that_did_not_count_because_of_the_scorer_s_own_flag():
    f = one([flag(penalty_team="KC", epa=1.4, desc="(:50) punts 55 yards. 15-L.M for 57 yards, TOUCHDOWN NULLIFIED by Penalty. PENALTY on KC-58-M.Wax, Roughing the Kicker - No Play.")])
    assert "wipedTouchdown" in f["tg"]


def test_big_means_most_of_a_turnover():
    limit = bf.BIG_SHARE * bf.TURNOVER_COST
    assert "big" in one([flag(epa=-limit)])["tg"]
    assert "big" not in one([flag(epa=-(limit - 0.05))])["tg"]


def test_turnover_cost_is_what_the_2025_and_2026_giveaways_cost():
    assert 4.2 < bf.TURNOVER_COST < 4.6


def test_a_delay_of_game_is_the_quarterback_s_from_the_nearest_pass_play():
    rows = [PASS, flag(penalty_type="Delay of Game", penalty_player_id=None, penalty_player_name=None, desc="(1:00) (Shotgun) PENALTY on LV, Delay of Game, 5 yards - No Play.", epa=-0.4)]
    f = one(rows)
    assert (f["ck"], f["pid"], f["pn"]) == ("qb", "00-0000001", "J.Qb") and f["pl"] == "snap"


def test_a_delay_of_game_uses_a_later_pass_when_none_came_before():
    rows = [flag(penalty_type="Delay of Game", penalty_player_id=None, penalty_player_name=None, desc="(1:00) PENALTY on LV, Delay of Game - No Play."), PASS]
    assert bf.build_flags(pbp(rows))[0]["pid"] == "00-0000001"


def test_only_the_offence_s_quarterback_is_charged():
    other = {**PASS, "posteam": "KC", "defteam": "LV", "passer_player_id": "00-0000002", "passer_player_name": "K.Other"}
    rows = [other, PASS, flag(penalty_type="Delay of Game", penalty_player_id=None, penalty_player_name=None, desc="(1:00) PENALTY on LV, Delay of Game - No Play.")]
    assert one(rows)["pid"] == "00-0000001"


def test_a_delay_of_game_with_the_punt_unit_on_is_the_team_s():
    f = one([PASS, flag(penalty_type="Delay of Game", penalty_player_id=None, down=4, desc="(:30) (Punt formation) PENALTY on LV, Delay of Game, 5 yards - No Play.")])
    assert f["ck"] == "team" and f["pid"] is None


def test_a_delay_of_game_with_no_quarterback_on_file_goes_to_the_team():
    assert one([flag(penalty_type="Delay of Game", penalty_player_id=None, desc="(1:00) PENALTY on LV, Delay of Game - No Play.")])["ck"] == "team"


@pytest.mark.parametrize("ptype", ["Defensive Too Many Men on Field", "Offensive Too Many Men on Field", "Illegal Substitution", "Defensive Delay of Game"])
def test_coaching_flags_belong_to_the_team_even_with_a_name_attached(ptype):
    f = one([flag(penalty_type=ptype, penalty_player_id="00-0000009", penalty_player_name="Someone")])
    assert f["ck"] == "team" and f["pid"] is None and f["pn"] is None


def test_a_flag_that_names_nobody_goes_to_the_team():
    assert one([flag(penalty_type="Illegal Formation", penalty_player_id=None, penalty_player_name=None)])["ck"] == "team"


def test_only_accepted_regular_season_flags_with_teams_are_kept():
    rows = [
        {"penalty": 0, "desc": "Penalty on KC-9, Offside, declined."},
        flag(season_type="POST"),
        flag(penalty_team=None),
        flag(),
    ]
    assert len(bf.build_flags(pbp(rows))) == 1


def test_team_codes_use_the_site_s_codes():
    f = one([flag(penalty_team="LA", posteam="LA", defteam="KC", yrdln="LA 40")])
    assert f["t"] == "LAR" and f["fp"] == "LAR 40"


def test_the_score_is_from_the_committing_team_s_side():
    assert one([flag(score_differential=7)])["mg"] == 7
    assert one([flag(score_differential=7, penalty_team="KC")])["mg"] == -7


@pytest.mark.parametrize(
    "play_type,desc,kind",
    [
        ("no_play", "(7:27) (No Huddle, Shotgun) PENALTY on PHI, False Start, 5 yards - No Play.", "snap"),
        ("no_play", "(:30) (Punt formation) PENALTY on CIN, Delay of Game - No Play.", "snap"),
        ("no_play", "(4:16) 8-R.S punts 63 yards to MIA 6. PENALTY on MIA, Running Into the Kicker - No Play.", "punt"),
        ("no_play", "(3:00) 1-A pass short left to 2-B. PENALTY on X, Holding - No Play.", "pass"),
        ("no_play", "(3:00) 1-A sacked at LV 20 for -5 yards. PENALTY on X, Holding - No Play.", "pass"),
        ("no_play", "(3:00) 8-O.H left tackle to KC 9 for 6 yards. PENALTY on X, Holding - No Play.", "run"),
        ("no_play", "(15:00) 3-C kicks off. PENALTY on X - No Play.", "kickoff"),
        ("no_play", "(1:00) 4-C 55 yard field goal is GOOD. PENALTY on X - No Play.", "fg"),
        ("pass", "x", "pass"),
        ("kickoff", "x", "kickoff"),
    ],
)
def test_what_kind_of_play_it_was(play_type, desc, kind):
    assert bf.play_kind(play_type, desc) == kind


def test_players_get_a_page_slug_and_two_with_one_name_stay_apart():
    flags = [
        {"pid": "00-0000111", "pn": "Josh Allen", "t": "BUF", "w": 1, "ck": "player"},
        {"pid": "00-0000222", "pn": "Josh Allen", "t": "JAX", "w": 1, "ck": "player"},
        {"pid": "00-0000333", "pn": "Q.Back", "t": "LV", "w": 2, "ck": "qb"},
    ]
    players = bf.build_players(flags, None, {"00-0000111": {"slug": "josh-allen", "pos": "QB"}})
    assert players["00-0000111"]["s"] == "josh-allen" and players["00-0000111"]["p"] == "QB"
    assert players["00-0000222"]["s"] == "josh-allen-0222"
    assert players["00-0000333"]["p"] == "QB"


def test_roster_supplies_full_names_and_positions():
    roster = pd.DataFrame([{"gsis_id": "00-0000111", "full_name": "Josh Allen", "position": "LB"}])
    flags = [{"pid": "00-0000111", "pn": "J.Allen", "t": "JAX", "w": 1, "ck": "player"}]
    p = bf.build_players(flags, roster, {})["00-0000111"]
    assert (p["n"], p["p"], p["s"]) == ("Josh Allen", "LB", "josh-allen")


def test_flags_are_sorted_oldest_first():
    rows = [flag(week=6, game_id="2026_06_LV_KC", game_date="2026-10-18"), flag(week=5)]
    assert [f["w"] for f in bf.build_flags(pbp(rows))] == [5, 6]


def test_the_command_writes_a_file_and_leaves_it_alone_when_nothing_changed(tmp_path, monkeypatch, capsys):
    frame = pbp([PASS, flag(epa=-1.0)])
    with gzip.open(tmp_path / "play_by_play_2026.csv.gz", "wt") as fh:
        frame.to_csv(fh, index=False)
    pd.DataFrame([{"gsis_id": "00-0000009", "full_name": "Pat Lineman", "position": "OT"}]).to_csv(tmp_path / "roster_2026.csv", index=False)
    out = tmp_path / "flags-2026.json"
    argv = ["build_flags.py", "--season", "2026", "--out", str(out), "--folder", str(tmp_path), "--players", str(tmp_path / "none.json")]
    monkeypatch.setattr(sys, "argv", argv)
    assert bf.main() == 0
    data = json.loads(out.read_text())
    assert data["season"] == 2026 and data["week"] == 5 and len(data["flags"]) == 1
    assert data["players"]["00-0000009"]["n"] == "Pat Lineman" and data["turnoverCost"] == bf.TURNOVER_COST
    before = out.read_text()
    assert bf.main() == 0
    assert "nothing changed" in capsys.readouterr().out
    assert out.read_text() == before
