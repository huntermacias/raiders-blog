// The only file that imports data/lab/rooting.json, which the Rooting Guide workflow rebuilds when final scores change.

import rootingJson from "@/data/lab/rooting.json"
import type { RootingData } from "./types"
import { isRootingData } from "./validate"

const raw: unknown = rootingJson
let checked: RootingData | null | undefined

/** The guide's numbers, or null when the file is missing its shape (a bad build): the page then says so instead of guessing. */
export function getRooting(): RootingData | null {
	if (checked === undefined) checked = isRootingData(raw) ? raw : null
	return checked
}
