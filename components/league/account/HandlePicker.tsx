"use client"

import * as React from "react"

import { post } from "@/lib/league2/client"
import { Field, Notice, Submit, TextInput } from "./kit"

/** For a confirmed account whose handle was taken in the meantime. */
export default function HandlePicker() {
	const [handle, setHandle] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		setBusy(true)
		setError(null)
		const r = await post("/api/league/account/handle", { handle: handle.trim() })
		if (r.ok) return void window.location.assign("/league")
		setBusy(false)
		setError(r.message)
	}
	return (
		<form onSubmit={submit} className="grid gap-4" noValidate>
			<Notice kind="info">Your email is confirmed. The handle you asked for was taken while you waited, so pick another.</Notice>
			<Field id="hp-handle" label="Handle" hint="3 to 16 letters, numbers or underscores.">
				<TextInput id="hp-handle" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={16} hintId />
			</Field>
			<Submit busy={busy} busyLabel="Saving" disabled={handle.trim() === ""}>
				Claim this handle
			</Submit>
			<Notice kind="error">{error}</Notice>
		</form>
	)
}
