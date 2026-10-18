"""Penalty flags for /lab/flags: every accepted penalty of a season with who committed it, the situation, what it cost and whether it was
"turnover-like".

    python scripts/lab/build_flags.py --season 2026 --out data/lab/flags-2026.json

Source: nflverse play-by-play (CC BY 4.0) and rosters. Only accepted penalties are here (nflverse sets `penalty` for those; a declined flag
shows up only in the play's text). Regular season only.

Who gets the flag
    player   the penalty names a player (most of them).
    qb       a delay of game before a snap from scrimmage belongs to the quarterback, and the penalty names nobody, so it goes to the
             team's quarterback on the nearest pass play of that game.
    team     too many men on the field, illegal substitution, a defensive delay of game, a delay of game with the punt or field goal unit on, and
             anything else that names no one. These belong to the team and its coaches, not to a player.

What a flag cost
    cost     expected points (EPA) the flag took from the team that committed it. Positive is bad for them. EPA already compares the
             situation before the snap with the one after the penalty is enforced, so it includes yards, the lost down or the free first down.
    dwp      change in the committing team's win probability, in points of percent. Negative is bad for them.

Turnover-like, and why
    gift     the defence's flag gave a team a first down on fourth down, so the team that would have lost the ball kept it (a punt or field
             goal try, or a failed go for it). Roughing or running into the kicker is the classic case.
    wipedTurnover  the defence took the ball away and then its own flag took it back (an interception or fumble recovery that did not count).
    wipedTouchdown  the committing team's own touchdown (a return, say) did not count because of its own flag.
    big      cost of at least BIG_SHARE of an average turnover (TURNOVER_COST expected points). A flag that does the damage of most of a
             giveaway is a turnover in everything but name.
A flag is turnover-like when it has any of these tags.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
PBP_URL = BASE + "/pbp/play_by_play_{season}.csv.gz"
ROSTER_URL = BASE + "/rosters/roster_{season}.csv"
SITE_ABBR = {"LA": "LAR", "STL": "LAR", "OAK": "LV", "SD": "LAC"}
LICENSE = "nflverse play-by-play and rosters, CC BY 4.0. Calculations by Raiders Rundown."

# The average expected points a team loses on an interception or lost fumble, from the 2025 season and the first six weeks of 2026
# (798 giveaways). Fixed, so a flag's tags do not flip from week to week as the sample grows.
TURNOVER_COST = 4.4
BIG_SHARE = 0.6

PRE_SNAP = {
    "False Start", "Defensive Offside", "Offensive Offside", "Neutral Zone Infraction", "Encroachment", "Delay of Game",
    "Defensive Delay of Game", "Defensive Too Many Men on Field", "Offensive Too Many Men on Field", "Illegal Formation",
    "Illegal Shift", "Illegal Motion", "Illegal Substitution",
}
# Belong to the team and its coaches even when a name is recorded.
TEAM_TYPES = {"Defensive Too Many Men on Field", "Offensive Too Many Men on Field", "Illegal Substitution", "Defensive Delay of Game"}
KICKS = {"punt", "kickoff", "field_goal", "extra_point"}

COLS = [
    "game_id", "play_id", "season", "season_type", "week", "game_date", "home_team", "posteam", "defteam", "qtr", "time", "down", "ydstogo",
    "yrdln", "score_differential", "desc", "play_type", "penalty", "penalty_team", "penalty_player_id", "penalty_player_name", "penalty_yards",
    "penalty_type", "first_down_penalty", "epa", "wpa", "drive", "passer_player_id", "passer_player_name", "interception", "fumble_lost",
]


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "player"


def site(abbr):
    return SITE_ABBR.get(abbr, abbr) if isinstance(abbr, str) else abbr


def _num(v, default=0.0) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return default if np.isnan(f) else f


# ---------------------------------------------------------------------------------------------------------------- one flag


def play_kind(play_type, desc: str) -> str:
    """What the play was: punt, kickoff, fg, xp, pass, run, or snap (the flag came before the ball was snapped)."""
    if play_type == "punt":
        return "punt"
    if play_type == "kickoff":
        return "kickoff"
    if play_type == "field_goal":
        return "fg"
    if play_type == "extra_point":
        return "xp"
    if play_type == "pass":
        return "pass"
    if play_type == "run":
        return "run"
    text = str(desc)
    pre = text.split("PENALTY")[0]
    low = pre.lower()
    # "(No Huddle, Shotgun)" and "(Punt formation)" say how the team lined up, not what the play was.
    bare = re.sub(r"\([^)]*\)", "", pre)
    if " punts " in low:
        return "punt"
    if "kicks off" in low or "kickoff" in low:
        return "kickoff"
    if "field goal" in low:
        return "fg"
    if "extra point" in low:
        return "xp"
    if not re.sub(r"[\s.]", "", bare):
        return "snap"
    if re.search(r"\bpass\b|sacked|scrambles|intercepted|spiked|kneel|aborted", low):
        return "pass" if "kneel" not in low else "run"
    return "run"


def culprit_of(row: dict, qb: tuple[str, str] | None, special_formation: bool) -> tuple[str, str | None, str | None]:
    """(kind, id, name) for who the flag is on. See the module note for the rules."""
    ptype = row["penalty_type"]
    if ptype in TEAM_TYPES:
        return "team", None, None
    if ptype == "Delay of Game":
        # Called with the punt or field goal unit on the field it is the special teams' (the coaches'); from scrimmage it is the quarterback's.
        if special_formation or row["play_kind"] in KICKS:
            return "team", None, None
        if qb:
            return "qb", qb[0], qb[1]
        return "team", None, None
    pid = row.get("penalty_player_id")
    if isinstance(pid, str) and pid:
        return "player", pid, str(row.get("penalty_player_name") or "")
    return "team", None, None


def nearest_qb(game: pd.DataFrame, i: int, team: str) -> tuple[str, str] | None:
    """The team's quarterback around row i of its game: the closest earlier pass play, else the closest later one."""
    mine = game[(game["posteam"] == team) & game["passer_player_id"].notna()]
    if mine.empty:
        return None
    before = mine[mine.index < i]
    row = before.iloc[-1] if len(before) else mine.iloc[0]
    return str(row["passer_player_id"]), str(row["passer_player_name"])


