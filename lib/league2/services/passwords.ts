// Password rules. Length and "not guessable" matter; composition rules do not. Pure.

import { PASSWORD_MAX, PASSWORD_MIN } from "../auth/options"

const COMMON = [
	"password", "passw0rd", "letmein", "welcome", "iloveyou", "qwerty", "abc123", "football", "raiders", "lasvegas",
	"blackandsilver", "justwin", "raidernation", "rundown", "monkey", "dragon", "master", "sunshine", "princess", "trustno1",
]

/** Returns a message when the password is not acceptable, or null when it is. */
export function checkPassword(password: unknown, ctx: { handle?: string; email?: string }): string | null {
	if (typeof password !== "string") return "Enter a password"
	if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`
	if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`
	const lower = password.toLowerCase()
	if (/^(.)\1+$/.test(password)) return "Choose something less repetitive"
	if (/^(0123456789|1234567890|abcdefghij|qwertyuiop|asdfghjkl)/.test(lower)) return "Choose something less predictable"
	const stripped = lower.replace(/[^a-z]/g, "")
	if (COMMON.some((w) => stripped === w || lower === w || (stripped.length <= w.length + 4 && stripped.startsWith(w) && /^\d*$/.test(lower.slice(w.length))))) return "That password is too easy to guess"
	const handle = (ctx.handle ?? "").toLowerCase()
	if (handle.length >= 4 && lower.includes(handle)) return "Do not put your handle in your password"
	const local = (ctx.email ?? "").toLowerCase().split("@")[0]
	if (local.length >= 4 && lower.includes(local)) return "Do not put your email address in your password"
	return null
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

/** Lower-cased email, or null when it is not plausible. */
export function normalizeEmail(raw: unknown): string | null {
	if (typeof raw !== "string") return null
	const e = raw.trim().toLowerCase()
	return e.length <= 254 && EMAIL.test(e) ? e : null
}
