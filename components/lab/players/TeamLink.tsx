"use client"

import type { ComponentProps } from "react"

import Link from "@/components/SiteLink"
import { useTeamFilter, withTeam } from "@/components/lab/players/useTeamFilter"

/** A link to another leaderboard that keeps the reader's team filter, so changing the stat never resets it. */
export default function TeamLink({ href, ...props }: ComponentProps<typeof Link>) {
	const [team] = useTeamFilter()
	return <Link href={typeof href === "string" ? withTeam(href, team) : href} {...props} />
}
