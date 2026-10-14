"""Methodology v2: who owns each play, what a grade means, how tracking data joins, and what is never allowed to become a zero."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import build_players as b  # noqa: E402
import method as mth  # noqa: E402
from test_build_players import built, player, sources, stat  # noqa: E402

GAME = "2026_01_BBB_AAA"  # AAA at home to BBB, week 1


def extra(rows: list[dict]) -> pd.DataFrame:
    base = dict(game_id=GAME, season_type="REG", week=1, posteam="AAA", defteam="BBB", penalty=0, desc="x", pass_attempt=0, complete_pass=0, qb_dropback=0, qb_scramble=0,
                interception=0, sack=0, success=0, yards_gained=0)
    out = []
    for i, r in enumerate(rows):
        out.append({**base, "play_id": 50 + (i + 1) / 100, **r})
    return pd.DataFrame(out)


def with_plays(rows: list[dict]) -> dict:
    src = sources()
    src["pbp"] = pd.concat([src["pbp"], extra(rows)], ignore_index=True)
    return src


# ---------------------------------------------------------------------------------------------- who owns a play


PLAYS = [
    # A scramble: a dropback to the league's definition, the passer left empty and the quarterback named as the rusher.
    dict(play_type="run", epa=0.6, qb_dropback=1, qb_scramble=1, passer_player_id=None, rusher_player_id="q-AAA", yards_gained=9, success=1),
    # A scramble that ends in a lost fumble.
    dict(play_type="run", epa=-1.5, qb_dropback=1, qb_scramble=1, passer_player_id=None, rusher_player_id="q-AAA", yards_gained=2, fumble_lost=1),
    # A designed quarterback run: his, but not a dropback.
    dict(play_type="run", epa=0.3, qb_dropback=0, qb_scramble=0, passer_player_id=None, rusher_player_id="q-AAA", yards_gained=5, success=1),
    # A trick play: a receiver throws the pass. A dropback, but not a quarterback's.
    dict(play_type="pass", epa=0.2, qb_dropback=1, passer_player_id="r-AAA", receiver_player_id="b-AAA", pass_attempt=1, complete_pass=1, yards_gained=7, success=1, air_yards=5.0),
    # A play a penalty wiped out: in nobody's numbers, but counted as dropped.
    dict(play_type="pass", epa=-3.0, qb_dropback=1, passer_player_id="q-AAA", pass_attempt=1, penalty=1, air_yards=8.0),
    # A back's designed run that fumbles.
    dict(play_type="run", epa=-1.0, passer_player_id=None, rusher_player_id="b-AAA", yards_gained=1, fumble_lost=1),
]


def totals(out_src: dict) -> tuple[dict, pd.DataFrame]:
    ctx = b.prepare(out_src, 2026)
    return ctx, ctx["comps"]["qb"]


def test_a_scramble_is_the_quarterbacks_dropback_and_never_a_back_s_carry():
    plain_ctx, plain = totals(sources())
    ctx, qb = totals(with_plays(PLAYS))
    mine, before = qb[qb["id"] == "q-AAA"], plain[plain["id"] == "q-AAA"]
    assert mine["db"].sum() - before["db"].sum() == 2  # two scrambles; the wiped-out dropback and the trick pass are not his
    assert mine["scr"].sum() == 2
    # The scramble's EPA is in his dropback EPA, and the fumble is his.
    assert round(mine["epa"].sum() - before["epa"].sum(), 6) == round(0.6 - 1.5, 6)
    assert mine["fl"].sum() == 1
    # And it is in nobody else's: not a back's carry.
    rb = ctx["comps"]["rb"]
    assert rb[rb["id"] == "b-AAA"]["car"].sum() - plain_ctx["comps"]["rb"].query("id == 'b-AAA'")["car"].sum() == 1  # only his own designed run


def test_a_designed_quarterback_run_is_kept_apart_from_his_dropbacks():
    ctx, qb = totals(with_plays(PLAYS))
    mine = qb[qb["id"] == "q-AAA"]
    assert mine["dr"].sum() == 1 and round(mine["dr_epa"].sum(), 6) == 0.3
    # It is not a dropback, so it does not enter the passing numbers, and his total plays are the two together.
    assert mine["plays"].sum() == mine["db"].sum() + mine["dr"].sum()
    assert mine["q_ryds"].sum() == 9 + 2 + 5 + mine["pyds"].sum() * 0  # rushing yards: both scrambles and the designed run


def test_nothing_is_lost_or_counted_twice_between_the_player_table_and_the_team_numbers():
    src = with_plays(PLAYS)
    ctx = b.prepare(src, 2026)
    audit = b.reconcile(ctx["raw"], ctx["pbp"], ctx["comps"], ctx["grp"])
    d, r = audit["dropbacks"], audit["designedRuns"]
    assert d["team"] == d["quarterbacks"] + d["otherJobs"] + d["nobody"]
    assert d["inPlayerTable"] == d["quarterbacks"]  # every quarterback dropback is in exactly one quarterback's line
    assert d["otherJobs"] == 1  # the receiver's trick pass
    assert d["scrambles"] == d["scramblesInPlayerTable"]
    assert r["team"] == r["backs"] + r["quarterbacks"] + r["everyoneElse"]
    assert r["inBackTable"] == r["backs"] and r["inQuarterbackTable"] == r["quarterbacks"]
    assert audit["penaltyDropped"] == 1
    # The team builder counts dropbacks and designed runs the same way: a dropback is qb_dropback, a designed run is a run that is not a scramble.
    pbp = ctx["pbp"]
    scrim = pbp[pbp["play_type"].isin(["pass", "run"]) & pbp["epa"].notna()]
    assert d["team"] == int((scrim["qb_dropback"] == 1).sum())
    assert r["team"] == int(((scrim["play_type"] == "run") & (scrim["qb_scramble"].fillna(0) != 1)).sum())


def test_a_play_a_penalty_wiped_out_is_in_nobody_s_numbers():
    ctx, qb = totals(with_plays(PLAYS))
    mine = qb[qb["id"] == "q-AAA"]
    plain = totals(sources())[1].query("id == 'q-AAA'")
    assert mine["att"].sum() == plain["att"].sum()  # the penalised throw is not an attempt
    assert mine["epa"].sum() > plain["epa"].sum() - 3.0  # and its -3 EPA is nowhere


def test_a_fumble_belongs_to_the_player_whose_play_it_was():
    ctx, qb = totals(with_plays(PLAYS))
    rb = ctx["comps"]["rb"]
    assert rb[rb["id"] == "b-AAA"]["fl"].sum() == 1
    assert qb[qb["id"] == "q-AAA"]["fl"].sum() == 1  # the scramble's, not the back's


def test_a_receiver_s_lost_fumble_stays_with_the_receiver_and_is_not_charged_to_the_quarterback():
    # A completion for 12 yards (EPA +0.5 for the throw) that the receiver then fumbles away: the play is worth -4.3, the quarterback's share is +0.5.
    fumble = [dict(play_type="pass", epa=-4.3, qb_epa=0.5, qb_dropback=1, passer_player_id="q-AAA", receiver_player_id="b-AAA", pass_attempt=1, complete_pass=1,
                   yards_gained=12, fumble_lost=1, air_yards=6.0)]
    base_ctx, base = totals(sources())
    ctx, qb = totals(with_plays(fumble))
    gain = qb[qb["id"] == "q-AAA"]["epa"].sum() - base[base["id"] == "q-AAA"]["epa"].sum()
    assert gain == pytest.approx(0.5)  # the throw's value, not the lost ball's
    rb = ctx["comps"]["rb"]
    rb0 = base_ctx["comps"]["rb"]
    assert rb[rb["id"] == "b-AAA"]["r_epa"].sum() - rb0[rb0["id"] == "b-AAA"]["r_epa"].sum() == pytest.approx(-4.3)  # the receiver keeps the loss
    audit = b.reconcile(ctx["raw"], ctx["pbp"], ctx["comps"], ctx["grp"])
    assert audit["receiverFumbleEpa"] == pytest.approx(-4.8)  # the audit says how much value sits on quarterbacks' dropbacks in the team numbers but is the receiver's


def test_without_a_quarterback_only_value_a_dropback_falls_back_to_the_play_s_epa():
    plain = [dict(play_type="pass", epa=0.9, qb_dropback=1, passer_player_id="q-AAA", receiver_player_id="b-AAA", pass_attempt=1, complete_pass=1, yards_gained=8, air_yards=4.0)]
    base = totals(sources())[1].query("id == 'q-AAA'")["epa"].sum()
    assert totals(with_plays(plain))[1].query("id == 'q-AAA'")["epa"].sum() == pytest.approx(base + 0.9)


def test_a_trick_pass_by_a_receiver_is_not_a_quarterback_play_and_the_back_still_has_the_target():
    ctx, qb = totals(with_plays(PLAYS))
    assert "r-AAA" not in set(qb["id"])
    rb = ctx["comps"]["rb"]
    assert rb[rb["id"] == "b-AAA"]["r_tgt"].sum() == 1  # a back's catches are his, beside his carries


# ---------------------------------------------------------------------------------------------- what a grade means


def reference(tau: float = 0.05, play: float = 1.6, groups=("qb",)) -> b.Reference:
    stats = {"epaDb": {"talentSd": tau, "playSd": play, "drift": 0.001, "reliability": 0.5, "stability": 0.4}}
    return b.Reference({"referenceSeasons": [2018, 2025], "groups": {g: {"stats": stats} for g in groups}})


def test_a_grade_is_fifty_plus_ten_per_standard_deviation_of_true_differences_and_does_not_depend_on_who_else_is_playing():
    tau = 0.05
    out = b.build(sources(), 2026, "AAA", None, reference(tau))
    y = out["yard"]["qb"]["epaDb"]
    assert y["ts"] == tau
    for p in out["players"]:
        if p["group"] != "qb":
            continue
        s = stat(p, "epaDb")["season"]
        # The grade is a pure function of the estimate, the league average and the fixed spread: nothing about this season's spread.
        assert s["g"] == pytest.approx(50 + 10 * (s["a"] - y["mu"]) / tau, abs=0.15)
    # The same reference and a different league (fewer teams) give the same scale for the same estimate.
    assert b.grade_of(0.10, 0.0, 0.05, True) == 70.0 and b.grade_of(0.10, 0.0, 0.05, False) == 30.0


def test_the_scale_is_fixed_so_a_grade_does_not_stretch_as_the_season_goes():
    import pandas as pd  # noqa: PLC0415

    src = sources()
    early = dict(src, pbp=src["pbp"][src["pbp"]["week"] <= 2])
    ref = reference()
    full, part = b.build(src, 2026, "AAA", None, ref), b.build(early, 2026, "AAA", None, ref)
    # One standard deviation of true differences is ten points in week 2 and in week 5 alike.
    assert full["yard"]["qb"]["epaDb"]["ts"] == part["yard"]["qb"]["epaDb"]["ts"]
    assert full["method"]["scale"] == part["method"]["scale"] == {**mth.public()["scale"]}


def test_early_season_estimates_say_how_unsure_they_are_and_a_grade_never_hides_it():
    src = sources()
    early = dict(src, pbp=src["pbp"][src["pbp"]["week"] <= 2])
    ref = reference()
    full, part = b.build(src, 2026, "AAA", None, ref), b.build(early, 2026, "AAA", None, ref)
    f = player(full, "q-AAA")["grade"]
    e = player(part, "q-AAA")["grade"]
    assert e["hi"] - e["lo"] > f["hi"] - f["lo"] > 0  # fewer plays, a wider range
    assert e["rl"] < f["rl"]  # and less of the league's spread pinned down
    assert f["lo"] < f["g"] < f["hi"]


def test_without_the_fixed_constants_the_data_says_the_scale_is_provisional():
    out = b.build(sources(), 2026, "AAA")
    assert out["method"]["fixed"] is False
    assert b.build(sources(), 2026, "AAA", None, reference())["method"]["fixed"] is True


def test_the_primary_stat_is_the_grade_and_the_components_are_not_averaged_into_it():
    out = b.build(sources(), 2026, "AAA", None, reference())
    qb = player(out, "q-AAA")
    assert qb["grade"]["k"] == "epaDb" and qb["grade"]["g"] == stat(qb, "epaDb")["season"]["g"]
    assert "grade" not in player(out, "b-AAA")  # runners are graded by component, not as a whole
    assert "grade" not in player(out, "d-AAA") or player(out, "d-AAA")["grade"]["k"] == "pressRate"


def test_jobs_the_data_cannot_grade_get_no_estimate_at_all_and_still_get_their_observed_numbers():
    src = sources()
    out = b.build(src, 2026, "AAA", None, b.Reference({"groups": {"lb": {"stats": {"tackleRate": {"talentSd": 1.0, "playSd": 10.0, "drift": 0.1, "reliability": 0.5}}}}}))
    for p in out["players"]:
        if mth.mode_of(p["group"]) == "none":
            assert "grade" not in p
            for s in p["stats"]:
                assert all(k not in s["season"] for k in ("g", "a", "pe", "rl", "ar")), (p["group"], s["k"])
                assert s["season"].get("r") is not None or s["k"] not in {k for k, st in b.GROUPS[p["group"]].stats.items() if st.higher is not None}


def test_observed_rank_and_estimate_rank_are_separate_things():
    out = b.build(sources(), 2026, "AAA", None, reference())
    s = stat(player(out, "q-AAA"), "epaDb")["season"]
    assert s["r"] >= 1 and s["ar"] >= 1 and "a" in s and "pe" in s


# ---------------------------------------------------------------------------------------------- contribution


def test_contribution_is_epa_above_an_average_player_so_it_sums_to_nothing_across_the_league():
    out = b.build(sources(), 2026, "AAA", None, reference())
    qbs = [p for p in out["players"] if p["group"] == "qb"]
    assert sum(p["contrib"]["over"] for p in qbs) == pytest.approx(0.0, abs=0.5)
    best = max(qbs, key=lambda p: stat(p, "epaDb")["season"]["v"])
    assert best["contrib"]["over"] > 0 and best["contrib"]["parts"][0]["k"] == "epaDb"
    # A back's contribution carries his receiving beside his carries.
    rb = player(out, "b-AAA")
    assert [p["k"] for p in rb["contrib"]["parts"]][0] == "epaRush"


# ---------------------------------------------------------------------------------------------- tracking data


def ngs_rows(kind: str, rows: list[dict]) -> pd.DataFrame:
    base = dict(season=2026, season_type="REG")
    return pd.DataFrame([{**base, **r} for r in rows])


def rush_row(team: str, week: int, att=10, ryoe=5.0, eight=30.0, pid=None):
    return dict(week=week, player_gsis_id=pid or f"b-{team}", team_abbr=team, rush_attempts=att, expected_rush_yards=40.0, rush_yards_over_expected=ryoe,
                percent_attempts_gte_eight_defenders=eight)


def all_team_weeks(extra_rows=None, skip=()):
    """A tracking row for every back in every finished game, minus the (team, week) pairs in `skip`."""
    rows = []
    for wk, h, a in [(1, "AAA", "BBB"), (1, "CCC", "DDD"), (1, "EEE", "FFF"), (2, "AAA", "CCC"), (2, "BBB", "EEE"), (2, "DDD", "FFF"), (3, "BBB", "CCC"), (3, "DDD", "EEE"),
                     (4, "AAA", "BBB"), (4, "CCC", "DDD"), (4, "EEE", "FFF"), (5, "AAA", "CCC"), (5, "BBB", "EEE"), (5, "DDD", "FFF")]:
        for t in (h, a):
            if (t, wk) not in skip:
                rows.append(rush_row(t, wk))
    return rows + (extra_rows or [])


def with_tracking(rush=None, rec=None, passing=None) -> dict:
    src = sources()
    if rush is not None:
        src["ngs_rush"] = ngs_rows("rush", rush)
    if rec is not None:
        src["ngs_rec"] = ngs_rows("rec", rec)
    if passing is not None:
        src["ngs_pass"] = ngs_rows("pass", passing)
    return src


def test_a_game_the_provider_did_not_list_is_left_out_of_the_tracking_stat_and_is_not_a_zero():
    # The provider posted AAA in week 2 (another player is listed) but not its back. His other three games count; the missing one
    # neither dilutes nor zeroes the rate, and the league-wide cutoff is untouched because the team did post.
    out = b.build(with_tracking(rush=all_team_weeks(skip={("AAA", 2)}, extra_rows=[rush_row("AAA", 2, pid="someone-else")])), 2026, "AAA")
    assert out["trackedWeek"] == 5
    rb = player(out, "b-AAA")
    ryoe = stat(rb, "ryoe")["season"]
    assert ryoe["n"] == 30 and ryoe["v"] == pytest.approx(0.5)  # 3 games x 10 carries, +5.0 each game
    assert rb["tracked"]["games"] == 3 and rb["tracked"]["of"] == 4
    # He carried more often than the provider's rows cover, and the card says how many carries the number rests on.
    assert rb["tracked"]["plays"] == 30 and rb["tracked"]["ofPlays"] >= rb["tracked"]["plays"]


def test_a_back_is_graded_on_explosive_runs_and_yards_after_contact_separately_and_yards_over_expected_is_only_observed():
    assert mth.POLICY["rb"]["grade"] == ["explosive", "yco"]
    assert mth.POLICY["rb"]["primary"] is None  # no single back grade
    out = b.build(with_tracking(rush=all_team_weeks()), 2026, "AAA")
    rb = player(out, "b-AAA")
    ryoe = stat(rb, "ryoe")["season"]
    assert ryoe["n"] > 0 and "g" not in ryoe and "a" not in ryoe  # observed: a value and a volume, never a grade or an estimate
    assert "grade" not in rb  # components, not an overall
    assert "contrib" in rb  # his contribution still accumulates


def test_a_player_with_no_tracking_rows_has_no_tracking_stat_rather_than_a_zero():
    out = b.build(with_tracking(rush=[r for r in all_team_weeks() if r["team_abbr"] != "AAA"]), 2026, "AAA")
    rb = player(out, "b-AAA")
    assert "ryoe" not in {s["k"] for s in rb["stats"]}
    assert "tracked" in rb and rb["tracked"]["games"] == 0
    assert "eightBox" not in {s["k"] for s in rb["stats"]}


def test_every_tracking_stat_uses_one_cutoff_week_and_the_data_says_which():
    # By week 5 the provider has posted one team only: the cutoff for everyone is week 4, so nobody is compared over a longer stretch.
    rows = [r for r in all_team_weeks() if not (r["week"] == 5 and r["team_abbr"] != "AAA")]
    out = b.build(with_tracking(rush=rows), 2026, "AAA")
    assert out["trackedWeek"] == 4
    assert stat(player(out, "b-AAA"), "ryoe")["season"]["n"] == 30  # weeks 1, 2, 4; week 5's rows were dropped
    assert "trackedWeek" not in b.build(sources(), 2026, "AAA")


def test_tracking_rows_for_someone_who_is_not_in_the_job_are_ignored():
    # A quarterback listed in the rushing file is not a back, and an id nobody knows joins to nothing.
    rows = all_team_weeks([rush_row("AAA", 1, pid="q-AAA", att=99), rush_row("AAA", 1, pid="nobody", att=99)])
    out = b.build(with_tracking(rush=rows), 2026, "AAA")
    assert stat(player(out, "b-AAA"), "ryoe")["season"]["n"] == 40
    assert all(p["group"] != "qb" or "ryoe" not in {s["k"] for s in p["stats"]} for p in out["players"])


def test_a_tracking_row_with_no_expected_yards_is_not_counted_as_a_carry_with_zero_over_expected():
    rows = all_team_weeks()
    rows[0] = dict(rows[0], expected_rush_yards=np.nan, rush_yards_over_expected=np.nan)  # the first row is AAA's week-1 game
    out = b.build(with_tracking(rush=rows), 2026, "AAA")
    n = stat(player(out, "b-AAA"), "ryoe")["season"]["n"]
    assert n == 30 and rows[0]["team_abbr"] == "AAA"


def test_the_provider_s_old_team_codes_join_to_the_site_s():
    rows = [dict(r, team_abbr="LA" if r["team_abbr"] == "AAA" else r["team_abbr"]) for r in all_team_weeks()]
    tracking, _ = b.ngs_components({"rush": ngs_rows("rush", rows)}, 2026, {"b-AAA": "rb"}, {("AAA", w) for w in (1, 2, 4, 5)})
    assert tracking == {} or "rb" not in tracking or tracking["rb"].empty or set(tracking["rb"]["team"]) <= {"AAA", "LAR"}
    rows2 = [dict(r, team_abbr="LA") for r in all_team_weeks()]
    t2, _ = b.ngs_components({"rush": ngs_rows("rush", rows2)}, 2026, {"b-AAA": "rb"}, {("LAR", w) for w in range(1, 6)})
    assert not t2["rb"].empty and set(t2["rb"]["team"]) == {"LAR"}


def test_separation_is_a_target_weighted_average_of_the_games_he_was_listed_in():
    rec = [dict(week=wk, player_gsis_id="r-AAA", team_abbr="AAA", targets=t, receptions=t // 2, avg_separation=s, avg_cushion=6.0)
           for wk, t, s in ((1, 2, 4.0), (2, 8, 2.0), (4, 5, 3.0))]
    others = [dict(week=wk, player_gsis_id=f"r-{t}", team_abbr=t, targets=5, receptions=3, avg_separation=3.0, avg_cushion=6.0)
              for wk, h, a in [(1, "AAA", "BBB"), (1, "CCC", "DDD"), (1, "EEE", "FFF"), (2, "AAA", "CCC"), (2, "BBB", "EEE"), (2, "DDD", "FFF"), (3, "BBB", "CCC"), (3, "DDD", "EEE"),
                               (4, "AAA", "BBB"), (4, "CCC", "DDD"), (4, "EEE", "FFF"), (5, "AAA", "CCC"), (5, "BBB", "EEE"), (5, "DDD", "FFF")] for t in (h, a) if t != "AAA"]
    out = b.build(with_tracking(rec=rec + others), 2026, "AAA")
    sep = stat(player(out, "r-AAA"), "sep")["season"]
    assert sep["n"] == 15 and sep["v"] == pytest.approx((2 * 4.0 + 8 * 2.0 + 5 * 3.0) / 15)


def test_tracking_stats_describe_and_never_grade():
    # Separation is measured on his targets at the moment the pass arrives: it describes how open the quarterback found him.
    for g in ("wr", "te"):
        assert b.GROUPS[g].stats["sep"].higher is None and "sep" not in mth.graded_stats(g)
    assert "eightBox" not in mth.graded_stats("rb") and b.GROUPS["rb"].stats["eightBox"].higher is None


# ---------------------------------------------------------------------------------------------- earlier seasons are read against their own league


def test_an_earlier_season_is_read_against_its_own_league_so_a_league_wide_shift_is_not_the_player_changing():
    def row(season, v):
        return [season, "qb", "AAA", "QB", 17, [["epaDb", v, 500.0, 0.05, 55.0, 4]]]

    hist = {"seasons": [2024, 2025], "model": {"qb": {"epaDb": {"talent": 0.01, "drift": 0.001}}},
            "yard": {"2024": {"qb": {"epaDb": {"mu": -0.05}}}, "2025": {"qb": {"epaDb": {"mu": -0.05}}}},
            "players": {"vet": {"n": "A Vet", "r": [row(2024, 0.00), row(2025, 0.00)]}}}
    book = b.PriorBook(hist)
    raw = book.prior("vet", "qb", "epaDb", 2026)[0]
    shifted = book.prior("vet", "qb", "epaDb", 2026, mu_now=0.05)[0]
    assert raw == pytest.approx(0.0)
    # He was exactly 0.05 above his league both years; this year's league is at +0.05, so the same standing is +0.10.
    assert shifted == pytest.approx(0.10)
    # No league average on file for a season: the raw value stands, rather than a guess.
    hist["yard"] = {}
    assert b.PriorBook(hist).prior("vet", "qb", "epaDb", 2026, mu_now=0.05)[0] == pytest.approx(0.0)


def test_a_change_of_team_or_head_coach_since_his_last_season_is_flagged_and_changes_no_number():
    def row(season, team):
        return [season, "qb", team, "QB", 17, [["epaDb", 0.05, 500.0, 0.05, 55.0, 4]]]

    hist = {"seasons": [2024, 2025], "model": {"qb": {"epaDb": {"talent": 0.01, "drift": 0.001}}},
            "coaches": {"2025": {"AAA": "Old Coach", "BBB": "Same Coach"}},
            "players": {"stay": {"n": "S", "r": [row(2025, "AAA")]}, "move": {"n": "M", "r": [row(2025, "BBB")]}, "same": {"n": "T", "r": [row(2025, "BBB")]}}}
    book = b.PriorBook(hist)
    now = {"AAA": "New Coach", "BBB": "Same Coach"}
    assert book.environment("stay", "qb", 2026, "AAA", now) == {"prevTeam": "AAA", "prevSeason": 2025, "teamChanged": False, "coachChanged": True}
    assert book.environment("move", "qb", 2026, "AAA", now) == {"prevTeam": "BBB", "prevSeason": 2025, "teamChanged": True}  # a coach is only compared on the same team
    assert book.environment("same", "qb", 2026, "BBB", now)["coachChanged"] is False
    assert book.environment("rookie", "qb", 2026, "AAA", now) is None  # no earlier season, nothing to compare
    # Missing coach data says nothing rather than guessing.
    assert "coachChanged" not in b.PriorBook({**hist, "coaches": {}}).environment("stay", "qb", 2026, "AAA", now)


def test_the_grade_says_how_much_of_it_is_this_season_and_what_it_would_be_from_this_season_alone():
    out = b.build(sources(), 2026, "AAA", None, reference())
    s = stat(player(out, "q-AAA"), "epaDb")["season"]
    # With no earlier seasons the estimate IS the season-only estimate, and this season is most, never all, of what it rests on.
    assert s["g0"] == s["g"] and 0.0 < s["cw"] < 1.0
    gr = player(out, "q-AAA")["grade"]
    assert gr["g0"] == gr["g"] and gr["cw"] == s["cw"]
    # With a strong earlier record the estimate leans on it, and the season-only grade does not.
    hist = {"seasons": [2025], "model": {"qb": {"epaDb": {"talent": 0.0025, "drift": 0.0005}}},
            "yard": {"2025": {"qb": {"epaDb": {"mu": 0.0}}}},
            "players": {"q-AAA": {"n": "Q", "r": [[2025, "qb", "AAA", "QB", 17, [["epaDb", 0.5, 600.0, 0.05, 70.0, 1]]]]}}}
    with_hist = b.build(sources(), 2026, "AAA", b.PriorBook(hist, reference()), reference())
    h = stat(player(with_hist, "q-AAA"), "epaDb")["season"]
    assert h["g"] > h["g0"] == s["g0"] and h["cw"] < s["cw"] and h["hn"] == 600


def test_a_week_counts_as_posted_by_each_file_s_own_usual_coverage_and_a_partly_posted_week_ends_the_window():
    # Rushing lists only qualifying rushers, so a week with two of six teams short is still a posted week; a week with most teams missing is not.
    short_two = all_team_weeks(skip={("AAA", 2), ("CCC", 2)}, extra_rows=[])
    out = b.build(with_tracking(rush=short_two), 2026, "AAA")
    assert out["trackedWeek"] == 5  # 4 of 6 is above the rushing file's floor (.65)
    part_way = all_team_weeks(skip={("AAA", 5), ("BBB", 5), ("CCC", 5), ("DDD", 5), ("EEE", 5)})
    out = b.build(with_tracking(rush=part_way), 2026, "AAA")
    assert out["trackedWeek"] == 4  # one team of six: the newest week is cut, for everybody alike
    assert b.NGS_MIN_COVER["rush"] < b.NGS_MIN_COVER["rec"] <= b.NGS_MIN_COVER["pass"]


# ---------------------------------------------------------------------------------------------- eligibility is not accumulation


def with_backup() -> dict:
    """AAA's backup quarterback throws three passes (one a sack-less incompletion, one scrambles) in week 1; a receiver with one catch; a back with two carries."""
    src = with_plays([
        dict(play_type="pass", epa=0.4, qb_dropback=1, passer_player_id="q2-AAA", receiver_player_id="r2-AAA", pass_attempt=1, complete_pass=1, yards_gained=6, success=1, air_yards=4.0),
        dict(play_type="pass", epa=-0.5, qb_dropback=1, passer_player_id="q2-AAA", receiver_player_id="r2-AAA", pass_attempt=1, air_yards=9.0),
        dict(play_type="run", epa=0.8, qb_dropback=1, qb_scramble=1, passer_player_id=None, rusher_player_id="q2-AAA", yards_gained=11, success=1),
        dict(play_type="run", epa=0.1, passer_player_id=None, rusher_player_id="b2-AAA", yards_gained=3, success=1),
        dict(play_type="run", epa=-0.2, passer_player_id=None, rusher_player_id="b2-AAA", yards_gained=1, fumble_lost=1),
    ])
    extra_rows = pd.DataFrame([dict(gsis_id="q2-AAA", pfr_id=None, full_name="Backup AAA", position="QB", team="AAA"),
                               dict(gsis_id="r2-AAA", pfr_id=None, full_name="Reserve AAA", position="WR", team="AAA"),
                               dict(gsis_id="b2-AAA", pfr_id=None, full_name="Spare AAA", position="RB", team="AAA")])
    src["roster"] = pd.concat([src["roster"], extra_rows], ignore_index=True)
    return src


