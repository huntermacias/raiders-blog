// Who is looking at this page? Server-side, for pages and route handlers.

import { headers } from "next/headers"

import { getRuntime } from "./auth/server"
import { requireAdmin } from "./services/admin"

export type Account = {
	userId: string
	email: string
	emailVerified: boolean
	player: { id: string; handle: string } | null
	admin: boolean
}

/** The signed-in account, or null for a visitor (and always null while accounts are off). */
export async function currentAccount(): Promise<Account | null> {
	const rt = getRuntime()
	if (!rt) return null
	const s = await rt.auth.api.getSession({ headers: await headers() })
	if (!s?.user) return null
	const user = { id: s.user.id, email: s.user.email, emailVerified: Boolean(s.user.emailVerified) }
	const p = await rt.db.query<{ id: string; handle: string }>(`select id, handle from league_players where user_id = $1 and disabled_at is null`, [user.id])
	const admin = Boolean(await requireAdmin(rt.db, user, rt.adminEmails))
	return { userId: user.id, email: user.email, emailVerified: user.emailVerified, player: p.rows[0] ?? null, admin }
}
