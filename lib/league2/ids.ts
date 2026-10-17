// Deterministic ids, so importing the same Sanity data twice produces the same rows (re-runs change nothing).
// Server and script use only: imports node:crypto.

import { createHash } from "crypto"

/** A fixed namespace for this project's imports. Never change it: ids derive from it. */
export const LEAGUE_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"

/** RFC 4122 version 5 (SHA-1) UUID of `name` within `namespace`. */
export function uuidV5(name: string, namespace: string = LEAGUE_NAMESPACE): string {
	const hex = createHash("sha1").update(namespace.replace(/-/g, ""), "hex").update(name, "utf8").digest("hex")
	// Set the version (5) and variant (10xx) bits.
	const time = hex.slice(12, 16)
	const version = "5" + time.slice(1)
	const clockSeq = (((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)).padStart(2, "0") + hex.slice(18, 20)
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}-${clockSeq}-${hex.slice(20, 32)}`
}
