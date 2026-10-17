"use client"

import * as React from "react"
import Link from "@/components/SiteLink"

import { authMessage, resendVerification, signIn } from "@/lib/league2/client"
import { Field, Notice, PasswordInput, Submit, TextInput } from "./kit"

/** Only send people back to a League page; never to an address a link might have smuggled in. */
export const safeNext = (n: string | undefined | null): string => (n && /^\/league(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_=&%\-]*)?$/.test(n) && !n.includes("//") ? n : "/league")

export default function SignInForm({ next, notice }: { next?: string; notice?: string }) {
	const [email, setEmail] = React.useState("")
	const [password, setPassword] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const [unverified, setUnverified] = React.useState(false)
	const [resent, setResent] = React.useState(false)

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		setBusy(true)
		setError(null)
		setUnverified(false)
		const r = await signIn(email.trim(), password)
		if (r.ok) {
			window.location.assign(safeNext(next))
			return
		}
		setBusy(false)
		setUnverified(r.code === "EMAIL_NOT_VERIFIED")
		setError(authMessage(r))
	}

	async function resend() {
		setResent(false)
		const r = await resendVerification(email.trim())
		if (r.ok) setResent(true)
		else setError(authMessage(r))
	}

	return (
		<form onSubmit={submit} className="grid gap-4" noValidate>
			{notice && <Notice kind="ok">{notice}</Notice>}
			<Field id="si-email" label="Email">
				<TextInput id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
			</Field>
			<Field id="si-pw" label="Password">
				<PasswordInput id="si-pw" value={password} onChange={setPassword} autoComplete="current-password" />
			</Field>
			<div className="flex justify-end">
				<Link href="/league/forgot-password" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
					Forgot your password?
				</Link>
			</div>
			<Submit busy={busy} busyLabel="Signing in" disabled={email.trim() === "" || password === ""}>
				Sign in
			</Submit>
			<Notice kind="error">{error}</Notice>
			{unverified && (
				<div className="rounded-lg border border-border bg-muted px-3 py-3 text-sm">
					<p>Did the confirmation email get lost?</p>
					<button type="button" onClick={resend} className="mt-1 font-semibold underline underline-offset-4">
						Send it again
					</button>
					{resent && (
						<p role="status" className="mt-1 text-muted-foreground">
							If that address has an account waiting, a new link is on its way.
						</p>
					)}
				</div>
			)}
		</form>
	)
}
