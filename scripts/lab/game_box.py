"""Team and player numbers for one finished game, from the same play-by-play the replays use.

The Lab's game files carry the story of a game (win probability, drives, key plays). This adds the numbers a recap
sets beside it: how each team's offense did by the measures that decide games (EPA per play, success rate, explosive
plays, early downs, the run and the pass, third downs, the red zone, penalties), and each side's passers, runners,
receivers and defenders with the lines the box score leaves out.

Everything is for the team that had the ball ("off"). A team's defense is the other team's offense, so the page reads
it from there. Nothing here is a rank: the page ranks a game against the Raiders' other games and the season file.
"""
from __future__ import annotations

import pandas as pd

SCRIM = ("run", "pass")


# Columns the numbers read. A file or a test frame without one gets it filled with blanks rather than a crash.
NEEDED = [
    "posteam", "defteam", "play_type", "epa", "success", "down", "yards_gained", "third_down_converted", "third_down_failed",
    "fourth_down_converted", "fourth_down_failed", "qb_dropback", "sack", "yardline_100", "fixed_drive", "fixed_drive_result",
    "interception", "fumble_lost", "penalty", "penalty_team", "penalty_yards", "passer_player_id", "passer_player_name",
    "pass_attempt", "complete_pass", "passing_yards", "pass_touchdown", "cpoe", "air_yards", "rush_attempt", "rusher_player_id",
    "rusher_player_name", "qb_kneel", "rushing_yards", "rush_touchdown", "receiver_player_id", "receiver_player_name",
    "receiving_yards", "yards_after_catch", "sack_player_id", "sack_player_name", "interception_player_id", "interception_player_name",
] + [
    f"{base}_{i}_player_{kind}"
    for base, rng in (("solo_tackle", (1, 2)), ("assist_tackle", (1, 2, 3, 4)), ("tackle_for_loss", (1, 2)), ("qb_hit", (1, 2)),
                      ("pass_defense", (1, 2)), ("half_sack", (1, 2)))
    for i in rng for kind in ("id", "name")
] + [f"forced_fumble_player_{i}_player_{kind}" for i in (1, 2) for kind in ("id", "name")]


def _rate(num, den, digits: int = 4):
    return round(float(num) / float(den), digits) if den else None


def _round(value, digits: int = 3):
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits)


def team_box(g: pd.DataFrame, team: str, points: int) -> dict:
    """One team's offense in one game. `team` is the nflverse code; `points` is what it scored."""
    mine = g[g["posteam"] == team]
    scrim = mine[mine["play_type"].isin(SCRIM) & mine["epa"].notna()]
    passes = scrim[scrim["play_type"] == "pass"]
    rushes = scrim[scrim["play_type"] == "run"]
    early = scrim[scrim["down"].isin([1, 2])]
    explosive = int((rushes["yards_gained"] >= 10).sum() + (passes["yards_gained"] >= 20).sum())
    third = mine[(mine["third_down_converted"] == 1) | (mine["third_down_failed"] == 1)]
    fourth = mine[(mine["fourth_down_converted"] == 1) | (mine["fourth_down_failed"] == 1)]
    dropbacks = mine[mine["qb_dropback"] == 1]
    drives = mine[mine["yardline_100"] <= 20].drop_duplicates(["fixed_drive"])
    drive_td = int((drives["fixed_drive_result"] == "Touchdown").sum())
    pen = g[(g["penalty_team"] == team) & (g["penalty"] == 1)]
    runs_early = early[early["play_type"] == "run"]
    yards = float(scrim["yards_gained"].sum())
    return {
        "points": int(points),
        "plays": int(len(scrim)),
        "yards": int(round(yards)),
        "ypp": _rate(yards, len(scrim), 2),
        "epa": _rate(scrim["epa"].sum(), len(scrim)),
        "epaPass": _rate(passes["epa"].sum(), len(passes)),
        "epaRush": _rate(rushes["epa"].sum(), len(rushes)),
        "success": _rate(scrim["success"].sum(), len(scrim)),
        "earlySuccess": _rate(early["success"].sum(), len(early)),
        "explosive": explosive,
        "explosiveRate": _rate(explosive, len(scrim)),
        "rushAtt": int(len(rushes)),
        "rushYds": int(round(float(rushes["yards_gained"].sum()))),
        "rushSuccess": _rate(rushes["success"].sum(), len(rushes)),
        "earlyRunShare": _rate(len(runs_early), len(early)),
        "passYds": int(round(float(passes["yards_gained"].sum()))),
        "dropbacks": int(len(dropbacks)),
        "sacks": int((dropbacks["sack"] == 1).sum()),
        "thirdAtt": int(len(third)),
        "thirdConv": int((third["third_down_converted"] == 1).sum()),
        "fourthAtt": int(len(fourth)),
        "fourthConv": int((fourth["fourth_down_converted"] == 1).sum()),
        "redZoneTrips": int(len(drives)),
        "redZoneTds": drive_td,
        "giveaways": int(((mine["interception"] == 1) | (mine["fumble_lost"] == 1)).sum()),
        "penalties": int(len(pen)),
        "penaltyYards": int(pen["penalty_yards"].fillna(0).sum()),
    }


