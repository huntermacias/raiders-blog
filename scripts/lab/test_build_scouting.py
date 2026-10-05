import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_scouting as b  # noqa: E402

TEAMS = ["AAA", "BBB", "CCC", "DDD"]


def play(game, home, away, pos, play_type="pass", epa=0.0, yds=5, pid=1, **kw):
    de = away if pos == home else home
    row = dict(
        game_id=game, week=1, season_type="REG", home_team=home, away_team=away, posteam=pos, defteam=de,
        play_type=play_type, down=1, epa=epa, success=1 if epa > 0 else 0, yards_gained=yds,
        pass_attempt=1 if play_type == "pass" else 0, rush_attempt=1 if play_type == "run" else 0,
        qb_dropback=1 if play_type == "pass" else 0, sack=0, qb_scramble=0, third_down_converted=np.nan,
        third_down_failed=np.nan, fixed_drive=1, fixed_drive_result="Punt", yardline_100=70, interception=0,
        fumble_lost=0, wp=0.5, half_seconds_remaining=900, total_home_score=0, total_away_score=0, play_id=pid,
        desc="x", two_point_attempt=0, penalty=0,
    )
    row.update(kw)
    return row


def end(game, home, away, hs, as_, pid=999):
    return play(game, home, away, home, play_type="no_play", epa=np.nan, pid=pid, desc="END GAME", total_home_score=hs, total_away_score=as_)


def league():
    """A round robin: AAA has the best offense (and so, facing the others, the best defense), DDD the worst."""
    rows = []
    pid = 1
    for game, home, away in [("g1", "AAA", "BBB"), ("g2", "CCC", "DDD"), ("g3", "AAA", "CCC"), ("g4", "BBB", "DDD"), ("g5", "AAA", "DDD"), ("g6", "BBB", "CCC")]:
        for pos in (home, away):
            e = {"AAA": 0.4, "BBB": 0.1, "CCC": -0.1, "DDD": -0.4}[pos]
            for _ in range(10):
                rows.append(play(game, home, away, pos, epa=e, pid=pid))
                pid += 1
        rows.append(end(game, home, away, 28 if home == "AAA" else 14, 10))
    return pd.DataFrame(rows)


def test_ranks_one_is_best_on_both_sides_of_the_ball():
    out = b.build(league(), 2026)
    t = out["teams"]
    assert t["AAA"]["off"]["epa"]["rank"] == 1
    assert t["DDD"]["off"]["epa"]["rank"] == 4
    # A defense that allows the least (AAA's opponents are the offenses facing it) ranks 1st.
    # AAA's opponents are the weaker offenses, so it allows the least per play and ranks 1st on defense;
    # DDD faces the best ones and ranks last.
    assert t["AAA"]["def"]["epa"]["rank"] == 1
    assert t["DDD"]["def"]["epa"]["rank"] == 4


def test_every_team_gets_every_measure_and_a_game_count():
    out = b.build(league(), 2026)
    assert set(out["teams"]) == set(TEAMS)
    for team in out["teams"].values():
        assert team["g"] == 3
        for side, spec in (("off", b.OFFENSE), ("def", b.DEFENSE)):
            assert set(team[side]) == set(spec)
    assert out["season"] == 2026
    assert "CC BY 4.0" in out["source"]


def test_pass_rate_is_ranked_most_pass_heavy_first():
    rows = league()
    rows.loc[rows["posteam"] == "BBB", "play_type"] = "run"
    out = b.build(rows, 2026)
    assert out["teams"]["BBB"]["off"]["pass"]["rank"] == 4
    assert out["teams"]["AAA"]["off"]["pass"]["rank"] < 4


def test_points_come_from_final_scores_and_unfinished_games_are_left_out():
    df = league()
    # A game with no END GAME play has not finished: it must not count toward games played.
    df = pd.concat([df, pd.DataFrame([play("g9", "AAA", "DDD", "AAA", pid=1)])], ignore_index=True)
    out = b.build(df, 2026)
    assert out["teams"]["AAA"]["g"] == 3
    assert out["teams"]["AAA"]["off"]["points"]["v"] == 28.0


def test_main_writes_the_file_and_leaves_it_alone_when_nothing_changed(tmp_path, capsys):
    src = tmp_path / "pbp.csv"
    league().to_csv(src, index=False)
    out = tmp_path / "scouting.json"
    assert b.main(["--season", "2026", "--input", str(src), "--out", str(out)]) == 0
    first = json.loads(out.read_text())
    assert len(first["teams"]) == 4
    mtime = out.stat().st_mtime_ns
    assert b.main(["--season", "2026", "--input", str(src), "--out", str(out)]) == 0
    assert "unchanged" in capsys.readouterr().out
    assert out.stat().st_mtime_ns == mtime


def test_an_empty_season_does_not_overwrite_an_existing_file(tmp_path):
    src = tmp_path / "pbp.csv"
    league().iloc[:5].to_csv(src, index=False)  # no finished games
    out = tmp_path / "scouting.json"
    out.write_text('{"keep":"me"}')
    assert b.main(["--season", "2026", "--input", str(src), "--out", str(out)]) == 0
    assert out.read_text() == '{"keep":"me"}'


def test_the_rams_use_the_site_abbreviation():
    df = league()
    for col in ("home_team", "away_team", "posteam", "defteam"):
        df[col] = df[col].replace({"DDD": "LA"})
    out = b.build(df, 2026)
    assert "LAR" in out["teams"] and "LA" not in out["teams"]
