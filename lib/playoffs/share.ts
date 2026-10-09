// Scenario links. A scenario is only the picks, so it fits in a short code: two bits per game (nothing, home, away, tie)
// in the order of the game ids, packed into bytes and written in URL-safe base64. A full season of picks is about 90
// characters and picks for the next few weeks are much shorter, because trailing empty games are cut off.
//
//   code = "1" + fingerprint (4 chars) + base64url(bytes)
//
// The fingerprint is a hash of the list of game ids, so a code made for a different schedule is turned away instead of
// being read as the wrong games. It does not change when scores come in, so a link made in October still works in
// December: picks for games that have since been played are simply ignored by the simulator.

import { sanitizePicks } from "./picks"
import type { Game, Outcome, Predictions } from "./types"

const VERSION = "1"
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const VALUE: Record<Outcome, number> = { H: 1, A: 2, T: 3 }
const OUTCOME: (Outcome | null)[] = [null, "H", "A", "T"]

export const SCENARIO_PARAM = "s"

function orderedIds(games: readonly Game[]): string[] {
	return games.map((g) => g.id).sort()
}

/** A short hash of the schedule's game ids (FNV-1a, 32 bits, base 36, padded to four characters). */
export function scheduleFingerprint(games: readonly Game[]): string {
	let h = 0x811c9dc5
	for (const ch of orderedIds(games).join("|")) {
		h ^= ch.charCodeAt(0)
		h = Math.imul(h, 0x01000193) >>> 0
	}
	return (h % 1679616).toString(36).padStart(4, "0") // 36^4
}

function toBase64Url(bytes: number[]): string {
	let out = ""
	for (let i = 0; i < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
		out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
		if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]
		if (i + 2 < bytes.length) out += ALPHABET[n & 63]
	}
	return out
}

function fromBase64Url(text: string): number[] | null {
	const vals: number[] = []
	for (const ch of text) {
		const v = ALPHABET.indexOf(ch)
		if (v < 0) return null
		vals.push(v)
	}
	if (vals.length % 4 === 1) return null
	const bytes: number[] = []
	for (let i = 0; i < vals.length; i += 4) {
		const n = (vals[i] << 18) | ((vals[i + 1] ?? 0) << 12) | ((vals[i + 2] ?? 0) << 6) | (vals[i + 3] ?? 0)
		bytes.push((n >> 16) & 255)
		if (i + 2 < vals.length) bytes.push((n >> 8) & 255)
		if (i + 3 < vals.length) bytes.push(n & 255)
	}
	return bytes
}

/** The code for a set of picks. Empty when there are no picks. Picks for games already played are not included. */
export function encodeScenario(games: readonly Game[], picks: Predictions): string {
	const clean = sanitizePicks(games, picks)
	const ids = orderedIds(games)
	const bytes = new Array<number>(Math.ceil(ids.length / 4)).fill(0)
	let any = false
	ids.forEach((id, i) => {
		const v = clean[id]
		if (!v) return
		bytes[i >> 2] |= VALUE[v] << ((i & 3) * 2)
		any = true
	})
	if (!any) return ""
	while (bytes.length && bytes[bytes.length - 1] === 0) bytes.pop()
	return VERSION + scheduleFingerprint(games) + toBase64Url(bytes)
}

export type DecodeResult = { ok: true; predictions: Predictions } | { ok: false; reason: "empty" | "version" | "schedule" | "malformed" }

/** Reads a code back into picks. Anything that does not fit this schedule is refused, never half-read. */
export function decodeScenario(games: readonly Game[], code: string | null | undefined): DecodeResult {
	if (!code) return { ok: false, reason: "empty" }
	if (code[0] !== VERSION) return { ok: false, reason: /^[0-9]$/.test(code[0]) ? "version" : "malformed" }
	if (code.length < 5) return { ok: false, reason: "malformed" }
	if (code.slice(1, 5) !== scheduleFingerprint(games)) return { ok: false, reason: "schedule" }

	const bytes = fromBase64Url(code.slice(5))
	const ids = orderedIds(games)
	if (!bytes || bytes.length > Math.ceil(ids.length / 4)) return { ok: false, reason: "malformed" }

	const picks: Record<string, Outcome> = {}
	for (let i = 0; i < bytes.length * 4; i++) {
		const v = (bytes[i >> 2] >> ((i & 3) * 2)) & 3
		if (!v) continue
		if (i >= ids.length) return { ok: false, reason: "malformed" }
		picks[ids[i]] = OUTCOME[v] as Outcome
	}
	return { ok: true, predictions: sanitizePicks(games, picks) }
}

/** The address of a scenario on this page. */
export function scenarioLink(origin: string, path: string, code: string): string {
	return code ? `${origin}${path}?${SCENARIO_PARAM}=${code}` : `${origin}${path}`
}
