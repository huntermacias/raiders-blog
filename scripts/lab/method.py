"""The Player Lab's grading method, version 2: what a grade means, which jobs get one, and how it is made.

Everything here is a decision that can be argued with, so it is written down in one place and read by the builder, the validation
studies and the pages (the pages get the same facts from `method` in players.json). The evidence behind each decision is in
`data/lab/validation.json` and `data/lab/validation-positions.json`, made by `validate_methodology.py` and `validate_positions.py`.

Four layers are kept apart and never summed into one score:

    observed       what he did: the raw rate, and his rank among players with enough volume
    adjusted       the same, once the strength of the opposition is taken out (only where the evidence says it matters)
    estimate       what his level most likely is: his observed rate pulled toward the league and toward his own earlier seasons
                   by how little volume is behind it. This is the "grade". It always carries an interval.
    contribution   what he added: total EPA above an average player over the plays he had, in total and per game

The grade scale is fixed. 50 is the average player at his job in this season (weighted by plays, so a backup who got three snaps does
not move it). Ten points is one standard deviation of *true* differences between players on that stat, measured on 2018-2025, not the
spread of this season's numbers. The scale therefore reads the same in week 5 as in week 18 and the same in 2026 as in 2024. A grade is
about the player's level on the thing measured, not a judgement of his talent: the stat also carries his scheme, teammates and role.
"""

from __future__ import annotations

import json
from pathlib import Path

METHOD_VERSION = 2
METHOD_NAME = "Rundown method v2"

# 50 = the average player at the job. Ten points = one standard deviation of true differences between players on that stat.
SCALE_CENTER = 50.0
SCALE_PER_SD = 10.0
# The interval shown with every grade is the 80% range. The model's own standard errors come out too narrow when replayed on real
# seasons, so they are widened by a factor LEARNED from completed seasons (build_calibration.py -> data/lab/calibration-v2.json): the
# smallest width at which 80% of outcomes (quarterbacks, estimates made after 4, 5, 8 and 10 games, scored on the rest of the season,
# 2019-2025, the league's quarterback-only EPA) fall inside it. It is tested chronologically: each season scored with a width learned
# only from earlier seasons held 83% of outcomes in the 80% range and 97% in the 95% range. Intervals around the same centres can
# only widen, so coverage can only rise with the factor. A test keeps this constant equal to the file.
INTERVAL_LEVEL = 0.80
INTERVAL_Z = 1.2816
INTERVAL_CALIBRATION = 1.45
# A grade is withheld from a stat whose true differences are too small, next to the noise in a season of it, to say anything about a player.
# (This is a floor for display. Whether a job gets a grade at all is the policy below, decided stat by stat on the evidence.)

# Per job: how its grade is made.
#   primary     one stat is the grade; the others are components, graded on the same scale and shown beside it, never averaged in
#   components  no single grade is defensible; each component carries its own clearly named grade
#   none        no estimate is published; the job gets production, role and context only
# `grade` lists the stats that get an estimate on the fixed scale. Every other stat with a better and a worse end is OBSERVED: shown with its
# raw value and rank among players with enough volume, and never turned into a grade. A stat with no better end is a STYLE stat.
POLICY: dict[str, dict] = {
    "qb": {
        "mode": "primary", "primary": "epaDb", "grade": ["epaDb", "success", "cpoe", "sackRate"],
        "name": "Passing value", "unit": "EPA per dropback",
        "why": "EPA per dropback (passes, sacks and scrambles) is the most reliable quarterback number and the best predictor of the next stretch; success rate, "
               "win probability added and mixes of them predict no better. It still carries his scheme, protection and receivers.",
    },
    "rb": {
        "mode": "components", "primary": None, "grade": ["explosive", "yco"],
        "name": "Rushing components", "unit": "per carry",
        "why": "Rushing EPA and success rate barely repeat from one season to the next (r = .13), so no overall grade is defensible. Explosive-run rate and yards "
               "after contact are graded as separate components; they overlap (a back who breaks tackles also breaks long runs), so they are never averaged. "
               "Rushing yards over expected is tracking data that covers only some carries and repeats poorly (reliability about .26): it is shown as an observed "
               "number with the carries it covers, and is not graded.",
    },
    "wr": {
        "mode": "primary", "primary": "success", "grade": ["success", "epaTgt", "firstDown", "croe", "yacOe"],
        "name": "Receiving efficiency", "unit": "success rate on targets",
        "why": "Success rate on targets is more reliable than EPA per target (a few long plays swing EPA) and predicts next season as well. It is efficiency, "
               "not role: targets and depth of target describe how he is used. Separation at the moment the pass arrives, measured only on his targets, describes how "
               "open the quarterback found him; it is not a measure of route running on every play, and it is shown apart and never graded.",
    },
    "te": {
        "mode": "primary", "primary": "success", "grade": ["success", "epaTgt", "firstDown", "croe", "yacOe"],
        "name": "Receiving efficiency", "unit": "success rate on targets",
        "why": "Same as receivers: success rate on targets, with role (targets, depth of target) and the tracking description of how open he was when targeted shown apart. Tight ends have few targets, so the interval is wide.",
    },
    "edge": {
        "mode": "primary", "primary": "pressRate", "grade": ["pressRate", "tflRate"],
        "name": "Pass rush", "unit": "pressures per 100 snaps",
        "why": "Pressure rate is both reliable and persistent for pass rushers; sacks are not, and tackling is a different trait.",
    },
    "idl": {
        "mode": "primary", "primary": "pressRate", "grade": ["pressRate", "tflRate"],
        "name": "Pass rush", "unit": "pressures per 100 snaps",
        "why": "Same as edge rushers.",
    },
    # No grade: the stable numbers for these jobs describe how the defense uses the player, and the results he is on the field for are shared
    # by the whole coverage or front. The public data has no assignment (who covered whom), so individual attribution is not possible.
    "lb": {"mode": "none", "primary": None, "grade": [], "name": "Production and role", "unit": "",
           "why": "A linebacker's stable numbers are tackles and targets per snap, which are role (year to year r = .81). His coverage results do not repeat (r = .12). "
                  "The public data does not say who he covered, so these are production and context, not a quality grade."},
    "cb": {"mode": "none", "primary": None, "grade": [], "name": "Production and role", "unit": "",
           "why": "Yards per target allowed does not repeat from one season to the next (r = .06) and the public data does not say who a corner covered. "
                  "What follows is what happened when he was targeted, not a judgement of him."},
    "saf": {"mode": "none", "primary": None, "grade": [], "name": "Production and role", "unit": "",
            "why": "A safety's coverage results do not repeat from season to season (r = .05 to .13) and are shared with the coverage around him. These are production and context."},
    # No individual blocking data is public. Penalties are the only thing charged to one lineman.
    "ol": {"mode": "none", "primary": None, "grade": [], "name": "Record", "unit": "",
           "why": "The public data has no block won or lost for a single lineman. His line's numbers are shared by the five who start together."},
    # Specialists are measured on their own plays and have long track records; they keep a primary grade on the same fixed scale.
    # Specialists are measured on their own plays. Where the measurement shows a number does not repeat, it is shown as production only.
    "k": {"mode": "components", "primary": None, "grade": ["koEpa"], "name": "Kicking components", "unit": "",
          "why": "Field goals made above what the distance predicts do not repeat from one season to the next (r is about zero), so they are shown as production "
                 "and never graded. Kickoff value does repeat a little, and is graded as its own component."},
    "p": {"mode": "primary", "primary": "epaPunt", "grade": ["epaPunt", "net"], "name": "Punting value", "unit": "EPA per punt",
          "why": "Expected points added per punt, with net yards as a second view. Both repeat modestly from season to season."},
    "pr": {"mode": "none", "primary": None, "grade": [], "name": "Production", "unit": "",
           "why": "A punt returner's value per return is almost all situation: the measured reliability of it across seasons is close to zero. Shown as production."},
    "kr": {"mode": "primary", "primary": "epaRet", "grade": ["epaRet", "retAvg"], "name": "Return value", "unit": "EPA per return",
           "why": "Expected points added per kickoff return, with average return yards as a second view."},
}

