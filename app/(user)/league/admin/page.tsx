import Link from "@/components/SiteLink"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { AdminApp } from "@/components/league/admin/AdminApp"
import { requireAccounts } from "@/lib/league2/gate"
import { currentAccount } from "@/lib/league2/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "League admin", robots: { index: false, follow: false } }

/** Everyone who is not a signed-in, verified administrator gets the same 404 as any page that does not exist. */
export default async function AdminPage() {
	requireAccounts()
	const acct = await currentAccount()
	if (!acct || !acct.admin) notFound()
	return (
		<div className="container max-w-5xl py-8 md:py-12">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">League admin</p>
			<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight">Run the League</h1>
			<p className="mt-1 text-muted-foreground">
				Every change here asks for a reason and is written to the audit log.{" "}
				<Link href="/league" className="underline underline-offset-4">
					Back to the League
				</Link>
			</p>
			<div className="mt-6">
				<AdminApp />
			</div>
		</div>
	)
}
