import type { Metadata } from "next"

import { AuthShell } from "@/components/league/account/kit"
import { ResetForm } from "@/components/league/account/PasswordForms"
import { requireAccounts } from "@/lib/league2/gate"

export const dynamic = "force-dynamic"
// The token is in the address, so never let it leak through a referrer or into a search index.
export const metadata: Metadata = { title: "Choose a new password | Beat the Blogger", robots: { index: false, follow: false }, referrer: "no-referrer" }

export default async function ResetPage(props: { searchParams?: Promise<{ token?: string; error?: string }> }) {
	requireAccounts()
	const sp = (await props.searchParams) ?? {}
	return (
		<AuthShell eyebrow="Account" title="Choose a new password">
			<ResetForm token={sp.token} linkError={Boolean(sp.error)} />
		</AuthShell>
	)
}
