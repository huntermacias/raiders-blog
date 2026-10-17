import { notFound } from "next/navigation"

import { getRuntime } from "./auth/server"

/** Account pages exist only while accounts are on; otherwise they are plain 404s and nothing about them is exposed. */
export function requireAccounts(): void {
	if (!getRuntime()) notFound()
}
