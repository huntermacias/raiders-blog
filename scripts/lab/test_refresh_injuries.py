import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_units as b  # noqa: E402
import refresh_injuries as r  # noqa: E402

WED = "2026-10-07T20:00:00Z"
THU = "2026-10-08T20:00:00Z"
FRI = "2026-10-09T20:00:00Z"
DNP, LTD, FULL = "Did Not Participate In Practice", "Limited Participation in Practice", "Full Participation in Practice"


def row(name, practice, status=np.nan, week=5, team="AAA", pos="WR", injury="Knee", gsis=None):
    return dict(season=2026, team=team, week=week, gsis_id=gsis or "g-" + name, position=pos, full_name=name, report_status=status,
                report_primary_injury=injury, practice_primary_injury=injury, practice_status=practice)


def src(rows):
    roster = pd.DataFrame([dict(gsis_id=x["gsis_id"], pfr_id="P." + x["gsis_id"], full_name=x["full_name"], position=x["position"], team=x["team"]) for x in rows])
    snaps = pd.DataFrame([dict(pfr_player_id="P." + x["gsis_id"], player=x["full_name"], team=x["team"], position=x["position"], offense_pct=0.9, defense_pct=0.0, st_pct=0.0) for x in rows])
    return {"injuries": pd.DataFrame(rows), "roster": roster, "snaps": snaps}


def units(injuries=None):
    team = lambda inj: {"g": 3, "injuries": inj or {"week": None, "players": []}, "groups": {"qb": {"score": 1}}}
    return {"season": 2026, "week": 4, "generatedAt": "2026-10-06T10:00:00Z", "source": "x", "slate": None, "teams": {"AAA": team(injuries), "BBB": team(None)}}


def test_replaces_only_the_injury_reports_and_stamps_the_time():
    out, changed = r.refresh(units(), src([row("Walt", DNP, "Out")]), FRI)
    assert changed == ["AAA"]
    assert out["injuriesUpdatedAt"] == FRI
    assert out["teams"]["AAA"]["injuries"]["week"] == 5
    assert out["teams"]["AAA"]["groups"] == {"qb": {"score": 1}}
    assert out["teams"]["BBB"]["injuries"] == {"week": None, "players": []}
    assert out["generatedAt"] == "2026-10-06T10:00:00Z" and out["slate"] is None


def test_a_player_gets_a_trail_that_grows_only_when_his_status_changes():
    u, _ = r.refresh(units(), src([row("Walt", DNP)]), WED)
    u, changed = r.refresh(u, src([row("Walt", DNP)]), THU)
    assert changed == [] and u["injuriesUpdatedAt"] == WED
    u, changed = r.refresh(u, src([row("Walt", LTD)]), THU)
    u, changed = r.refresh(u, src([row("Walt", FULL)]), FRI)
    assert changed == ["AAA"]
    walt = u["teams"]["AAA"]["injuries"]["players"][0]
    assert [(t["at"], t["practice"]) for t in walt["trail"]] == [(WED, "DNP"), (THU, "Limited"), (FRI, "Full")]
    assert walt["status"] == "Full" and u["injuriesUpdatedAt"] == FRI


def test_a_game_designation_is_a_new_step_even_when_practice_did_not_change():
    u, _ = r.refresh(units(), src([row("Walt", LTD)]), THU)
    u, changed = r.refresh(u, src([row("Walt", LTD, "Questionable")]), FRI)
    assert changed == ["AAA"]
    steps = u["teams"]["AAA"]["injuries"]["players"][0]["trail"]
    assert [(t["practice"], t["status"]) for t in steps] == [("Limited", "Limited"), ("Limited", "Questionable")]


def test_the_trail_starts_over_with_a_new_report_week():
    u, _ = r.refresh(units(), src([row("Walt", DNP, week=5)]), FRI)
    u, _ = r.refresh(u, src([row("Walt", LTD, week=6)]), "2026-10-14T20:00:00Z")
    walt = u["teams"]["AAA"]["injuries"]["players"][0]
    assert u["teams"]["AAA"]["injuries"]["week"] == 6
    assert [t["practice"] for t in walt["trail"]] == ["Limited"]


def test_an_unchanged_report_changes_nothing():
    u, _ = r.refresh(units(), src([row("Walt", DNP, "Out")]), WED)
    again, changed = r.refresh(u, src([row("Walt", DNP, "Out")]), FRI)
    assert changed == [] and again == u


def test_players_with_the_same_name_on_different_teams_keep_separate_trails():
    rows = [row("Sam Smith", LTD, team="AAA", gsis="g1"), row("Sam Smith", DNP, team="BBB", gsis="g2")]
    u, _ = r.refresh(units(), src(rows), THU)
    assert [p["trail"][0]["practice"] for p in (u["teams"]["AAA"]["injuries"]["players"][0], u["teams"]["BBB"]["injuries"]["players"][0])] == ["Limited", "DNP"]


def write(tmp_path, data):
    f = tmp_path / "units.json"
    f.write_text(json.dumps(data))
    return f


def folder(tmp_path, s):
    d = tmp_path / "src"
    d.mkdir()
    s["injuries"].to_csv(d / "injuries_2026.csv", index=False)
    s["roster"].to_csv(d / "roster_2026.csv", index=False)
    s["snaps"].to_csv(d / "snap_counts_2026.csv", index=False)
    return d


def test_the_cli_writes_when_something_changed_and_leaves_the_file_alone_otherwise(tmp_path, capsys):
    f = write(tmp_path, units())
    d = folder(tmp_path, src([row("Walt", DNP, "Out")]))
    assert r.main(["--season", "2026", "--units", str(f), "--input", str(d)]) == 0
    first = f.read_text()
    assert json.loads(first)["teams"]["AAA"]["injuries"]["players"][0]["name"] == "Walt"
    capsys.readouterr()
    assert r.main(["--season", "2026", "--units", str(f), "--input", str(d)]) == 0
    assert "unchanged" in capsys.readouterr().out
    assert f.read_text() == first


def test_an_empty_download_keeps_the_existing_reports(tmp_path, capsys):
    keep = units({"week": 5, "players": [{"name": "Walt", "pos": "WR", "group": "rec", "status": "Out", "practice": "DNP", "injury": None, "starter": True, "snap": 0.9}]})
    f = write(tmp_path, keep)
    d = folder(tmp_path, {"injuries": pd.DataFrame(columns=list(row("x", DNP).keys())), "roster": src([row("x", DNP)])["roster"], "snaps": src([row("x", DNP)])["snaps"]})
    assert r.main(["--season", "2026", "--units", str(f), "--input", str(d)]) == 0
    assert json.loads(f.read_text()) == keep
    assert "empty" in capsys.readouterr().err


def test_a_different_season_or_a_missing_file_is_not_touched(tmp_path):
    f = write(tmp_path, units())
    d = folder(tmp_path, src([row("Walt", DNP, "Out")]))
    before = f.read_text()
    assert r.main(["--season", "2025", "--units", str(f), "--input", str(d)]) == 0 and f.read_text() == before
    assert r.main(["--season", "2026", "--units", str(tmp_path / "none.json"), "--input", str(d)]) == 1
