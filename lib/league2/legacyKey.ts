// The legacy recovery key, exactly as lib/league.server.ts defines it (same alphabet, same normalising, same sha256),
// but with no Sanity import so the account services can use it. A test keeps the two implementations identical.

import { createHash, randomBytes } from "crypto"

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const KEY_CHARS = 20

export function normalizeKey(raw: unknown): string {
	return typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "") : ""
}

export function hashKey(raw: unknown): string {
	return createHash("sha256").update(normalizeKey(raw)).digest("hex")
}

/** Compare two strings without stopping at the first difference. */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

/** Constant-time check of a presented key against the stored hash. */
export function keyMatches(raw: unknown, storedHash: unknown): boolean {
	if (typeof storedHash !== "string" || normalizeKey(raw).length !== KEY_CHARS) return false
	return safeEqual(hashKey(raw), storedHash)
}

/** A fresh one-time token for a pending claim: 256 bits, URL-safe. */
export function newToken(): string {
	return randomBytes(32).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export { ALPHABET }
