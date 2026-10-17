import Link from "@/components/SiteLink"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { AuthShell } from "@/components/league/account/kit"
import UpgradeFlow from "@/components/league/account/UpgradeFlow"
import { requireAccounts } from "@/lib/league2/gate"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Upgrade your account | Beat the Blogger", robots: { index: false, follow: false } }

export default async function UpgradePage() {
	requireAccounts()
	if (await currentAccount()) redirect("/league")
	return (
		<AuthShell
			eyebrow="Recovery key players"
			title="Upgrade your account"
			intro="Add an email and password to the handle you already play. Every pick, rank and record carries over."
			footer={
				<p>
					Lost your key? You can{" "}
					<Link href="/league/register" className="font-semibold text-foreground underline underline-offset-4">
						start a new account
					</Link>
					, or{" "}
					<a href="https://huntermacias.com" className="font-semibold text-foreground underline underline-offset-4">
						contact Hunter
					</a>{" "}
					to have your old picks reviewed and linked.
				</p>
			}
		>
			<UpgradeFlow />
		</AuthShell>
	)
}
