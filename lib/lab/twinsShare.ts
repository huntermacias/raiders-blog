// "Season twins" as a link: which kind of match and which twin. The share card route (/api/og?type=twins), the
// share landing page and the page itself all read the same few query parameters, so a shared link reopens the twin
// the reader was looking at. Pure, like lastShare.ts.

import { type ShareSize, isSize } from "./lastShare"
import { type TwinMode, isMode } from "./twinsKit"

export const TWINS_PATH = "/lab/season-twins"
export const TWINS_SHARE_PATH = "/lab/season-twins/share"
/** The element on the page a shared link scrolls to. */
export const TWINS_SECTION = "print-heading"

export type TwinsRaw = { size?: string; mode?: string; twin?: string }
export type TwinsChecked = { mode: TwinMode; twin: string | null; size: ShareSize }

const ROW = /^(\d{4})[- ]([A-Z]{2,3})$/

/** "2022 JAX" to "2022-JAX", which survives a URL without an encoded space. */
export const twinParam = (row: string): string => row.replace(" ", "-")

/** Reads a request into a view, dropping anything that is not valid. `rows` is every team-season the data has. */
export function readTwinsView(raw: TwinsRaw, rows: ReadonlySet<string>): TwinsChecked {
	const m = raw.twin ? ROW.exec(raw.twin) : null
	const twin = m && rows.has(`${m[1]} ${m[2]}`) ? `${m[1]} ${m[2]}` : null
	return { mode: isMode(raw.mode) ? raw.mode : "all", twin, size: isSize(raw.size) ? raw.size : "wide" }
}

/** The query string (no leading "?") for a view, leaving out what is at its default. */
export function twinsQuery(view: { mode?: TwinMode; twin?: string | null }, extra: { size?: ShareSize } = {}): string {
	const q: [string, string][] = []
	if (extra.size) q.push(["size", extra.size])
	if (view.mode && view.mode !== "all") q.push(["mode", view.mode])
	if (view.twin) q.push(["twin", twinParam(view.twin)])
	return q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
}
