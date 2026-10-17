import Link from "@/components/SiteLink"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { Table } from "@/components/league/home/sections"
import { getRuntime } from "@/lib/league2/auth/server"
import { currentSeason } from "@/lib/league2/http/handlers"
import { loadCompetition } from "@/lib/league2/services/read"
import { currentAccount } from "@/lib/league2/session"
import { buildBoard } from "@/lib/league2/view/btb"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
	title: "Beat the Blogger leaderboard | Raiders Rundown",
	description: "Every player in the Raiders score-pick league, ranked by season or by week.",
	alternates: { canonical: "https://www.raidersrundown.com/league/board" },
}

export default async function BoardPage(props: { searchParams?: Promise<{ week?: string; page?: string }> }) {
	const rt = getRuntime()
	if (!rt) notFound()
	const sp = (await props.searchParams) ?? {}
	const account = await currentAccount()
	const data = await loadCompetition(rt.db, `btb-${currentSeason()}`, null)
	if (data.events.length === 0) notFound()
	const v = buildBoard(data, account?.player ? { id: account.player.id } : null, { week: sp.week ? Number(sp.week) : null, page: Number(sp.page) || 1 })
	const href = (w: number | null, p = 1) => `/league/board?${[w ? `week=${w}` : "", p > 1 ? `page=${p}` : ""].filter(Boolean).join("&")}`
	const tabs = [{ label: "Season", w: null as number | null }, ...v.weeks.map((w) => ({ label: `Week ${w}`, w }))]
	return (
		<div className="container py-10 md:py-14">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Beat the Blogger</p>
			<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight">{v.week === null ? "Season" : `Week ${v.week}`} leaderboard</h1>
			<p className="mt-2 max-w-2xl text-muted-foreground">
				{v.total} ranked player{v.total === 1 ? "" : "s"}. My total: {v.blogger.points} points in {v.blogger.games} game{v.blogger.games === 1 ? "" : "s"}.
			</p>
			<nav aria-label="Leaderboard period" className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
				{tabs.map((t) => (
					<Link key={t.label} href={href(t.w)} aria-current={v.week === t.w ? "page" : undefined} className={cn("rounded-full border px-3 py-1.5 transition-colors", v.week === t.w ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}>
						{t.label}
					</Link>
				))}
			</nav>
			<div className="mt-6">
				{v.total === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Nobody is ranked yet.</p> : <Table rows={v.rows} caption={`${v.week === null ? "Season" : `Week ${v.week}`} leaderboard, page ${v.page} of ${v.pages}`} />}
			</div>
			{v.pages > 1 && (
				<nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm font-semibold">
					{v.page > 1 ? <Link href={href(v.week, v.page - 1)}>Previous</Link> : <span />}
					<span className="text-muted-foreground">
						Page {v.page} of {v.pages}
					</span>
					{v.page < v.pages ? <Link href={href(v.week, v.page + 1)}>Next</Link> : <span />}
				</nav>
			)}
		</div>
	)
}