def tags_of(r: dict, desc: str, defteam_raw: str | None, cost: float) -> list[str]:
    tags = []
    committed_by_defense = r["penalty_team"] == r["defteam"]
    if committed_by_defense and r["down"] == 4 and r["first_down_penalty"] == 1:
        tags.append("gift")
    if r["nullified"] and committed_by_defense and defteam_raw:
        if "INTERCEPTED" in desc or re.search(rf"recovered by {re.escape(defteam_raw)}-", desc):
            tags.append("wipedTurnover")
    if "TOUCHDOWN NULLIFIED" in desc:
        tags.append("wipedTouchdown")
    if cost >= BIG_SHARE * TURNOVER_COST:
        tags.append("big")
    return tags


def build_flags(pbp: pd.DataFrame) -> list[dict]:
    """One row per accepted penalty of the regular season, oldest first."""
    df = pbp[[c for c in COLS if c in pbp.columns]].copy()
    for c in COLS:
        if c not in df:
            df[c] = np.nan
    df = df[df["season_type"] == "REG"].reset_index(drop=True)
    out: list[dict] = []
    for _gid, game in df.sort_values(["game_id", "play_id"]).groupby("game_id", sort=False):
        game = game.reset_index(drop=True)
        flagged = game.index[game["penalty"].fillna(0) == 1]
        for i in flagged:
            x = game.loc[i]
            pteam_raw = x["penalty_team"]
            if not isinstance(pteam_raw, str) or not isinstance(x["posteam"], str):
                continue
            desc = str(x["desc"] or "")
            kind = play_kind(x["play_type"], desc)
            committed_by_offense = pteam_raw == x["posteam"]
            raw_opp = x["defteam"] if committed_by_offense else x["posteam"]
            epa = _num(x["epa"])
            cost = round(-epa if committed_by_offense else epa, 2)
            wpa = _num(x["wpa"])
            dwp = round((wpa if committed_by_offense else -wpa) * 100, 1)
            special_formation = bool(re.search(r"punt formation|field goal formation|fg formation", desc, re.I))
            qb = nearest_qb(game, i, x["posteam"]) if x["penalty_type"] == "Delay of Game" else None
            row = {"penalty_type": x["penalty_type"], "penalty_player_id": x["penalty_player_id"], "penalty_player_name": x["penalty_player_name"], "play_kind": kind}
            ck, pid, pname = culprit_of(row, qb, special_formation)
            nullified = x["play_type"] == "no_play" or "No Play" in desc
            r = {
                "penalty_team": pteam_raw, "defteam": x["defteam"], "down": _num(x["down"], 0), "first_down_penalty": _num(x["first_down_penalty"]),
                "nullified": nullified,
            }
            tags = tags_of(r, desc, x["defteam"] if isinstance(x["defteam"], str) else None, cost)
            sd = _num(x["score_differential"])
            home = x["home_team"]
            fp = x["yrdln"]
            if isinstance(fp, str) and " " in fp:
                head, tail = fp.split(" ", 1)
                fp = f"{site(head)} {tail}"
            unit = "special" if kind in ("punt", "kickoff", "fg", "xp") else ("offense" if committed_by_offense else "defense")
            out.append(
                {
                    "id": f"{x['game_id']}-{int(x['play_id'])}",
                    "w": int(_num(x["week"])),
                    "g": str(x["game_id"]),
                    "d": str(x["game_date"])[:10] if isinstance(x["game_date"], str) else None,
                    "t": site(pteam_raw),
                    "o": site(raw_opp),
                    "hm": 1 if pteam_raw == home else 0,
                    "q": int(_num(x["qtr"])),
                    "tm": str(x["time"]) if isinstance(x["time"], str) else None,
                    "dn": int(_num(x["down"])) or None,
                    "yd": int(_num(x["ydstogo"])) if _num(x["down"]) else None,
                    "fp": fp if isinstance(fp, str) else None,
                    "mg": int(sd if committed_by_offense else -sd),
                    "ty": str(x["penalty_type"]),
                    "yds": int(_num(x["penalty_yards"])),
                    "au": 1 if _num(x["first_down_penalty"]) == 1 else 0,
                    "np": 1 if nullified else 0,
                    "u": unit,
                    "pl": kind,
                    "c": cost,
                    "wp": dwp,
                    "tg": tags,
                    "ck": ck,
                    "pid": pid,
                    "pn": pname,
                    "ds": re.sub(r"\s+", " ", desc)[:260],
                }
            )
    out.sort(key=lambda f: (f["w"], f["d"] or "", f["g"], int(f["id"].rsplit("-", 1)[1])))
    return out


