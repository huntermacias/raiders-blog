import Link from "@/components/SiteLink"
import type { Metadata } from "next"

import HandlePicker from "@/components/league/account/HandlePicker"
import { AuthShell, Notice } from "@/components/league/account/kit"
import { requireAccounts } from "@/lib/league2/gate"
import { getRuntime } from "@/lib/league2/auth/server"
import { finalizeVerifiedUser } from "@/lib/league2/services/accounts"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Email confirmed | Beat the Blogger", robots: { index: false, follow: false } }

const btn = "inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export default async function VerifiedPage(props: { searchParams?: Promise<{ error?: string }> }) {
	requireAccounts()
	const sp = (await props.searchParams) ?? {}
	if (sp.error) {
		return (
			<AuthShell eyebrow="Email" title="That link did not work">
				<div className="grid gap-4">
					<Notice kind="error">This confirmation link has expired or was already used.</Notice>
					<p className="text-sm text-muted-foreground">Already confirmed? Just sign in. Otherwise sign in with your email and password and we will offer to send a new link.</p>
					<Link href="/league/sign-in" className={btn}>
						Go to sign in
					</Link>
				</div>
			</AuthShell>
		)
	}
	let acct = await currentAccount()
	// Setup normally finishes the moment the link is opened; if it was interrupted, finish it here.
	if (acct && acct.emailVerified && !acct.player) {
		const rt = getRuntime()!
		await finalizeVerifiedUser(rt.db, { id: acct.userId, email: acct.email, name: "" }, Date.now()).catch(() => null)
		acct = await currentAccount()
	}
	if (!acct) {
		return (
			<AuthShell eyebrow="Email" title="Email confirmed">
				<div className="grid gap-4">
					<p className="text-sm text-muted-foreground">Your address is confirmed. Sign in to start picking.</p>
					<Link href="/league/sign-in" className={btn}>
						Sign in
					</Link>
				</div>
			</AuthShell>
		)
	}
	if (!acct.player) {
		return (
			<AuthShell eyebrow="Almost there" title="Pick your handle">
				<HandlePicker />
			</AuthShell>
		)
	}
	return (
		<AuthShell eyebrow="Welcome" title={`You're in, ${acct.player.handle}`} intro="Your email is confirmed and your account is ready.">
			<div className="grid gap-4">
				<Link href="/league" className={btn}>
					Make your picks
				</Link>
			</div>
		</AuthShell>
	)
}