def test_a_player_under_the_card_floor_has_no_card_or_grade_but_every_legitimate_play_still_counts():
    out = b.build(with_backup(), 2026, "AAA", None, reference(groups=("qb", "rb", "wr")))
    assert "q2-AAA" not in {p["id"] for p in out["players"]}  # no card, no rank, no grade
    other = {o["id"]: o for o in out["others"]}
    q = other["q2-AAA"]
    assert q["group"] == "qb" and q["name"] == "Backup AAA" and "grade" not in q
    assert q["box"]["att"] == 2 and q["box"]["scr"] == 1
    # His dropbacks are the two throws and the scramble; the plain numbers are kept with the plays behind them and no rank.
    assert q["obs"]["epaDb"] == [pytest.approx((0.4 - 0.5 + 0.8) / 3, abs=1e-3), 3.0]
    assert q["contrib"]["parts"][0]["n"] == 3.0 and q["contrib"]["parts"][0]["tot"] == pytest.approx(0.7, abs=0.05)
    back = other["b2-AAA"]
    assert back["contrib"]["parts"][0]["n"] == 2.0 and back["box"].get("fl") == 1
    assert other["r2-AAA"]["contrib"]["parts"][0]["n"] == 2.0


def test_the_players_with_cards_and_the_players_without_add_up_to_the_team():
    src = with_backup()
    ctx = b.prepare(src, 2026)
    out = b.build(src, 2026, "AAA", None, reference(groups=("qb", "rb", "wr")))
    everyone = out["players"] + out["others"]

    def total(group: str, key: str, field: str) -> float:
        return sum(next((x[field] for x in p["contrib"]["parts"] if x["k"] == key), 0.0) for p in everyone if p["group"] == group and p.get("contrib"))

    # Every dropback a quarterback owns, every designed run a back owns, every target a receiver owns, and their EPA.
    comps = ctx["comps"]
    assert total("qb", "epaDb", "n") == comps["qb"]["db"].sum()
    assert total("qb", "epaDb", "tot") == pytest.approx(comps["qb"]["epa"].sum(), abs=0.1)
    assert total("rb", "epaRush", "n") == comps["rb"]["car"].sum()
    assert total("wr", "epaTgt", "n") == comps["wr"]["tgt"].sum()
    assert out["audit"]["dropbacks"]["inPlayerTable"] == out["audit"]["dropbacks"]["quarterbacks"]


