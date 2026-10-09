// The schedule in the repo, as engine games. Built from data/lab/schedule.json, which the weekly Lab job refreshes.

import scheduleJson from "@/data/lab/schedule.json"
import { type RawSchedule, scheduleGames } from "./schedule"
import type { Game } from "./types"

const raw = scheduleJson as unknown as RawSchedule
let cached: Game[] | null = null

export function getSchedule(): RawSchedule {
	return raw
}

export function getGames(): Game[] {
	if (!cached) cached = scheduleGames(raw)
	return cached
}