def _players(g: pd.DataFrame, team: str) -> dict:
    """Passers, runners, receivers and defenders for one team, busiest first."""
    off = g[(g["posteam"] == team) & g["play_type"].isin(SCRIM)]
    out: dict[str, list] = {"pass": [], "rush": [], "rec": [], "def": []}

    qb = off[(off["qb_dropback"] == 1) & off["passer_player_id"].notna()]
    for pid, rows in qb.groupby("passer_player_id"):
        att = rows[rows["pass_attempt"] == 1]
        out["pass"].append({
            "id": pid, "name": rows["passer_player_name"].iloc[0],
            "att": int(len(att)), "cmp": int((att["complete_pass"] == 1).sum()),
            "yds": int(att["passing_yards"].fillna(0).sum()),
            "td": int((att["pass_touchdown"] == 1).sum()), "int": int((att["interception"] == 1).sum()),
            "sacks": int((rows["sack"] == 1).sum()), "dropbacks": int(len(rows)),
            "epa": _rate(rows["epa"].sum(), len(rows)), "success": _rate(rows["success"].sum(), len(rows)),
            "cpoe": _round(att["cpoe"].mean(), 1),
            "adot": _round(att["air_yards"].mean(), 1),
        })

    runs = off[(off["rush_attempt"] == 1) & (off["play_type"] == "run") & off["rusher_player_id"].notna() & (off["qb_kneel"].fillna(0) == 0)]
    for pid, rows in runs.groupby("rusher_player_id"):
        out["rush"].append({
            "id": pid, "name": rows["rusher_player_name"].iloc[0],
            "car": int(len(rows)), "yds": int(rows["rushing_yards"].fillna(0).sum()),
            "td": int((rows["rush_touchdown"] == 1).sum()),
            "long": int(rows["rushing_yards"].fillna(0).max()),
            "epa": _rate(rows["epa"].sum(), len(rows)), "success": _rate(rows["success"].sum(), len(rows)),
            "explosive": int((rows["rushing_yards"].fillna(0) >= 10).sum()),
        })

    tgts = off[(off["pass_attempt"] == 1) & off["receiver_player_id"].notna()]
    for pid, rows in tgts.groupby("receiver_player_id"):
        got = rows[rows["complete_pass"] == 1]
        out["rec"].append({
            "id": pid, "name": rows["receiver_player_name"].iloc[0],
            "tgt": int(len(rows)), "rec": int(len(got)), "yds": int(got["receiving_yards"].fillna(0).sum()),
            "td": int((got["pass_touchdown"] == 1).sum()),
            "air": int(rows["air_yards"].fillna(0).sum()),
            "yac": int(got["yards_after_catch"].fillna(0).sum()),
            "epa": _rate(rows["epa"].sum(), len(rows)),
        })

    # Defenders are credited on the plays the other team ran.
    dfn = g[(g["defteam"] == team) & g["play_type"].isin(SCRIM + ("qb_kneel",))]
    tally: dict[str, dict] = {}

    def bump(pid, name, key, by=1):
        if not isinstance(pid, str) or not pid:
            return
        row = tally.setdefault(pid, {"id": pid, "name": name, "tkl": 0, "sack": 0.0, "hit": 0, "tfl": 0, "pd": 0, "int": 0, "ff": 0})
        row[key] += by

    for _, r in dfn.iterrows():
        for i in (1, 2):
            bump(r.get(f"solo_tackle_{i}_player_id"), r.get(f"solo_tackle_{i}_player_name"), "tkl")
        for i in (1, 2, 3, 4):
            bump(r.get(f"assist_tackle_{i}_player_id"), r.get(f"assist_tackle_{i}_player_name"), "tkl")
        for i in (1, 2):
            bump(r.get(f"tackle_for_loss_{i}_player_id"), r.get(f"tackle_for_loss_{i}_player_name"), "tfl")
            bump(r.get(f"qb_hit_{i}_player_id"), r.get(f"qb_hit_{i}_player_name"), "hit")
            bump(r.get(f"pass_defense_{i}_player_id"), r.get(f"pass_defense_{i}_player_name"), "pd")
            bump(r.get(f"forced_fumble_player_{i}_player_id"), r.get(f"forced_fumble_player_{i}_player_name"), "ff")
        bump(r.get("sack_player_id"), r.get("sack_player_name"), "sack")
        for i in (1, 2):
            bump(r.get(f"half_sack_{i}_player_id"), r.get(f"half_sack_{i}_player_name"), "sack", 0.5)
        bump(r.get("interception_player_id"), r.get("interception_player_name"), "int")
    for row in tally.values():
        row["sack"] = int(row["sack"]) if float(row["sack"]).is_integer() else row["sack"]
        # Anyone credited with a tackle for loss or a sack was also in on the tackle.
        out["def"].append(row)

    out["pass"].sort(key=lambda p: -p["dropbacks"])
    out["rush"].sort(key=lambda p: (-p["car"], -p["yds"]))
    out["rec"].sort(key=lambda p: (-p["tgt"], -p["yds"]))
    out["def"].sort(key=lambda p: -(p["tkl"] + 4 * p["sack"] + 4 * p["int"] + 2 * p["tfl"] + 2 * p["pd"] + 3 * p["ff"] + p["hit"]))
    return {
        "pass": out["pass"][:3],
        "rush": [p for p in out["rush"] if p["car"] >= 2][:5],
        "rec": [p for p in out["rec"] if p["tgt"] >= 2][:6],
        "def": out["def"][:6],
    }


def game_box(g: pd.DataFrame, team: str, opp: str, team_points: int, opp_points: int) -> dict:
    """{"me": ..., "opp": ...} offenses, and {"me": ..., "opp": ...} player lines, for the side the file is about."""
    g = g.copy()
    for col in NEEDED:
        if col not in g.columns:
            g[col] = float("nan")
    return {
        "teams": {"me": team_box(g, team, team_points), "opp": team_box(g, opp, opp_points)},
        "players": {"me": _players(g, team), "opp": _players(g, opp)},
    }
