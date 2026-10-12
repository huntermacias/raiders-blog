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
    built = bc.build((DATA / "contracts.psv").read_text(), json.loads((DATA / "contract-terms.json").read_text()), json.loads((DATA / "contracts.json").read_text())["asOf"])
    assert built == json.loads((DATA / "contracts.json").read_text())
