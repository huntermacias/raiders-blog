"""Situational football: how a player does on each down, at each distance, and in the red zone.

Three jobs, each measured over the plays a player is on the field for in that job:

    rush   every carry (a quarterback's scrambles included)
    pass   every dropback, which includes his sacks
    rec    every target, caught or not

Every play is put in a cell of down (1-4) by distance to go (short 1-3, medium 4-6, long 7-10, extra long 11+). A cell holds sums, never
averages, so any set of cells (all of third down, say) is a sum over a sum:

    [plays, yards, successful plays, EPA, first downs or touchdowns, touchdowns, extra]

`extra` is the one thing that belongs to the job: carries of 10+ yards (rush), sacks (pass, where fewer is better), catches (rec).

The league's own cells and the spread of every split across qualifying players are written beside them, so a reader never sees a
number without what a typical player does in the same spot. A player is compared only with players of his own position and job
("rush.rb" is running backs carrying the ball, "rush.qb" is quarterbacks running it).

The play-by-play of every game is kept too, a few bytes a play, so a reader can open any one game and see each snap as a success or a
failure.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

NEEDS = ["down", "ydstogo", "yardline_100", "epa", "success", "yards_gained", "play_type", "game_id", "play_id", "week"]
BUCKETS = (("S", 3), ("M", 6), ("L", 10), ("X", 999))
ROLES = {"rush": "rusher_player_id", "pass": "passer_player_id", "rec": "receiver_player_id"}
# Which jobs are compared with which position. A receiver who carries the ball once is not graded as a runner.
COMBOS = ("rush.rb", "rush.qb", "pass.qb", "rec.wr", "rec.te", "rec.rb")
# The most plays a player needs in the whole job before he is ranked at all; splits ask for a share of this.
BASE_MIN = {"rush": 20, "pass": 40, "rec": 12}
MIN_PLAYS_KEPT = 3
RED_ZONE = 20
MIN_PEERS = 8

FIRST_DOWN, TOUCHDOWN, TURNOVER, SACK, INCOMPLETE, SCRAMBLE = 1, 2, 4, 8, 16, 32


def bucket(dist: float) -> str:
    for name, top in BUCKETS:
        if dist <= top:
            return name
    return "X"


def _num(df: pd.DataFrame, name: str) -> pd.Series:
    return pd.to_numeric(df[name], errors="coerce").fillna(0) if name in df else pd.Series(0.0, index=df.index)


def role_plays(pbp: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """One table per job: a row per play with the player, the situation, the result and the flags."""
    if not set(NEEDS) <= set(pbp.columns):
        return {}
    df = pbp[pbp["play_type"].isin(["run", "pass"])].copy()
    df["down"] = pd.to_numeric(df["down"], errors="coerce")
    keep = df["down"].between(1, 4) & df["epa"].notna() & df["success"].notna() & df["ydstogo"].notna() & df["yardline_100"].notna()
    df = df[keep]
    if df.empty:
        return {}
    fd = (_num(df, "first_down") == 1) | (_num(df, "touchdown") == 1)
    td = _num(df, "touchdown") == 1
    turnover = (_num(df, "interception") == 1) | (_num(df, "fumble_lost") == 1)
    sack = _num(df, "sack") == 1
    incomplete = (df["play_type"] == "pass") & ~sack & (_num(df, "complete_pass") != 1)
    scramble = _num(df, "qb_scramble") == 1
    flags = fd * FIRST_DOWN + td * TOUCHDOWN + turnover * TURNOVER + sack * SACK + incomplete * INCOMPLETE + scramble * SCRAMBLE
    yards = _num(df, "yards_gained")
    base = pd.DataFrame({
        "week": df["week"].astype(int), "play_id": df["play_id"], "qtr": _num(df, "qtr").astype(int), "down": df["down"].astype(int),
        "dist": df["ydstogo"].astype(float).round().astype(int), "yl": df["yardline_100"].astype(float).round().astype(int),
        "yds": yards.round().astype(int), "succ": df["success"].astype(float).round().astype(int), "epa": df["epa"].astype(float),
        "fd": fd.astype(int), "td": td.astype(int), "flags": flags.astype(int),
    }, index=df.index)
    base["bucket"] = [bucket(d) for d in base["dist"]]
    out: dict[str, pd.DataFrame] = {}
    for role, idcol in ROLES.items():
        if idcol not in df:
            continue
        if role == "rush":
            take = df["play_type"] == "run"
            x = (yards >= 10).astype(int)
        elif role == "pass":
            take = df["play_type"] == "pass"
            x = sack.astype(int)
        else:
            take = (df["play_type"] == "pass") & (_num(df, "pass_attempt") == 1)
            x = (_num(df, "complete_pass") == 1).astype(int)
        take = take & df[idcol].notna()
        t = base[take].copy()
        t["pid"] = df.loc[take, idcol]
        t["x"] = x[take]
        if len(t):
            out[role] = t
    return out


def _cell(t: pd.DataFrame) -> list:
    return [int(len(t)), int(t["yds"].sum()), int(t["succ"].sum()), round(float(t["epa"].sum()), 2), int(t["fd"].sum()), int(t["td"].sum()), int(t["x"].sum())]


def _add(a: list | None, b: list) -> list:
    return list(b) if a is None else [round(x + y, 2) if isinstance(x, float) or isinstance(y, float) else x + y for x, y in zip(a, b)]


def metrics(c: list) -> dict[str, float]:
    n = c[0]
    return {"ypp": c[1] / n, "sr": c[2] / n, "epa": c[3] / n, "fd": c[4] / n, "x": c[6] / n} if n else {}


def split_keys(cells: dict[str, list]) -> dict[str, list]:
    """Every split a reader can ask about, built from the down-by-distance cells and the red zone: each down, each cell, the whole job."""
    out: dict[str, list] = {}
    for k, c in cells.items():
        if k == "rz":
            out["rz"] = c
            continue
        out[k] = c
        d = k.split(".")[0]
        out[d] = _add(out.get(d), c)
        out["all"] = _add(out.get("all"), c)
    return out


def min_plays(role: str, split: str) -> int:
    base = BASE_MIN[role]
    if split == "all":
        return base
    if "." in split or split == "rz":
        return max(3, round(base * 0.2))
    return max(5, round(base * 0.4))


def spread(values: list[float]) -> dict:
    a = np.asarray(values, dtype=float)
    q = np.percentile(a, [10, 25, 50, 75, 90])
    return {"n": int(len(a)), "mean": round(float(a.mean()), 4), "sd": round(float(a.std(ddof=0)), 4), "q": [round(float(x), 4) for x in q]}


def build_situations(pbp: pd.DataFrame, groups: dict[str, set[str]], slug_of: dict[str, str]) -> dict:
    """{league, yard, players}. `groups` maps a player id to the groups he is graded in; players without a profile are left out."""
    tables = role_plays(pbp)
    per_player: dict[str, dict[str, dict[str, list]]] = {}  # combo -> pid -> cells (including "rz")
    plays_of: dict[tuple[str, str], dict[int, list]] = {}
    for role, t in tables.items():
        for pid, p in t.groupby("pid"):
            for g in groups.get(pid, ()):
                combo = f"{role}.{g}"
                if combo not in COMBOS:
                    continue
                cells = {f"{d}.{b}": _cell(c) for (d, b), c in p.groupby(["down", "bucket"])}
                rz = p[p["yl"] <= RED_ZONE]
                if len(rz):
                    cells["rz"] = _cell(rz)
                per_player.setdefault(combo, {})[pid] = cells
                if pid in slug_of and len(p) >= MIN_PLAYS_KEPT:
                    byweek: dict[int, list] = {}
                    for r in p.sort_values(["week", "play_id"]).itertuples():
                        byweek.setdefault(int(r.week), []).append([int(r.qtr), int(r.down), int(r.dist), int(r.yl), int(r.yds), int(r.succ), round(float(r.epa), 2), int(r.flags)])
                    plays_of[(pid, combo)] = byweek

    league: dict[str, dict[str, list]] = {}
    yard: dict[str, dict] = {}
    for combo, people in per_player.items():
        role = combo.split(".")[0]
        splits_of = {pid: split_keys(cells) for pid, cells in people.items()}
        total: dict[str, list] = {}
        peers: dict[str, dict[str, list[float]]] = {}
        for sp in splits_of.values():
            for k, c in sp.items():
                total[k] = _add(total.get(k), c)
                if c[0] >= min_plays(role, k):
                    for m, v in metrics(c).items():
                        peers.setdefault(k, {}).setdefault(m, []).append(v)
        league[combo] = {k: total[k] for k in sorted(total)}
        # {split: {"min": plays needed to be ranked, "m": {metric: yardstick}}}
        ys = {k: {"min": min_plays(role, k), "m": {m: spread(v) for m, v in ms.items() if len(v) >= MIN_PEERS}} for k, ms in sorted(peers.items())}
        ys = {k: v for k, v in ys.items() if v["m"]}
        if ys:
            yard[combo] = ys

    players: dict[str, dict] = {}
    for combo, people in per_player.items():
        role, g = combo.split(".")
        for pid, cells in people.items():
            slug = slug_of.get(pid)
            if not slug or (pid, combo) not in plays_of:
                continue
            entry = {"g": g, "c": {k: v for k, v in sorted(cells.items()) if k != "rz"}, "p": {str(w): v for w, v in sorted(plays_of[(pid, combo)].items())}}
            if "rz" in cells:
                entry["rz"] = cells["rz"]
            players.setdefault(slug, {})[role] = entry
    return {"league": league, "yard": yard, "players": dict(sorted(players.items()))}
