import Link from "@/components/SiteLink"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { SessionsPanel, SignOutButton } from "@/components/league/account/AccountPanel"
import ProfileSettings from "@/components/league/account/ProfileSettings"
import { getRuntime } from "@/lib/league2/auth/server"
import { loadSettings } from "@/lib/league2/services/profileSettings"
import { ChangePasswordForm } from "@/components/league/account/PasswordForms"
import { requireAccounts } from "@/lib/league2/gate"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your account | Beat the Blogger", robots: { index: false, follow: false } }

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
	return (
		<section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
			<h2 id={id} className="font-serif text-xl font-bold tracking-tight">
				{title}
			</h2>
			<div className="mt-4">{children}</div>
		</section>
	)
}

export default async function AccountPage() {
	requireAccounts()
	const acct = await currentAccount()
	if (!acct) redirect("/league/sign-in?next=/league/account")
	if (!acct.player) redirect("/league/verified")
	const rt = getRuntime()
	const settings = rt ? await loadSettings(rt.db, acct.userId) : null
	return (
		<div className="container max-w-3xl py-10 md:py-14">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Account</p>
			<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight">{acct.player.handle}</h1>
			<p className="mt-1 text-muted-foreground">
				{acct.email} ·{" "}
				<Link href={`/league/${acct.player.handle}`} className="underline underline-offset-4">
					View your public profile
				</Link>
			</p>
			<div className="mt-8 grid gap-6">
				{settings && (
					<Section id="profile" title="Your public profile">
						<ProfileSettings initial={settings} />
					</Section>
				)}
				<Section id="pw" title="Password">
					<ChangePasswordForm />
				</Section>
				<Section id="devices" title="Where you are signed in">
					<SessionsPanel />
				</Section>
				<Section id="out" title="Sign out">
					<SignOutButton />
				</Section>
				{acct.admin && (
					<Section id="adm" title="Admin">
						<Link href="/league/admin" className="font-semibold underline underline-offset-4">
							Open the admin dashboard
						</Link>
					</Section>
				)}
			</div>
		</div>
	)
}