def test_the_build_audits_its_own_player_table_against_the_plays():
    out = b.build(with_backup(), 2026, "AAA", None, reference(groups=("qb", "rb", "wr")))
    table = out["audit"]["playerTable"]
    assert table["off"] == []
    assert table["jobs"]["qb.epaDb"]["table"]["n"] == table["jobs"]["qb.epaDb"]["plays"]["n"]
    # And it notices when the table is short: drop the players without a card and the audit says which jobs are off.
    short = b.reconcile_table(out["players"], [], b.prepare(with_backup(), 2026)["comps"])
    assert "qb.epaDb" in short["off"]


def test_a_roster_row_with_no_player_id_never_collects_the_plays_whose_player_is_missing():
    src = with_plays([dict(play_type="run", epa=0.2, passer_player_id=None, rusher_player_id=None, yards_gained=3, success=1)])  # a run nobody is named on
    src["roster"] = pd.concat([src["roster"], pd.DataFrame([dict(gsis_id=np.nan, pfr_id=None, full_name="No Id", position="RB", team="AAA")])], ignore_index=True)
    ctx = b.prepare(src, 2026)
    assert not any(not isinstance(k, str) for k in ctx["grp"])
    audit = b.reconcile(ctx["raw"], ctx["pbp"], ctx["comps"], ctx["grp"])
    assert audit["designedRuns"]["backs"] == int(ctx["comps"]["rb"]["car"].sum())  # the nameless run is nobody's, not a back's
    assert audit["designedRuns"]["everyoneElse"] >= 1


def test_a_back_who_caught_a_pass_in_a_game_with_no_carry_keeps_that_target():
    # A back with no carry in the game at all, one target: the target and its points are his, and the game is his.
    src = with_plays([dict(play_type="pass", epa=0.5, qb_dropback=1, passer_player_id="q-AAA", receiver_player_id="b3-AAA", pass_attempt=1, complete_pass=1, yards_gained=8, success=1, air_yards=-1.0)])
    src["roster"] = pd.concat([src["roster"], pd.DataFrame([dict(gsis_id="b3-AAA", pfr_id=None, full_name="Catcher AAA", position="RB", team="AAA")])], ignore_index=True)
    rb = b.prepare(src, 2026)["comps"]["rb"]
    mine = rb[rb["id"] == "b3-AAA"]
    assert len(mine) == 1
    row = mine.iloc[0]
    assert row["car"] == 0 and row["r_tgt"] == 1 and row["r_epa"] == pytest.approx(0.5) and row["touches"] == 1
