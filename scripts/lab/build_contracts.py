"""Build data/lab/contracts.json from the two hand-kept files beside it.

    data/lab/contracts.psv        team | player | pos | APY ($M) | 2026 cap hit ($M)
    data/lab/contract-terms.json  optional full terms for some players (years, total, guaranteed, cap by year)
    data/lab/guarantees.psv       OverTheCap's contracts list: team nickname | player | pos | total | APY | total guaranteed ($M)

There is no free feed of current NFL contracts (the nflverse file stops at 2022 signings), so these are kept by hand
from public cap sites and carry an "as of" date. Run:  python3 build_contracts.py [--as-of 2026-10-12]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
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


NICK = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears", "CIN": "Bengals", "CLE": "Browns",
    "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers", "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs",
    "LV": "Raiders", "LAC": "Chargers", "LAR": "Rams", "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
    "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SF": "49ers", "SEA": "Seahawks", "TB": "Buccaneers", "TEN": "Titans", "WAS": "Commanders",
}
SUFFIX = {"jr", "sr", "ii", "iii", "iv", "v"}
ALIASES = {"sauce gardner": "ahmad gardner", "riq woolen": "tariq woolen"}


def name_key(name: str) -> str:
    """Mirrors nameKey in lib/lab/contractsKit.ts: no case, accents, dots, apostrophes, commas, hyphens or Jr./III."""
    t = unicodedata.normalize("NFD", name)
    t = re.sub(r"[\u0300-\u036f]", "", t).lower()
    t = re.sub(r"[.'\u2019`,]", "", t).replace("-", " ")
    parts = t.split()
    while len(parts) > 1 and parts[-1] in SUFFIX:
        parts.pop()
    k = " ".join(parts)
    return ALIASES.get(k, k)


def short_key(name: str) -> str:
    parts = name_key(name).split(" ")
    return f"{parts[0][0]} {parts[-1]}" if len(parts) > 1 else parts[0]


def parse_guarantees(text: str) -> list[dict]:
    out: list[dict] = []
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 6:
            raise ValueError(f"guarantees line {n}: expected 6 fields, got {len(parts)}: {line!r}")
        name, pos, nick, total, apy, gtd = parts
        try:
            out.append({"name": name, "pos": pos, "nick": nick, "total": float(total), "apy": float(apy), "guaranteed": float(gtd)})
        except ValueError as e:
            raise ValueError(f"guarantees line {n}: bad number in {line!r}") from e
    return out


def terms_from_list(g: dict) -> dict:
    """What the OverTheCap list alone can say: total value, fully guaranteed money, and (when total / APY is a whole number) the length."""
    t: dict = {"total": g["total"], "guaranteed": g["guaranteed"]}
    if g["apy"] > 0:
        yrs = g["total"] / g["apy"]
        if abs(yrs - round(yrs)) < 0.15 and 1 <= round(yrs) <= 10:
            t["years"] = int(round(yrs))
    return t


def attach_guarantees(rows: list[dict], guarantees: list[dict]) -> int:
    """Give every contract with no hand-entered terms the list's numbers. Returns how many matched."""
    by_team: dict[str, dict[str, list[dict]]] = {}
    by_short: dict[str, dict[str, list[dict]]] = {}
    for g in guarantees:
        by_team.setdefault(g["nick"], {}).setdefault(name_key(g["name"]), []).append(g)
        by_short.setdefault(g["nick"], {}).setdefault(short_key(g["name"]), []).append(g)
    n = 0
    for r in rows:
        if "terms" in r:
            continue
        nick = NICK.get(r["team"])
        cands = by_team.get(nick, {}).get(name_key(r["name"]), [])
        if len(cands) != 1:
            cands = by_short.get(nick, {}).get(short_key(r["name"]), []) if not cands else cands
        if len(cands) > 1 and r["apy"]:
            cands = [c for c in cands if abs(c["apy"] - r["apy"]) < 0.2]
        if len(cands) == 1:
            r["terms"] = terms_from_list(cands[0])
            n += 1
    return n


def build(psv: str, terms_doc: dict, as_of: str, guarantees: str = "") -> dict:
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
    if guarantees:
        attach_guarantees(rows, parse_guarantees(guarantees))
    teams = sorted({r["team"] for r in rows})
    return {
        "season": 2026,
        "asOf": as_of,
        "salaryCap": CAP_2026,
        "teams": teams,
        "sources": [
            {"name": "StickToTheModel team cap pages", "url": "https://sticktothemodel.com/teams/LV/roster", "for": "APY and 2026 cap hit"},
            {"name": "OverTheCap contracts list and player pages", "url": "https://overthecap.com/contracts", "for": "total value, fully guaranteed money, and (for a few players) years and cap hit by year"},
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
    g_path = DATA / "guarantees.psv"
    doc = build((DATA / "contracts.psv").read_text(), json.loads((DATA / "contract-terms.json").read_text()), as_of, g_path.read_text() if g_path.exists() else "")
    out_path.write_text(json.dumps(doc, indent="\t", ensure_ascii=False) + "\n")
    print(f"{len(doc['players'])} contracts across {len(doc['teams'])} teams -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
