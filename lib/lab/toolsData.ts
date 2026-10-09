// The week numbers on the tools' tags, read from the data files in the repo. Kept apart from tools.ts so the list itself stays pure.

import { getSchedule } from "../playoffs/data"
import { slateGames } from "./units"
import type { LabWeeks } from "./tools"

export function labWeeks(): LabWeeks {
	let slate: number | null = null
	let results: number | null = null
	try {
		slate = slateGames()?.week ?? null
	} catch {
		slate = null
	}
	try {
		results = getSchedule().throughWeek || null
	} catch {
		results = null
	}
	return { slate, results }
}
