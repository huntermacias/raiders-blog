// The fitted team-strength model in the repo, as the playoff tools use it. Built by scripts/ratings/fit.py from the nflverse games
// file; it only changes when someone re-fits it, never during the season. This is the one file that reads it.

import modelJson from "@/data/lab/ratings-model.json"
import type { RatingsModel } from "./model"

const model = modelJson as unknown as RatingsModel

export function getModel(): RatingsModel {
	return model
}
