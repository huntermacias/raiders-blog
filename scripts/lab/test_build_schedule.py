import json
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import build_schedule as b  # noqa: E402

TEAM_LIST = sorted(b.TEAMS)


def full_schedule(season=2026):
    """A made-up 17-game-per-team schedule: 16 teams meet 16 others in a ring, and 17 weeks of games."""
    rows = []
    week = 0
    # 17 weeks x 16 games = 272 games, each team once a week (a bye is not needed for the checks here).
    for week in range(1, 18):
        order = TEAM_LIST[week % 32 :] + TEAM_LIST[: week % 32]
        for i in range(16):
            rows.append(
                dict(
                    game_id=f"{season}_{week:02d}_{order[i]}_{order[31 - i]}",
                    season=season,
                    game_type="REG",
                    week=week,
                    gameday=f"{season}-09-{week:02d}",
                    gametime="13:00",
                    away_team=order[i],
                    home_team=order[31 - i],
                    away_score=None,
                    home_score=None,
                    spread_line=None,
                )
            )
    return pd.DataFrame(rows)


def test_builds_every_game_and_locks_finished_ones():
    g = full_schedule()
    g.loc[0, ["away_score", "home_score"]] = [20, 27]
    g.loc[1, "spread_line"] = -2.5
    out = b.build(g, 2026)
    assert len(out["games"]) == 272
    first = out["games"][0]
    assert first["homeScore"] == 27 and first["awayScore"] == 20
    assert "spread" not in first
    assert out["played"] == 1 and out["throughWeek"] == 1
    unplayed = [x for x in out["games"] if "homeScore" not in x]
    assert len(unplayed) == 271 and all("spread" in x for x in unplayed)
    assert any(x["spread"] == -2.5 for x in unplayed)


def test_keeps_a_tied_game():
    g = full_schedule()
    g.loc[0, ["away_score", "home_score"]] = [17, 17]
    first = b.build(g, 2026)["games"][0]
    assert first["homeScore"] == first["awayScore"] == 17


def test_site_abbreviation_for_the_rams():
    g = full_schedule()
    g = g.replace({"LAR": "LA"})
    out = b.build(g, 2026)
    assert all(t != "LA" for x in out["games"] for t in (x["home"], x["away"]))
    assert any("LAR" in (x["home"], x["away"]) for x in out["games"])


def test_ignores_other_seasons_and_the_playoffs():
    g = pd.concat([full_schedule(2025), full_schedule(2026)], ignore_index=True)
    playoff = full_schedule(2026).iloc[:1].copy()
    playoff["game_type"] = "WC"
    playoff["game_id"] = "2026_19_X_Y"
    out = b.build(pd.concat([g, playoff], ignore_index=True), 2026)
    assert len(out["games"]) == 272 and all(x["id"].startswith("2026_") for x in out["games"])


def test_refuses_a_schedule_that_is_missing_a_game():
    g = full_schedule().iloc[1:]
    with pytest.raises(ValueError, match="17 games"):
        b.build(g, 2026)


def test_refuses_an_unknown_team():
    g = full_schedule()
    g.loc[0, "home_team"] = "XXX"
    with pytest.raises(ValueError):
        b.build(g, 2026)


def test_writes_a_file_and_leaves_an_unchanged_one_alone(tmp_path, capsys):
    src = tmp_path / "games.csv"
    full_schedule().to_csv(src, index=False)
    out = tmp_path / "schedule.json"
    assert b.main(["--season", "2026", "--input", str(src), "--out", str(out)]) == 0
    first = out.read_text()
    assert json.loads(first)["games"]
    assert b.main(["--season", "2026", "--input", str(src), "--out", str(out)]) == 0
    assert "unchanged" in capsys.readouterr().out
    assert out.read_text() == first


def test_a_broken_download_does_not_replace_a_good_file(tmp_path):
    src = tmp_path / "games.csv"
    full_schedule().iloc[5:].to_csv(src, index=False)
    out = tmp_path / "schedule.json"
    out.write_text("keep me")
    assert b.main(["--season", "2026", "--input", str(src), "--out", str(out)]) == 1
    assert out.read_text() == "keep me"
