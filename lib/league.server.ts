// Server-only helpers for the league: recovery keys and player lookup.
// Imports node:crypto and the token-bearing Sanity client, so never import
// this from a client component.

import { createHash, randomBytes } from "crypto"

import { client } from "./sanity.client"
import { parseHandle, playerId } from "./league"

// No 0/O/1/I/L so a key read off a screenshot or typed on a phone survives.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // 31 characters
const KEY_CHARS = 20

/** A fresh recovery key like "7K3QM-XW9PD-4HNTE-B2YGC" (about 99 bits). */
export function generateKey(): string {
	const out: string[] = []
	// Rejection sampling keeps every character equally likely.
	const limit = 256 - (256 % ALPHABET.length)
	while (out.length < KEY_CHARS) {
		const bytes = randomBytes(32)
		for (let i = 0; i < bytes.length && out.length < KEY_CHARS; i++) {
			if (bytes[i] >= limit) continue
			out.push(ALPHABET[bytes[i] % ALPHABET.length])
		}
	}
	return (out.join("").match(/.{5}/g) as string[]).join("-")
}

/** Upper-case and drop separators so "7k3qm xw9pd..." matches. */
export function normalizeKey(raw: unknown): string {
	return typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "") : ""
}

export function hashKey(raw: unknown): string {
	return createHash("sha256").update(normalizeKey(raw)).digest("hex")
}

/** Compare two strings without bailing out at the first difference. */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

export function keyMatches(raw: unknown, storedHash: unknown): boolean {
	if (typeof storedHash !== "string" || normalizeKey(raw).length !== KEY_CHARS) return false
	return safeEqual(hashKey(raw), storedHash)
}

type PlayerDoc = { _id: string; handle: string; handleLower: string; keyHash: string; banned?: boolean }

export type AuthResult =
	| { ok: true; handle: string; lower: string }
	| { ok: false; status: 400 | 401 | 403; message: string }

const BAD_LOGIN = "That handle and key don't match"

/** Check a handle + recovery key pair against the stored player. */
export async function authenticate(handleRaw: unknown, keyRaw: unknown): Promise<AuthResult> {
	const h = parseHandle(handleRaw)
	if (!h.ok) return { ok: false, status: 400, message: BAD_LOGIN }

	const doc = await client.getDocument<PlayerDoc>(playerId(h.lower))
	// Same answer for "no such player" and "wrong key" so handles can't be probed.
	if (!doc || !keyMatches(keyRaw, doc.keyHash)) return { ok: false, status: 401, message: BAD_LOGIN }
	if (doc.banned) return { ok: false, status: 403, message: "This account has been disabled" }
	return { ok: true, handle: doc.handle, lower: doc.handleLower }
}
