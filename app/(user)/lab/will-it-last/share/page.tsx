import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import ShareRedirect from "@/components/lab/ShareRedirect"
import { getScouting } from "@/lib/lab/data"
import { getHistoryView } from "@/lib/lab/history"
import { abbrOf } from "@/lib/lab/historyKit"
import { KIND_NAMES, PAGE_PATH, SECTION_IDS, type CheckedView, type RawView, readView, viewQuery } from "@/lib/lab/lastShare"

// Where a shared "Will it last?" link lands. The link preview (the card for the part that was shared) is read from this
// page's HTML, and a reader is sent straight on to the interactive chart with the same stat, filters and pinned team.
// It reads the query, so it is built per request; it is kept out of search results because the real page is /lab/will-it-last.

const SITE_URL = "https://www.raidersrundown.com"
const DESCRIPTION = "The Raiders' hot and cold stats, tested against every NFL team since 1999 that started the same way, with who made the playoffs."

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const raw: RawView = { kind: one(sp.kind), size: one(sp.size), stat: one(sp.stat), scope: one(sp.scope), team: one(sp.team), po: one(sp.po), years: one(sp.years), pin: one(sp.pin), y: one(sp.y) }
	const data = getHistoryView()
	if (!data) return null
	const view: CheckedView = readView(raw, { first: data.first, last: data.last, teams: new Set(data.meta.teams.map(abbrOf)), rows: new Set(data.meta.teams) })
	const stat = view.stat ?? data.stories[0]?.key ?? null
	const label = data.tables.find((t) => t.key === stat)?.label ?? null
	return { data, view: { ...view, stat }, label }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const found = await resolve(props)
	const stamp = Date.parse(getScouting().generatedAt) || 0
	const card = found ? `${SITE_URL}/api/og?type=last&${viewQuery(found.view, { kind: found.view.kind, size: "wide" })}&v=${stamp}` : `${SITE_URL}/og-default-v2.png`
	const what = found ? (found.label && found.view.kind !== "checklist" && found.view.kind !== "bottom" ? `${KIND_NAMES[found.view.kind]}: ${found.label}` : KIND_NAMES[found.view.kind]) : "Will it last?"
	const title = `${what} | Will it last? | Raiders Rundown`
	return {
		title,
		description: DESCRIPTION,
		robots: { index: false, follow: true },
		alternates: { canonical: `${SITE_URL}${PAGE_PATH}` },
		openGraph: { type: "website", title, description: DESCRIPTION, url: `${SITE_URL}${PAGE_PATH}`, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [card] },
	}
}

export default async function ShareLandingPage(props: Props) {
	const found = await resolve(props)
	const stamp = Date.parse(getScouting().generatedAt) || 0
	const href = found ? `${PAGE_PATH}?${viewQuery(found.view, { kind: found.view.kind })}#${SECTION_IDS[found.view.kind]}` : PAGE_PATH
	const image = found ? `/api/og?type=last&${viewQuery(found.view, { kind: found.view.kind, size: "wide" })}&v=${stamp}` : null

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<ShareRedirect href={href} />
			<section className="container py-10 sm:py-14">
				<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
					<Link href="/lab" className="hover:text-lab-ink">
						The Lab
					</Link>{" "}
					&middot; Will it last?
				</p>
				<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{found ? KIND_NAMES[found.view.kind] : "Will it last?"}</h1>
				{image ? (
					<Link href={href} className="mt-6 block max-w-3xl overflow-hidden rounded-2xl border border-lab-line bg-lab-tint">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={image} alt={`${KIND_NAMES[found!.view.kind]}${found?.label ? `: ${found.label}` : ""}`} width={1200} height={630} className="block h-auto w-full" />
					</Link>
				) : null}
				<p className="mt-6">
					<Link href={href} className="inline-flex min-h-[44px] items-center rounded-lg bg-lab-ink px-5 py-2 text-sm font-bold text-lab-page transition hover:opacity-90">
						Open the interactive chart
					</Link>
				</p>
			</section>
		</div>
	)
}
