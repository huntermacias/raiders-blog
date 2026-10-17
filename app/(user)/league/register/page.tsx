import Link from "@/components/SiteLink"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { AuthShell } from "@/components/league/account/kit"
import RegisterForm from "@/components/league/account/RegisterForm"
import { requireAccounts } from "@/lib/league2/gate"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Create your account | Beat the Blogger", robots: { index: false, follow: false } }

export default async function RegisterPage() {
	requireAccounts()
	if (await currentAccount()) redirect("/league")
	return (
		<AuthShell
			eyebrow="Free to play"
			title="Create your account"
			intro="Pick a handle, confirm your email, and you are in. Your picks and record stay with you on every device."
			footer={
				<div className="grid gap-1">
					<p>
						Already have an account?{" "}
						<Link href="/league/sign-in" className="font-semibold text-foreground underline underline-offset-4">
							Sign in
						</Link>
					</p>
					<p>
						Have a recovery key from before?{" "}
						<Link href="/league/upgrade" className="font-semibold text-foreground underline underline-offset-4">
							Upgrade instead
						</Link>
					</p>
				</div>
			}
		>
			<RegisterForm />
		</AuthShell>
	)
}
