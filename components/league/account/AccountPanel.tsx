"use client"

import * as React from "react"
import { Loader2, LogOut, Monitor } from "lucide-react"

import { Button } from "@/components/ui/button"
import { authMessage, get, post, signOut } from "@/lib/league2/client"
import { Notice } from "./kit"

type SessionRow = { token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: string; expiresAt: string }

const describe = (ua?: string | null) => {
	const s = ua ?? ""
	const os = /iPhone|iPad/.test(s) ? "iPhone or iPad" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "Unknown device"
	const br = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "browser"
	return `${br} on ${os}`
}

export function SessionsPanel() {
	const [rows, setRows] = React.useState<SessionRow[] | null>(null)
	const [current, setCurrent] = React.useState<string | null>(null)
	const [error, setError] = React.useState<string | null>(null)
	const [busy, setBusy] = React.useState(false)

	const load = React.useCallback(async () => {
		const [list, cur] = await Promise.all([get<SessionRow[]>("/api/auth/list-sessions"), get<{ session?: { token: string } } | null>("/api/auth/get-session")])
		if (list.ok) setRows(list.data)
		else setError(authMessage(list))
		if (cur.ok && cur.data?.session) setCurrent(cur.data.session.token)
	}, [])
	React.useEffect(() => {
		load()
	}, [load])

	async function revokeOthers() {
		setBusy(true)
		const r = await post("/api/auth/revoke-other-sessions", {})
		setBusy(false)
		if (r.ok) load()
		else setError(authMessage(r))
	}

	if (rows === null) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading your devices</p>
	const others = rows.filter((s) => s.token !== current).length
	return (
		<div className="grid gap-3">
			<ul className="grid gap-2">
				{rows.map((s) => (
					<li key={s.token} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
						<Monitor aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="flex-1">
							{describe(s.userAgent)}
							<span className="block text-xs text-muted-foreground">Signed in {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
						</span>
						{s.token === current && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">This device</span>}
					</li>
				))}
			</ul>
			{others > 0 && (
				<Button type="button" variant="outline" onClick={revokeOthers} disabled={busy} className="w-fit">
					Sign out my other devices
				</Button>
			)}
			<Notice kind="error">{error}</Notice>
		</div>
	)
}

export function SignOutButton() {
	const [busy, setBusy] = React.useState(false)
	return (
		<Button
			type="button"
			variant="outline"
			disabled={busy}
			onClick={async () => {
				setBusy(true)
				await signOut()
				window.location.assign("/league")
			}}
		>
			<LogOut aria-hidden className="mr-2 h-4 w-4" /> {busy ? "Signing out" : "Sign out"}
		</Button>
	)
}
