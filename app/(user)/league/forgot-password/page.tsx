import Link from "@/components/SiteLink"
import type { Metadata } from "next"

import { AuthShell } from "@/components/league/account/kit"
import { ForgotForm } from "@/components/league/account/PasswordForms"
import { requireAccounts } from "@/lib/league2/gate"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Reset your password | Beat the Blogger", robots: { index: false, follow: false } }

export default async function ForgotPage() {
	requireAccounts()
	return (
		<AuthShell
			eyebrow="Account"
			title="Reset your password"
			footer={
				<Link href="/league/sign-in" className="font-semibold text-foreground underline underline-offset-4">
					Back to sign in
				</Link>
			}
		>
			<ForgotForm />
		</AuthShell>
	)
}
