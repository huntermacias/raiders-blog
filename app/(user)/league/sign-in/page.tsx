import Link from "@/components/SiteLink"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { AuthShell } from "@/components/league/account/kit"
import SignInForm, { safeNext } from "@/components/league/account/SignInForm"
import { requireAccounts } from "@/lib/league2/gate"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Sign in | Beat the Blogger", robots: { index: false, follow: false } }

export default async function SignInPage(props: { searchParams?: Promise<{ next?: string; reset?: string }> }) {
	requireAccounts()
	const sp = (await props.searchParams) ?? {}
	if (await currentAccount()) redirect(safeNext(sp.next))
	return (
		<AuthShell
			eyebrow="Beat the Blogger"
			title="Welcome back"
			intro="Sign in to see your picks, your rank and your record against me."
			footer={
				<div className="grid gap-1">
					<p>
						New here?{" "}
						<Link href="/league/register" className="font-semibold text-foreground underline underline-offset-4">
							Create an account
						</Link>
					</p>
					<p>
						Playing with a recovery key?{" "}
						<Link href="/league/upgrade" className="font-semibold text-foreground underline underline-offset-4">
							Upgrade your account
						</Link>
					</p>
				</div>
			}
		>
			<SignInForm next={sp.next} notice={sp.reset ? "Password updated. Sign in with your new password." : undefined} />
		</AuthShell>
	)
}