# Stats whose total, measured against an average player over the same plays, is a player's contribution (EPA above average).
# {group: [(stat key, label for the total, counts of what)]}
CONTRIBUTION: dict[str, list[tuple[str, str]]] = {
    "qb": [("epaDb", "dropbacks"), ("epaRun", "designed runs")],
    "rb": [("epaRush", "carries"), ("recEpaTgt", "targets")],
    "wr": [("epaTgt", "targets")],
    "te": [("epaTgt", "targets")],
    "k": [("koEpa", "kickoffs")],
    "p": [("epaPunt", "punts")],
    "pr": [("epaRet", "returns")],
    "kr": [("epaRet", "returns")],
}


def graded_stats(group: str) -> list[str]:
    return list(POLICY.get(group, {}).get("grade", []))


def is_graded(group: str, key: str) -> bool:
    return key in POLICY.get(group, {}).get("grade", [])


def mode_of(group: str) -> str:
    return POLICY.get(group, {}).get("mode", "none")


def _calibration() -> dict | None:
    """The validated pairwise chances (data/lab/calibration-v2.json), or None when the file is absent: no file, no published chances."""
    p = Path(__file__).resolve().parents[2] / "data" / "lab" / "calibration-v2.json"
    if not p.exists():
        return None
    c = json.loads(p.read_text())
    pw = c["pairwise"]
    return {"target": c["target"], "cutoffGames": c["cutoffGames"], "display": c["display"],
            "buckets": [{"lo": float(b["bucket"].split("-")[0]), "claimed": round(b["claimed"], 3), "realized": round(b["realized"], 3), "pairs": b["pairs"], "publish": b["publish"]} for b in pw["buckets"]],
            "coverage": {k: round(v, 3) if isinstance(v, float) else v for k, v in c["coverage"]["pooled"][str(INTERVAL_CALIBRATION)].items()},
            "chronological": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in c["coverage"]["chronological"].items()},
            "players": pw["players"], "playerSeasonCutoffs": pw["playerSeasonCutoffs"], "pairs": pw["pairs"]}


def public() -> dict:
    """What the pages are told about the method, in players.json."""
    return {
        "version": METHOD_VERSION, "name": METHOD_NAME,
        "scale": {"center": SCALE_CENTER, "perSd": SCALE_PER_SD, "interval": INTERVAL_LEVEL, "z": INTERVAL_Z, "calibration": INTERVAL_CALIBRATION},
        "policy": {g: {"mode": p["mode"], "primary": p["primary"], "grade": p["grade"], "name": p["name"], "unit": p["unit"], "why": p["why"]} for g, p in POLICY.items()},
        "contribution": {g: [{"k": k, "of": of} for k, of in rows] for g, rows in CONTRIBUTION.items()},
        "pairwise": _calibration(),
    }
