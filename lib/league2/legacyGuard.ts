// Keeps the old handle-plus-key endpoints honest once accounts are on.
//
// A player who upgraded to an account has handed their key's authority to that account, so the key must stop signing
// in or saving picks (their picks now live in the new database, and the old flow would write to Sanity where nothing
// reads them). While accounts are off nothing here does anything and the old League behaves exactly as before.

import { sharedPool } from "./db"
import { accountsEnabled } from "./auth/server"
import type { Queryable } from "./db"

export type GuardResult = { blocked: false } | { blocked: true; status: number; message: string }

export const UPGRADED_MESSAGE = "This handle now has an account. Sign in with your email and password instead."
export const KEYS_CLOSED_MESSAGE = "New players join with an account now. Create one to play."

const OPEN: GuardResult = { blocked: false }

/** Is this legacy handle's key still allowed to act? Claimed and retired identities are not. */
export async function legacyKeyState(q: Queryable, handleLower: string): Promise<GuardResult> {
	const r = await q.query<{ state: string }>("select state from league_legacy_identities where handle_lower = $1", [handleLower])
	const state = r.rows[0]?.state
	return state === "claimed" || state === "retired" ? { blocked: true, status: 403, message: UPGRADED_MESSAGE } : OPEN
}

/**
 * For the sign-in and pick endpoints, called AFTER the key has been verified (so a stranger cannot learn which handles
 * were upgraded). If the database cannot be asked, the answer is "unavailable", never "allowed".
 */
export async function guardLegacyKey(handleLower: string, unavailable: string): Promise<GuardResult> {
	if (!accountsEnabled()) return OPEN
	const pool = sharedPool()
	if (!pool) return { blocked: true, status: 503, message: unavailable }
	try {
		return await legacyKeyState(pool, handleLower)
	} catch {
		return { blocked: true, status: 503, message: unavailable }
	}
}

/** New key-based sign-ups close the moment accounts are on. */
export function guardLegacyJoin(): GuardResult {
	return accountsEnabled() ? { blocked: true, status: 403, message: KEYS_CLOSED_MESSAGE } : OPEN
}
