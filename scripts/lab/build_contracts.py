"""Build data/lab/contracts.json from the two hand-kept files beside it.

    data/lab/contracts.psv        team | player | pos | APY ($M) | 2026 cap hit ($M)
    data/lab/contract-terms.json  optional full terms for some players (years, total, guaranteed, cap by year)

There is no free feed of current NFL contracts (the nflverse file stops at 2022 signings), so these are kept by hand
from public cap sites and carry an "as of" date. Run:  python3 build_contracts.py [--as-of 2026-10-12]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data" / "lab"
CAP_2026 = 301.2  # NFL announcement, $M per team


def parse_psv(text: str) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 5:
            raise ValueError(f"line {n}: expected 5 fields, got {len(parts)}: {line!r}")
        team, name, pos, apy, cap = parts
        if not team or not name:
            raise ValueError(f"line {n}: team and player are required")
        key = (team, name)
        if key in seen:
            raise ValueError(f"line {n}: {team} {name} appears twice")
        seen.add(key)
        try:
            capv = float(cap)
            apyv = float(apy) if apy else None
        except ValueError as e:
            raise ValueError(f"line {n}: bad number in {line!r}") from e
        if capv < 0 or (apyv is not None and apyv <= 0):
            raise ValueError(f"line {n}: money out of range")
        row: dict = {"team": team, "name": name, "pos": pos or None, "apy": apyv, "cap": capv}
        rows.append(row)
    return rows


def build(psv: str, terms_doc: dict, as_of: str) -> dict:
    rows = parse_psv(psv)
    terms = terms_doc.get("terms", {})
    known = {f"{r['team']}|{r['name']}" for r in rows}
    missing = [k for k in terms if k not in known]
    if missing:
        raise ValueError(f"terms for players not in contracts.psv: {missing}")
    for r in rows:
        t = terms.get(f"{r['team']}|{r['name']}")
        if t:
            r["terms"] = t
    teams = sorted({r["team"] for r in rows})
    return {
        "season": 2026,
        "asOf": as_of,
        "salaryCap": CAP_2026,
        "teams": teams,
        "sources": [
            {"name": "StickToTheModel team cap pages", "url": "https://sticktothemodel.com/teams/LV/roster", "for": "APY and 2026 cap hit"},
            {"name": "OverTheCap player pages", "url": "https://overthecap.com/", "for": "years, total value, guaranteed money, cap hit by year"},
        ],
        "players": rows,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", default=None, help="date the numbers were read, YYYY-MM-DD")
    args = ap.parse_args(argv)
    out_path = DATA / "contracts.json"
    as_of = args.as_of
    if not as_of:
        as_of = json.loads(out_path.read_text())["asOf"] if out_path.exists() else None
    if not as_of:
        print("pass --as-of YYYY-MM-DD the first time", file=sys.stderr)
        return 2
    doc = build((DATA / "contracts.psv").read_text(), json.loads((DATA / "contract-terms.json").read_text()), as_of)
    out_path.write_text(json.dumps(doc, indent="\t", ensure_ascii=False) + "\n")
    print(f"{len(doc['players'])} contracts across {len(doc['teams'])} teams -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
