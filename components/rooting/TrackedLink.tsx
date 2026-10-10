"use client"

import Link from "@/components/SiteLink"
import { trackRooting } from "@/lib/analytics"

/** A link to the Playoff Machine that counts the click. */
export default function PlayoffMachineLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
	return (
		<Link href={href} onClick={() => trackRooting("rooting_playoff_machine_click")} className={className}>
			{children}
		</Link>
	)
}
