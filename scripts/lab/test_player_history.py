import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import build_player_history as h  # noqa: E402
import build_players as b  # noqa: E402
from test_build_players import sources  # noqa: E402


def league(n=40, seed=3):
    rng = np.random.default_rng(seed)
    v = rng.normal(0.0, 1.0, n)
    se = np.full(n, 1.0)
    return {f"p{i}": (float(x), float(e)) for i, (x, e) in enumerate(zip(v, se))}


# ---------------------------------------------------------------------------------------------- stabilizing with a prior


def test_nobody_with_a_prior_is_stabilized_exactly_as_before():
    items = league()
    old = b.stabilize(items)
    new = b.stabilize_with_prior(items, None)
    assert old[0] == new[0] and old[1] == new[1] and old[2] == new[2] and new[3] == {}
    assert b.stabilize_with_prior(items, {})[0] == old[0]


def test_a_solid_history_pulls_a_thin_season_toward_himself_not_the_league():
    items = league()
    # p0 had a poor few games, but five seasons say he is a good player: a level of 1.5, known to within 0.3.
    items["p0"] = (-1.0, 1.0)
    plain, _, _, _ = b.stabilize_with_prior(items, None)
    with_prior, _, _, extra = b.stabilize_with_prior(items, {"p0": (1.5, 0.09, 2000.0)})
    assert with_prior["p0"] > plain["p0"] + 0.3
    # Everyone else is where he was.
    assert with_prior["p1"] == plain["p1"]
    assert set(extra) == {"p0"}


def test_a_vague_history_changes_almost_nothing():
    items = league()
    plain = b.stabilize_with_prior(items, None)[0]
    vague = b.stabilize_with_prior(items, {"p0": (3.0, 400.0, 10.0)})[0]
    assert abs(vague["p0"] - plain["p0"]) < 0.02


def test_this_seasons_numbers_still_move_a_player_with_history():
    low = {**league(), "p0": (-2.0, 0.2)}
    high = {**league(), "p0": (2.0, 0.2)}
    prior = {"p0": (0.0, 0.1, 500.0)}
    assert b.stabilize_with_prior(high, prior)[0]["p0"] > b.stabilize_with_prior(low, prior)[0]["p0"] + 0.5


def test_a_prior_makes_a_number_more_settled_and_reports_how_far_it_could_still_be_off():
    items = league()
    _, _, _, with_none = b.stabilize_with_prior(items, {"p0": (0.0, 1e9, 1.0)})
    _, _, _, with_strong = b.stabilize_with_prior(items, {"p0": (0.0, 0.05, 1000.0)})
    assert with_strong["p0"][0] > with_none["p0"][0]
    assert with_strong["p0"][1] < with_none["p0"][1]
    assert 0.0 <= with_strong["p0"][0] <= 1.0


def test_a_prior_without_a_usable_level_is_ignored():
    items = league()
    plain = b.stabilize_with_prior(items, None)[0]
    for bad in ((float("nan"), 1.0, 1.0), (1.0, 0.0, 1.0), (1.0, -1.0, 1.0)):
        got = b.stabilize_with_prior(items, {"p0": bad})
        assert got[0]["p0"] == plain["p0"] and got[3] == {}


# ---------------------------------------------------------------------------------------------- the book of earlier seasons


def history():
    def row(season, v, se, n=100.0):
        return [season, "qb", "AAA", "QB", 17, [["epaDb", v, n, se, 55.0, 4]]]

    return {
        "seasons": [2024, 2025],
        "model": {"qb": {"epaDb": {"talent": 0.04, "drift": 0.01}}},
        "players": {
            "vet": {"n": "A Vet", "r": [row(2024, 0.30, 0.10), row(2025, 0.10, 0.10)]},
            "old": {"n": "An Old", "r": [row(2024, 0.30, 0.10)]},
            "style": {"n": "Style", "r": [[2025, "qb", "AAA", "QB", 17, [["adot", 8.0, 100.0, None, None, None]]]]},
        },
    }


def test_the_book_pools_seasons_and_the_older_one_counts_for_less():
    book = b.PriorBook(history())
    level, var, vol = book.prior("vet", "qb", "epaDb", 2026)
    assert 0.10 < level < 0.30 and level < 0.20  # nearer last year's 0.10 than the year before's 0.30
    assert vol == 200.0
    assert var < book.prior("old", "qb", "epaDb", 2026)[1]  # two seasons know more than one
    # One season, one more year of aging: less sure than it was a year earlier.
    assert book.prior("old", "qb", "epaDb", 2027)[1] > book.prior("old", "qb", "epaDb", 2026)[1]


def test_a_season_is_never_its_own_prior_and_unknown_things_have_none():
    book = b.PriorBook(history())
    assert book.prior("vet", "qb", "epaDb", 2025)[2] == 100.0  # only 2024 is before 2025
    assert book.prior("vet", "qb", "epaDb", 2024) is None
    assert book.prior("nobody", "qb", "epaDb", 2026) is None
    assert book.prior("vet", "wr", "epaDb", 2026) is None
    assert book.prior("vet", "qb", "nothere", 2026) is None
    assert book.prior("style", "qb", "adot", 2026) is None  # a style stat has no model, so no prior


def test_a_missing_or_empty_history_file_gives_nobody_a_prior(tmp_path):
    assert b.PriorBook.load(tmp_path / "nope.json").prior("vet", "qb", "epaDb", 2026) is None
    assert b.PriorBook.load(None).seasons == []
    p = tmp_path / "h.json"
    p.write_text(json.dumps(history()))
    assert b.PriorBook.load(p).seasons == [2024, 2025]


