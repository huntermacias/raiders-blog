// "My team" and the picks strip, in the browser. A visitor's team lives in this browser; a signed-in player's lives on their account and
// follows them to other devices. Every storage call is wrapped: private windows and blocked storage must never break a page.

import { TEAMS } from "../nfl"
import type { Strip } from "./strip"

export const TEAM_KEY = "rr:my-team"
export const STRIP_KEY = "rr:strip"
export const DISMISS_KEY = "rr:strip-dismissed"
export const TEAM_EVENT = "rr:my-team-changed"
/** How long an answer is reused before asking again. "Accounts are off" is asked about less often. */
export const STRIP_TTL_MS = 60_000
export const OFF_TTL_MS = 5 * 60_000
export const DISMISS_MS = 7 * 24 * 60 * 60_000

export const isTeamAbbr = (v: unknown): v is string => typeof v === "string" && TEAMS.some((t) => t.abbr === v)

export type StripState = { status: "loading" } | { status: "off" } | { status: "visitor" } | { status: "player"; strip: Extract<Strip, { signedIn: true }> }

function store(kind: "local" | "session"): Storage | null {
	try {
		return typeof window === "undefined" ? null : kind === "local" ? window.localStorage : window.sessionStorage
	} catch {
		return null
	}
}

export function readLocalTeam(): string | null {
	try {
		const v = store("local")?.getItem(TEAM_KEY)
		return isTeamAbbr(v) ? v : null
	} catch {
		return null
	}
}

export function writeLocalTeam(team: string | null): void {
	try {
		const s = store("local")
		if (!s) return
		if (team && isTeamAbbr(team)) s.setItem(TEAM_KEY, team)
		else s.removeItem(TEAM_KEY)
	} catch {
		/* storage unavailable: the choice just lasts until the page closes */
	}
}

/** The account's team wins once there is one; until then the one chosen in this browser stands. */
export const chooseTeam = (local: string | null, account: string | null): string | null => (isTeamAbbr(account) ? account : isTeamAbbr(local) ? local : null)

type Cached = { at: number; state: "off" | "visitor" | "player"; strip?: Extract<Strip, { signedIn: true }> }

export function readCachedStrip(now = Date.now()): StripState | null {
	try {
		const raw = store("session")?.getItem(STRIP_KEY)
		if (!raw) return null
		const c = JSON.parse(raw) as Cached
		if (typeof c.at !== "number" || now - c.at > (c.state === "off" ? OFF_TTL_MS : STRIP_TTL_MS) || now < c.at) return null
		if (c.state === "player") return c.strip ? { status: "player", strip: c.strip } : null
		return c.state === "off" || c.state === "visitor" ? { status: c.state } : null
	} catch {
		return null
	}
}

export function cacheStrip(state: StripState, now = Date.now()): void {
	try {
		if (state.status === "loading") return
		const c: Cached = state.status === "player" ? { at: now, state: "player", strip: state.strip } : { at: now, state: state.status }
		store("session")?.setItem(STRIP_KEY, JSON.stringify(c))
	} catch {
		/* ignore */
	}
}

export function forgetStrip(): void {
	try {
		store("session")?.removeItem(STRIP_KEY)
	} catch {
		/* ignore */
	}
}

export function isDismissed(now = Date.now()): boolean {
	try {
		const at = Number(store("local")?.getItem(DISMISS_KEY))
		return Number.isFinite(at) && at > 0 && now >= at && now - at < DISMISS_MS
	} catch {
		return false
	}
}

export function dismiss(now = Date.now()): void {
	try {
		store("local")?.setItem(DISMISS_KEY, String(now))
	} catch {
		/* ignore */
	}
}

let inflight: Promise<StripState> | null = null

/** Ask the site who this is. One request at a time, shared by every component on the page; never throws. */
export function loadStrip(): Promise<StripState> {
	const cached = readCachedStrip()
	if (cached) return Promise.resolve(cached)
	if (inflight) return inflight
	inflight = (async (): Promise<StripState> => {
		try {
			const res = await fetch("/api/league/account/strip", { credentials: "same-origin", cache: "no-store" })
			if (res.status === 404) return { status: "off" }
			if (!res.ok) return { status: "visitor" }
			const data = (await res.json()) as Strip
			return data && data.signedIn === true ? { status: "player", strip: data } : { status: "visitor" }
		} catch {
			return { status: "visitor" }
		}
	})().then((s) => {
		cacheStrip(s)
		inflight = null
		return s
	})
	return inflight
}
