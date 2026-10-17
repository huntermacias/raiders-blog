"use client"

import * as React from "react"

import { authMessage, changePassword, passwordHints, requestReset, resetPassword } from "@/lib/league2/client"
import { Field, Hints, Notice, PasswordInput, Submit, TextInput } from "./kit"

export function ForgotForm() {
	const [email, setEmail] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [done, setDone] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		setBusy(true)
		setError(null)
		const r = await requestReset(email.trim())
		setBusy(false)
		// The answer is the same whether or not the address has an account.
		if (r.ok || r.status === 404) setDone(true)
		else setError(authMessage(r))
	}

	if (done)
		return (
			<div className="grid gap-3" aria-live="polite">
				<h2 className="font-serif text-xl font-bold">Check your email</h2>
				<p className="text-sm text-muted-foreground">If that address has an account, a reset link is on its way. It works for one hour and only once.</p>
			</div>
		)
	return (
		<form onSubmit={submit} className="grid gap-4" noValidate>
			<Field id="fg-email" label="Email" hint="We will send a link to reset your password.">
				<TextInput id="fg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} hintId />
			</Field>
			<Submit busy={busy} busyLabel="Sending" disabled={email.trim() === ""}>
				Send reset link
			</Submit>
			<Notice kind="error">{error}</Notice>
		</form>
	)
}

export function ResetForm({ token, linkError }: { token?: string; linkError?: boolean }) {
	const [pw, setPw] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const hints = passwordHints(pw, {})

	if (!token || linkError)
		return (
			<div className="grid gap-3">
				<Notice kind="error">This link has expired or was already used.</Notice>
				<a href="/league/forgot-password" className="text-sm font-semibold underline underline-offset-4">
					Request a new reset link
				</a>
			</div>
		)

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		if (!hints.every((h) => h.ok)) return setError("Check the password rules below.")
		setBusy(true)
		setError(null)
		const r = await resetPassword(token as string, pw)
		if (r.ok) {
			window.location.assign("/league/sign-in?reset=1")
			return
		}
		setBusy(false)
		setError(authMessage(r))
	}
	return (
		<form onSubmit={submit} className="grid gap-4" noValidate>
			<Field id="rs-pw" label="New password">
				<PasswordInput id="rs-pw" value={pw} onChange={setPw} autoComplete="new-password" />
				<Hints items={hints} />
			</Field>
			<Submit busy={busy} busyLabel="Saving" disabled={pw === ""}>
				Set new password
			</Submit>
			<Notice kind="error">{error}</Notice>
			<p className="text-xs text-muted-foreground">Setting a new password signs you out everywhere.</p>
		</form>
	)
}

export function ChangePasswordForm() {
	const [cur, setCur] = React.useState("")
	const [pw, setPw] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [msg, setMsg] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
	const hints = passwordHints(pw, {})

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		if (!hints.every((h) => h.ok)) return setMsg({ kind: "error", text: "Check the password rules below." })
		setBusy(true)
		setMsg(null)
		const r = await changePassword(cur, pw)
		setBusy(false)
		if (r.ok) {
			setCur("")
			setPw("")
			setMsg({ kind: "ok", text: "Password changed. Your other devices were signed out." })
		} else setMsg({ kind: "error", text: authMessage(r) })
	}
	return (
		<form onSubmit={submit} className="grid max-w-md gap-4" noValidate>
			<Field id="cp-cur" label="Current password">
				<PasswordInput id="cp-cur" value={cur} onChange={setCur} autoComplete="current-password" />
			</Field>
			<Field id="cp-new" label="New password">
				<PasswordInput id="cp-new" value={pw} onChange={setPw} autoComplete="new-password" />
				<Hints items={hints} />
			</Field>
			<Submit busy={busy} busyLabel="Saving" disabled={cur === "" || pw === ""}>
				Change password
			</Submit>
			{msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
		</form>
	)
}
