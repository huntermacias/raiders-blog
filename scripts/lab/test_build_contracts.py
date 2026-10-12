import json
from pathlib import Path

import pytest

import build_contracts as bc

DATA = Path(__file__).resolve().parents[2] / "data" / "lab"


def test_parses_rows_and_blank_apy():
    rows = bc.parse_psv("# c\nLV|Matt Gay|K||2.1\nLV|A B|QB|14.3|10.4\n")
    assert rows[0] == {"team": "LV", "name": "Matt Gay", "pos": "K", "apy": None, "cap": 2.1}
    assert rows[1]["apy"] == 14.3


def test_rejects_bad_rows():
    with pytest.raises(ValueError):
        bc.parse_psv("LV|Only|Three\n")
    with pytest.raises(ValueError):
        bc.parse_psv("LV|A|QB|1|x\n")
    with pytest.raises(ValueError):
        bc.parse_psv("LV|A|QB|1|1\nLV|A|QB|1|1\n")


def test_terms_must_match_a_row():
    with pytest.raises(ValueError):
        bc.build("LV|A|QB|1|1\n", {"terms": {"LV|B": {"total": 1}}}, "2026-10-12")


def test_committed_json_is_what_the_sources_build():
    built = bc.build((DATA / "contracts.psv").read_text(), json.loads((DATA / "contract-terms.json").read_text()), json.loads((DATA / "contracts.json").read_text())["asOf"], (DATA / "guarantees.psv").read_text())
    assert built == json.loads((DATA / "contracts.json").read_text())


def test_guarantees_fill_only_players_without_hand_entered_terms():
    psv = "LV|Maxx Crosby|EDGE|35.5|35.8\nSEA|Jaxon Smith-Njigba|WR|42.1|10.4\nHOU|Will Anderson Jr|EDGE|37.5|12\nSEA|Nobody Here|WR|1|1\n"
    g = "Maxx Crosby|EDGE|Raiders|1|1|1\nJaxon Smith-Njigba|WR|Seahawks|168.6|42.15|69.131\nWill Anderson Jr.|EDGE|Texans|150|50|100.064\n"
    doc = bc.build(psv, {"terms": {"LV|Maxx Crosby": {"guaranteed": 62.5}}}, "2026-10-12", g)
    by = {r["name"]: r for r in doc["players"]}
    assert by["Maxx Crosby"]["terms"] == {"guaranteed": 62.5}  # the hand entry wins
    assert by["Jaxon Smith-Njigba"]["terms"] == {"total": 168.6, "guaranteed": 69.131, "years": 4}
    assert by["Will Anderson Jr"]["terms"]["guaranteed"] == 100.064  # suffix punctuation does not matter
    assert "terms" not in by["Nobody Here"]


def test_a_player_on_another_team_in_the_two_lists_matches_only_when_unique_and_the_pay_agrees():
    psv = "ARI|Marvin Harrison Jr.|WR|5.9|5.9\nSEA|Jake Smith|WR|2|2\nMIA|Pat Moved|WR|3|3\n"
    g = ("Marvin Harrison Jr.|WR|Texans|20|5.9|2\nJake Smith|WR|Bears|9|9|1\n"
         "Pat Moved|WR|Jets|3|3|1\nPat Moved|WR|Giants|3.1|3.1|1\n")
    by = {r["name"]: r for r in bc.build(psv, {}, "2026-10-12", g)["players"]}
    assert by["Marvin Harrison Jr."]["terms"]["guaranteed"] == 2  # moved teams, same pay
    assert "terms" not in by["Jake Smith"]  # different pay: a different player with the same name
    assert "terms" not in by["Pat Moved"]  # two candidates: no guess


def test_length_is_only_given_when_total_over_apy_is_a_whole_number():
    assert bc.terms_from_list({"total": 100.0, "apy": 25.0, "guaranteed": 10.0})["years"] == 4
    assert "years" not in bc.terms_from_list({"total": 100.0, "apy": 30.0, "guaranteed": 10.0})


def test_every_guarantee_row_is_well_formed():
    rows = bc.parse_guarantees((DATA / "guarantees.psv").read_text())
    assert len(rows) > 900
    assert all(r["total"] >= 0 and r["apy"] > 0 and r["guaranteed"] >= 0 and r["nick"] in bc.NICK.values() for r in rows)