# ---------------------------------------------------------------------------------------------------------------- players


def build_players(flags: list[dict], roster: pd.DataFrame | None, known: dict[str, dict]) -> dict[str, dict]:
    """{id: {n: name, t: latest team, p: position, s: page slug}} for everyone a flag is on. `known` maps ids to the site's own player pages."""
    pos = {}
    names = {}
    if roster is not None and len(roster):
        for r in roster.itertuples():
            gid = getattr(r, "gsis_id", None)
            if isinstance(gid, str):
                pos[gid] = getattr(r, "position", None)
                names[gid] = getattr(r, "full_name", None)
    latest: dict[str, dict] = {}
    for f in flags:
        if f["pid"]:
            latest[f["pid"]] = {"n": f["pn"], "t": f["t"], "w": f["w"]}
    taken: dict[str, str] = {}
    out: dict[str, dict] = {}
    for pid in sorted(latest):
        info = latest[pid]
        name = names.get(pid) if isinstance(names.get(pid), str) else info["n"]
        slug = known.get(pid, {}).get("slug") or slugify(name)
        if slug in taken and taken[slug] != pid:
            slug = f"{slug}-{pid.split('-')[-1][-4:]}"
        taken[slug] = pid
        position = known.get(pid, {}).get("pos") or pos.get(pid)
        out[pid] = {"n": name, "t": info["t"], "p": position if isinstance(position, str) else None, "s": slug}
    # A quarterback charged with a delay of game is a quarterback.
    for f in flags:
        if f["ck"] == "qb" and f["pid"] in out and not out[f["pid"]]["p"]:
            out[f["pid"]]["p"] = "QB"
    return out


# ---------------------------------------------------------------------------------------------------------------- loading


def _read(where: str) -> pd.DataFrame:
    if "://" not in where:
        return pd.read_csv(where, low_memory=False)
    with urllib.request.urlopen(where, timeout=180) as resp:  # noqa: S310 - fixed https URLs
        data = resp.read()
    if where.endswith(".gz"):
        data = gzip.decompress(data)
    return pd.read_csv(io.BytesIO(data), low_memory=False)


def known_players(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text())["players"]
    except (ValueError, KeyError):
        return {}
    return {p["id"]: {"slug": p.get("slug"), "pos": p.get("pos")} for p in rows if p.get("id")}


def build(season: int, folder: str | None, players_file: Path) -> dict:
    pbp_src = str(Path(folder) / f"play_by_play_{season}.csv.gz") if folder else PBP_URL.format(season=season)
    pbp = _read(pbp_src)
    roster = None
    for s in (season, season - 1):
        try:
            where = str(Path(folder) / f"roster_{s}.csv") if folder else ROSTER_URL.format(season=s)
            roster = _read(where)
            break
        except Exception as e:  # noqa: BLE001 - a missing roster only costs positions
            print(f"flags: no roster for {s}: {e}", file=sys.stderr)
    flags = build_flags(pbp)
    return {
        "season": season,
        "week": max((f["w"] for f in flags), default=0),
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": LICENSE,
        "turnoverCost": TURNOVER_COST,
        "bigShare": BIG_SHARE,
        "players": build_players(flags, roster, known_players(players_file)),
        "flags": flags,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--folder", help="a folder that already holds play_by_play_<season>.csv.gz and roster_<season>.csv")
    ap.add_argument("--players", default="data/lab/players.json", help="the site's player profiles, so flags link to a player's page")
    a = ap.parse_args()
    result = build(a.season, a.folder, Path(a.players))
    out = Path(a.out)
    new = json.dumps(result, separators=(",", ":"), sort_keys=True) + "\n"
    # generatedAt moves on every run; the file is rewritten only when the flags themselves changed.
    if out.exists():
        try:
            old = json.loads(out.read_text())
            if all(old.get(k) == result[k] for k in ("flags", "players", "week", "turnoverCost", "bigShare")):
                print("flags: nothing changed")
                return 0
        except ValueError:
            pass
    out.write_text(new)
    print(f"flags: wrote {len(result['flags'])} flags for {a.season} to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
