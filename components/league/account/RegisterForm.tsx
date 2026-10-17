"use client"

import * as React from "react"

import { HANDLE_RE } from "@/lib/league"
import { authMessage, passwordHints, post, resendVerification } from "@/lib/league2/client"
import { Field, Hints, Notice, PasswordInput, Submit, TextInput } from "./kit"
import { loadUtm } from "@/lib/utm"
import { trackConversion } from "@/lib/analytics"

export default function RegisterForm() {
	const [handle, setHandle] = React.useState("")
	const [email, setEmail] = React.useState("")
	const [password, setPassword] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [errors, setErrors] = React.useState<{ handle?: string; email?: string; password?: string; form?: string }>({})
	const [sent, setSent] = React.useState<string | null>(null)
	const [cool, setCool] = React.useState(0)
	const [resent, setResent] = React.useState(false)

	React.useEffect(() => {
		if (cool <= 0) return
		const t = setTimeout(() => setCool((c) => c - 1), 1000)
		return () => clearTimeout(t)
	}, [cool])

	const hints = passwordHints(password, { handle, email })
	const handleOk = HANDLE_RE.test(handle.trim())

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		setErrors({})
		if (!handleOk) return setErrors({ handle: "Handles are 3 to 16 letters, numbers or underscores." })
		if (!hints.every((h) => h.ok)) return setErrors({ password: "Check the password rules below." })
		setBusy(true)
		const r = await post("/api/league/account/register", { handle: handle.trim(), email: email.trim(), password })
		setBusy(false)
		if (r.ok) {
			trackConversion("league_join", loadUtm())
			setSent(email.trim())
			setCool(30)
			return
		}
		if (r.code === "taken" || r.code === "invalid") setErrors({ handle: r.message })
		else if (r.code === "weak_password") setErrors({ password: r.message })
		else if (/email/i.test(r.message)) setErrors({ email: r.message })
		else setErrors({ form: authMessage(r) })
	}

	async function resend() {
		if (!sent || cool > 0) return
		setResent(false)
		const r = await resendVerification(sent)
		setCool(30)
		if (r.ok) setResent(true)
		else setErrors({ form: authMessage(r) })
	}

	if (sent) {
		return (
			<div className="grid gap-4" aria-live="polite">
				<h2 className="font-serif text-xl font-bold">Check your email</h2>
				<p className="text-sm text-muted-foreground">
					We sent a confirmation link to <strong className="text-foreground">{sent}</strong>. Open it on this device to finish creating your account. The link works for one hour.
				</p>
				<p className="text-sm text-muted-foreground">Nothing there? Look in spam, or send it again.</p>
				<button type="button" onClick={resend} disabled={cool > 0} className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50">
					{cool > 0 ? `Send again in ${cool}s` : "Send it again"}
				</button>
				{resent && <Notice kind="ok">If that address has an account waiting, a new link is on its way.</Notice>}
				<Notice kind="error">{errors.form}</Notice>
				<button type="button" onClick={() => setSent(null)} className="text-left text-sm text-muted-foreground underline underline-offset-4">
					Wrong address? Start over
				</button>
			</div>
		)
	}

	return (
		<form onSubmit={submit} className="grid gap-4" noValidate>
			<Field id="rg-handle" label="Handle" hint="3 to 16 letters, numbers or underscores. Shown on the public board." error={errors.handle}>
				<TextInput id="rg-handle" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={16} placeholder="SilverAndBlack" invalid={!!errors.handle} hintId />
			</Field>
			<Field id="rg-email" label="Email" hint="For your confirmation link and password resets. Never shown to anyone." error={errors.email}>
				<TextInput id="rg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} invalid={!!errors.email} hintId />
			</Field>
			<Field id="rg-pw" label="Password" error={errors.password}>
				<PasswordInput id="rg-pw" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!errors.password} />
				<Hints items={hints} />
			</Field>
			<Submit busy={busy} busyLabel="Creating account" disabled={handle.trim() === "" || email.trim() === "" || password === ""}>
				Create account
			</Submit>
			<Notice kind="error">{errors.form}</Notice>
		</form>
	)
}