# ---------------------------------------------------------------------------------------------- the history file


def season_of(values, noise):
    """A compact season: {id: [group, team, pos, games, [[k, v, n, se, g, r]]]} with the given values."""
    players = {f"p{i}": [["qb", "AAA", "QB", 17, [["epaDb", float(v), 300.0, float(noise), 50.0, i + 1]]]] for i, v in enumerate(values)}
    return {"players": players, "names": {k: k for k in players}, "yard": {}}


def test_talent_is_the_spread_beyond_noise_and_drift_is_the_change_beyond_noise():
    rng = np.random.default_rng(7)
    n = 300
    talent = rng.normal(0, 0.5, n)
    noise = 0.3
    seasons = {}
    level = talent
    for s in (2023, 2024, 2025):
        seasons[s] = season_of(level + rng.normal(0, noise, n), noise)
        level = level + rng.normal(0, 0.2, n)  # each year a player's true level moves by sd 0.2
    got = h.estimate(seasons)["qb"]["epaDb"]
    assert abs(got["talent"] - 0.25) < 0.06
    assert abs(got["drift"] - 0.04) < 0.02


def test_a_stat_that_never_persists_cannot_drift_more_than_no_memory_and_never_less_than_a_little():
    rng = np.random.default_rng(1)
    n = 200
    seasons = {s: season_of(rng.normal(0, 0.5, n), 0.1) for s in (2023, 2024, 2025)}  # a new random level every year
    got = h.estimate(seasons)["qb"]["epaDb"]
    assert got["drift"] <= got["talent"] * h.MAX_DRIFT * 1.001
    steady = {s: season_of(np.linspace(-1, 1, n), 0.05) for s in (2023, 2024, 2025)}  # the same level every year
    got = h.estimate(steady)["qb"]["epaDb"]
    assert abs(got["drift"] - got["talent"] * h.MIN_DRIFT) < 1e-6 * max(1.0, got["talent"])


def test_style_stats_and_tiny_groups_get_no_model():
    one = {2025: season_of([0.1, 0.2, 0.3], 0.1)}
    assert h.estimate(one) == {}


def test_compacting_a_season_keeps_each_stats_line_and_the_leagues_yardstick():
    out = b.build(sources(), 2026, "AAA")
    c = h.compact(out)
    assert set(c) == {"players", "names", "yard"}
    pid, rows = next(iter(c["players"].items()))
    group, team, pos, games, stats = rows[0]
    assert isinstance(games, int) and stats and len(stats[0]) == 6
    assert c["names"][pid]
    assert c["yard"] == out["yard"]


# ---------------------------------------------------------------------------------------------- the build, with and without a history


def test_a_build_with_a_history_tags_the_stats_that_used_it_and_names_the_seasons():
    plain = b.build(sources(), 2026, "AAA")
    assert "priorSeasons" not in plain
    qb = next(p for p in plain["players"] if p["id"] == "q-AAA")
    hist = {
        "seasons": [2025],
        "model": {"qb": {"epaDb": {"talent": 0.02, "drift": 0.005}}},
        "players": {"q-AAA": {"n": qb["name"], "r": [[2025, "qb", "AAA", "QB", 17, [["epaDb", 0.15, 500.0, 0.05, 60.0, 3]]]]}},
    }
    out = b.build(sources(), 2026, "AAA", b.PriorBook(hist))
    assert out["priorSeasons"] == [2025]
    mine = next(p for p in out["players"] if p["id"] == "q-AAA")
    epa = next(s for s in mine["stats"] if s["k"] == "epaDb")["season"]
    assert epa["hn"] == 500 and 0 <= epa["rl"] <= 1 and epa["pe"] > 0
    # Only the stat that has a history, only the man who has one.
    assert not any("hn" in s["season"] for s in mine["stats"] if s["k"] != "epaDb")
    assert not any("hn" in s["season"] for p in out["players"] if p["id"] != "q-AAA" for s in p["stats"])
    # His raw number is untouched; only the stabilized one moves.
    before = next(s for s in qb["stats"] if s["k"] == "epaDb")["season"]
    assert epa["v"] == before["v"] and epa["se"] == before["se"]
    # A history from this season or later is not a history.
    late = dict(hist, seasons=[2026], players={"q-AAA": {"n": qb["name"], "r": [[2026, "qb", "AAA", "QB", 17, [["epaDb", 0.15, 500.0, 0.05, 60.0, 3]]]]}})
    assert "priorSeasons" not in b.build(sources(), 2026, "AAA", b.PriorBook(late))


def test_the_history_file_is_found_beside_the_output_by_default(tmp_path, monkeypatch):
    seen = {}

    def fake_build(src, season, team="LV", book=None, ref=None):
        seen["seasons"] = book.seasons if book else None
        return {"season": season, "players": []}

    monkeypatch.setattr(b, "load", lambda season, folder: {})
    monkeypatch.setattr(b, "build", fake_build)
    (tmp_path / "player-history.json").write_text(json.dumps(history()))
    b.main(["--season", "2026", "--out", str(tmp_path / "players.json")])
    assert seen["seasons"] == [2024, 2025]
    b.main(["--season", "2026", "--out", str(tmp_path / "sub" / "players.json")])
    assert seen["seasons"] == []
