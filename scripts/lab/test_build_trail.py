import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_trail as b  # noqa: E402


def scouting(season, g, pts, gen="2026-10-01T00:00:00Z"):
    def team(g_, off_pts, def_pts, off_to, def_to):
        return {"g": g_, "off": {"points": {"v": off_pts, "rank": 1}, "turnovers": {"v": off_to, "rank": 1}}, "def": {"points": {"v": def_pts, "rank": 1}, "turnovers": {"v": def_to, "rank": 1}}}
    return {"season": season, "generatedAt": gen, "teams": {"AAA": team(g, pts, 20, 1.0, 2.0), "BBB": team(g, 20, 25, 1.5, 1.0), "CCC": team(0, 10, 10, 1, 1)}}


def test_snapshot_ranks_net_stats_with_one_as_best():
    s = b.snapshot(scouting(2026, 3, 30))
    assert s["AAA"]["net.points"] == [10, 1]
    assert s["BBB"]["net.points"] == [-5, 3]
    assert s["AAA"]["net.turnovers"] == [1.0, 1]
    assert s["AAA"]["off.points"] == [30, 1]


def test_keys_are_the_catalog():
    assert len(b.KEYS) == 20 and len(set(b.KEYS)) == 20


def test_add_keeps_one_snapshot_per_games_played_and_last_write_wins():
    t = {"keys": b.KEYS, "seasons": {}}
    assert b.add(t, scouting(2026, 3, 30))
    assert b.add(t, scouting(2026, 3, 31))  # same games played, newer numbers
    assert not b.add(t, scouting(2026, 3, 31))  # unchanged
    assert b.add(t, scouting(2026, 4, 28))
    by = t["seasons"]["2026"]["AAA"]
    assert sorted(by) == ["3", "4"]
    assert by["3"]["off.points"][0] == 31
    assert "CCC" not in t["seasons"]["2026"] or "0" not in t["seasons"]["2026"]["CCC"]


def test_new_season_gets_its_own_branch(tmp_path):
    t = {"keys": b.KEYS, "seasons": {}}
    b.add(t, scouting(2026, 3, 30))
    b.add(t, scouting(2027, 3, 30))
    assert set(t["seasons"]) == {"2026", "2027"}
    json.dumps(t)
