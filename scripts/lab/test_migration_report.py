import migration_report as M


def row(**kw):
    base = {
        "v1": {"displayedOverall": 60, "rankOfDisplayed": 10, "of": 40, "rankOnTheStat": 10, "plainRankOnTheStat": 10, "dropbacks": 150},
        "v2": {"standing": 62},
        "causes": {"scramblesNowCounted": 0, "changeFromScrambles": 0.0, "changeFromQbOnlyEpa": 0.0},
    }
    for k, v in kw.items():
        base[k.split("__")[0]].update(v)
    return base


def test_a_player_who_barely_moves_is_said_to_have_barely_moved():
    assert M.explain(row()) == ["no material change: same stat, same order within a few places"]


def test_each_cause_is_named_only_when_it_applies():
    why = M.explain(row(v1__={"rankOfDisplayed": 2, "rankOnTheStat": 9}))
    assert len(why) == 1 and "averaged five stats" in why[0] and "2nd" in why[0] and "9th" in why[0]
    why = M.explain(row(v1__={"rankOnTheStat": 6, "plainRankOnTheStat": 14}))
    assert any("pulled toward the middle" in w and "14th" in w for w in why)
    why = M.explain(row(causes__={"scramblesNowCounted": 12, "changeFromScrambles": 0.07, "changeFromQbOnlyEpa": 0.0}))
    assert any("12 scrambles now count as dropbacks" in w for w in why)
    why = M.explain(row(causes__={"scramblesNowCounted": 1, "changeFromScrambles": 0.0, "changeFromQbOnlyEpa": 0.04}))
    assert any("receivers' fumbles" in w for w in why)


def test_a_card_number_that_changes_meaning_says_so():
    why = M.explain(row(v1__={"displayedOverall": 81}, v2__={"standing": 97}))
    assert any("changes meaning" in w and "81" in w and "97" in w for w in why)


def test_ordinals():
    assert [M._o(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22)] == ["st", "nd", "rd", "th", "th", "th", "th", "st", "nd"]
