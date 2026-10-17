"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { post } from "@/lib/league2/client"
import type { ProfileSettings as Settings } from "@/lib/league2/services/profileSettings"
import { TEAMS } from "@/lib/nfl"
import { Field, Notice } from "./kit"

export default function ProfileSettings({ initial }: { initial: Settings }) {
	const [team, setTeam] = React.useState(initial.favoriteTeam ?? "")
	const [showProfile, setShowProfile] = React.useState(initial.showProfile)
	const [showHistory, setShowHistory] = React.useState(initial.showHistory)
	const [busy, setBusy] = React.useState(false)
	const [msg, setMsg] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)

	async function save(e: React.FormEvent) {
		e.preventDefault()
		setBusy(true)
		setMsg(null)
		const r = await post("/api/league/account/profile", { favoriteTeam: team || null, showProfile, showHistory })
		setBusy(false)
		setMsg(r.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: r.message })
	}

	return (
		<form onSubmit={save} className="grid max-w-md gap-4">
			<Field id="ps-team" label="Favorite team" hint="Shown on your profile. Optional.">
				<select id="ps-team" value={team} onChange={(e) => setTeam(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<option value="">No favorite</option>
					{TEAMS.map((t) => (
						<option key={t.abbr} value={t.abbr}>
							{t.name}
						</option>
					))}
				</select>
			</Field>
			<fieldset className="grid gap-3">
				<legend className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">What others can see</legend>
				<label className="flex items-start gap-3 text-sm">
					<input type="checkbox" checked={showProfile} onChange={(e) => setShowProfile(e.target.checked)} className="mt-1 h-4 w-4" />
					<span>
						<span className="font-semibold">Show my profile page</span>
						<span className="block text-muted-foreground">Your handle and points still appear on the standings. Turn this off and your page shows only your handle.</span>
					</span>
				</label>
				<label className="flex items-start gap-3 text-sm">
					<input type="checkbox" checked={showHistory && showProfile} disabled={!showProfile} onChange={(e) => setShowHistory(e.target.checked)} className="mt-1 h-4 w-4" />
					<span>
						<span className="font-semibold">Show my game-by-game picks</span>
						<span className="block text-muted-foreground">Only games that have already locked are ever shown.</span>
					</span>
				</label>
			</fieldset>
			<div>
				<Button type="submit" disabled={busy} aria-busy={busy}>
					{busy ? "Saving…" : "Save"}
				</Button>
			</div>
			<Notice kind={msg?.kind ?? "info"}>{msg?.text}</Notice>
		</form>
	)
}
