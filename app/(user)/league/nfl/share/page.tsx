import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import ShareRedirect from "@/components/lab/ShareRedirect"
import { MODE_NAME, MODE_PATH, isNflMode } from "@/lib/league2/competitions"
import { requireAccounts } from "@/lib/league2/gate"

// Where a shared NFL league link lands. The link preview (the card) is read from this page's HTML, and a reader is sent
// straight on to the format's page on the same week. Kept out of search results: the real pages are the formats themselves.

export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const VIEWS = ["me", "board", "alert"]

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "")

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const mode = isNflMode(one(sp.mode)) ? (one(sp.mode) as "winners" | "confidence" | "upset") : "winners"
	const w = Number(one(sp.week))
	const week = Number.isInteger(w) && w >= 1 && w <= 22 ? w : null
	const view = VIEWS.includes(one(sp.view)) ? one(sp.view) : "invite"
	const handle = /^[A-Za-z0-9_]{3,16}$/.test(one(sp.handle)) ? one(sp.handle) : ""
	const v = /^\d{1,10}$/.test(one(sp.v)) ? one(sp.v) : "0"
	const utm = ["utm_source", "utm_medium", "utm_campaign"].filter((k) => /^[A-Za-z0-9_.-]{1,60}$/.test(one(sp[k]))).map((k) => `${k}=${one(sp[k])}`)
	const card = `mode=${mode}${week ? `&week=${week}` : ""}&view=${view}${handle ? `&handle=${encodeURIComponent(handle)}` : ""}&v=${v}`
	const href = `${MODE_PATH[mode]}${[week ? `week=${week}` : "", ...utm].filter(Boolean).length ? `?${[week ? `week=${week}` : "", ...utm].filter(Boolean).join("&")}` : ""}`
	return { mode, week, view, handle, card, href }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	requireAccounts()
	const r = await resolve(props)
	const image = `${SITE_URL}/api/og?type=nflleague&${r.card}&size=wide`
	const name = MODE_NAME[r.mode]
	const title = `${r.view === "me" && r.handle ? `${r.handle}'s week` : r.view === "board" ? "Week standings" : r.view === "alert" ? "Upset of the week" : name} | ${name} | Raiders Rundown`
	const description = "Free weekly NFL pick'em from Raiders Rundown. Pick the winners, rank your confidence or call the upsets."
	return {
		title,
		description,
		robots: { index: false, follow: true },
		alternates: { canonical: `${SITE_URL}${MODE_PATH[r.mode]}` },
		openGraph: { type: "website", title, description, url: `${SITE_URL}${MODE_PATH[r.mode]}`, siteName: "Raiders Rundown", images: [image] },
		twitter: { card: "summary_large_image", title, description, images: [image] },
	}
}

export default async function NflShareLanding(props: Props) {
	requireAccounts()
	const r = await resolve(props)
	return (
		<div className="container py-14">
			<ShareRedirect href={r.href} />
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Raiders Rundown League</p>
			<h1 className="mt-2 font-serif text-3xl font-bold tracking-tight md:text-4xl">{MODE_NAME[r.mode]}</h1>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={`/api/og?type=nflleague&${r.card}&size=wide`} alt={`${MODE_NAME[r.mode]} share card`} width={1200} height={630} className="mt-6 h-auto w-full max-w-3xl rounded-xl border border-border" />
			<p className="mt-6">
				<Link href={r.href} className="font-semibold underline underline-offset-4">
					Open the league
				</Link>
			</p>
		</div>
	)
}
