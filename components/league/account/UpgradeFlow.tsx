"use client"

import * as React from "react"

import { authMessage, passwordHints, post } from "@/lib/league2/client"
import { Field, Hints, Notice, PasswordInput, Submit, TextInput } from "./kit"

type Step = { name: "key" } | { name: "account"; token: string; handle: string } | { name: "sent"; email: string; handle: string }

/** Move a recovery-key player to an email account without losing a single pick. */
export default function UpgradeFlow({ initialHandle }: { initialHandle?: string }) {
	const [step, setStep] = React.useState<Step>({ name: "key" })
	const [handle, setHandle] = React.useState(initialHandle ?? "")
	const [key, setKey] = React.useState("")
	const [email, setEmail] = React.useState("")
	const [password, setPassword] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	async function checkKey(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		setBusy(true)
		setError(null)
		const r = await post<{ token: string; handle: string }>("/api/league/account/claim/start", { handle: handle.trim(), key: key.trim() })
		setBusy(false)
		if (r.ok) {
			setKey("")
			setStep({ name: "account", token: r.data.token, handle: r.data.handle })
		} else setError(r.message)
	}

	async function createAccount(e: React.FormEvent) {
		e.preventDefault()
		if (busy || step.name !== "account") return
		const hints = passwordHints(password, { handle: step.handle, email })
		if (!hints.every((h) => h.ok)) return setError("Check the password rules below.")
		setBusy(true)
		setError(null)
		const r = await post("/api/league/account/claim/register", { token: step.token, email: email.trim(), password })
		setBusy(false)
		if (r.ok) setStep({ name: "sent", email: email.trim(), handle: step.handle })
		else if (r.code === "expired" || r.code === "bad_token") {
			setStep({ name: "key" })
			setError(r.message)
		} else setError(authMessage(r))
	}

	if (step.name === "sent")
		return (
			<div className="grid gap-4" aria-live="polite">
				<h2 className="font-serif text-xl font-bold">One last step</h2>
				<p className="text-sm text-muted-foreground">
					We sent a confirmation link to <strong className="text-foreground">{step.email}</strong>. When you open it, <strong className="text-foreground">{step.handle}</strong> and every pick you have made move to your new account.
				</p>
				<p className="text-sm text-muted-foreground">Until you confirm, your recovery key keeps working. After that you sign in with your email, and the key is retired.</p>
			</div>
		)

	if (step.name === "account") {
		const hints = passwordHints(password, { handle: step.handle, email })
		return (
			<form onSubmit={createAccount} className="grid gap-4" noValidate>
				<Notice kind="ok">Key accepted for {step.handle}. Now choose how you will sign in.</Notice>
				<Field id="up-email" label="Email" hint="For your confirmation link and password resets. Never shown to anyone.">
					<TextInput id="up-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} hintId />
				</Field>
				<Field id="up-pw" label="Password">
					<PasswordInput id="up-pw" value={password} onChange={setPassword} autoComplete="new-password" />
					<Hints items={hints} />
				</Field>
				<Submit busy={busy} busyLabel="Creating account" disabled={email.trim() === "" || password === ""}>
					Create my account
				</Submit>
				<Notice kind="error">{error}</Notice>
			</form>
		)
	}

	return (
		<form onSubmit={checkKey} className="grid gap-4" noValidate>
			<Field id="up-handle" label="Your handle">
				<TextInput id="up-handle" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={16} />
			</Field>
			<Field id="up-key" label="Recovery key" hint="The key you saved when you joined, like XXXXX-XXXXX-XXXXX-XXXXX.">
				<TextInput id="up-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" className="font-mono" hintId />
			</Field>
			<Submit busy={busy} busyLabel="Checking" disabled={handle.trim() === "" || key.trim() === ""}>
				Continue
			</Submit>
			<Notice kind="error">{error}</Notice>
		</form>
	)
}
