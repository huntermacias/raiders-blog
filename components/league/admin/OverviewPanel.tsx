"use client"

import * as React from "react"

import type { Overview, RecalcReport } from "@/lib/league2/services/adminLeague"
import { Notice } from "@/components/league/account/kit"
import { admin, when } from "./api"
import { ActionBox, Async, Badge, Panel, useLoad } from "./ui"

export function OverviewPanel() {
	const { state, data, error, reload } = useLoad<Overview>(async () => {
		const r = await admin<Overview & { ok: true }>("overview")
		return r.ok ? { ok: true, data: r.data } : r
	}, [])
	const [report, setReport] = React.useState<{ id: string; r: RecalcReport } | null>(null)

	return (
		<div className="grid gap-5">
			<Panel id="ov-comps" title="Competitions" aside={<span className="text-xs text-muted-foreground">Turning one off hides it from players</span>}>
				<Async state={state} error={error}>
					{data && data.competitions.length === 0 ? (
						<p className="text-sm text-muted-foreground">No competitions yet. Run the import first.</p>
					) : (
						<ul className="grid gap-3">
							{data?.competitions.map((c) => (
								<li key={c.id} className="rounded-xl border border-border p-3">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-semibold">{c.name}</p>
										<span className="text-xs text-muted-foreground">
											{c.id} · {c.season}
										</span>
										<Badge tone={c.enabled ? "good" : "warn"}>{c.enabled ? "On" : "Off"}</Badge>
									</div>
									<dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
										{[
											["Games with picks", c.events],
											["Picks", c.entries],
											["Graded", c.gradedEntries],
											["Removed", c.voidedEntries],
										].map(([k, v]) => (
											<div key={k as string}>
												<dt className="text-[11px] uppercase tracking-widest text-muted-foreground">{k}</dt>
												<dd className="font-semibold tabular-nums">{v}</dd>
											</div>
										))}
									</dl>
									<div className="mt-3 flex flex-wrap items-start gap-2">
										<ActionBox
											label={c.enabled ? "Turn off" : "Turn on"}
											tone={c.enabled ? "danger" : "default"}
											title={c.enabled ? `Turn off ${c.name}? Players stop seeing it and cannot pick.` : `Turn on ${c.name}?`}
											onSubmit={async (reason) => {
												const r = await admin("set_enabled", { competitionId: c.id, enabled: !c.enabled, reason })
												if (!r.ok) return r.message
												reload()
												return null
											}}
										/>
										<ActionBox
											label="Recalculate and check"
											title="Regrade this competition and check nothing is missing"
											onSubmit={async (reason) => {
												const r = await admin<{ report: RecalcReport }>("recalculate", { competitionId: c.id, reason })
												if (!r.ok) return r.message
												setReport({ id: c.id, r: r.data.report })
												reload()
												return null
											}}
										/>
									</div>
									{report?.id === c.id && (
										<div className="mt-3">
											<Notice kind={report.r.finalWithoutGrade === 0 && report.r.duplicateCurrent === 0 && report.r.unreadable === 0 ? "ok" : "error"}>
												Added {report.r.created} grade(s), {report.r.skipped} already correct. Final games with ungraded picks: {report.r.finalWithoutGrade}. Picks with two counting grades: {report.r.duplicateCurrent}. Unreadable picks: {report.r.unreadable}.
											</Notice>
										</div>
									)}
								</li>
							))}
						</ul>
					)}
				</Async>
			</Panel>

			<Panel id="ov-sync" title="Syncs from Sanity and ESPN">
				<Async state={state} error={error}>
					<ul className="grid gap-2 text-sm">
						{data?.sync.map((s) => (
							<li key={s.key} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-3 py-2">
								<span className="font-semibold">{s.key === "btb" ? "Beat the Blogger games and picks" : s.key === "nfl" ? "NFL games and results" : s.key}</span>
								<span className="text-muted-foreground">{new Date(s.ranAt).getUTCFullYear() < 2000 ? "Has not run yet" : `Last run ${when(s.ranAt)}`}</span>
								{s.detail ? <code className="w-full overflow-x-auto whitespace-pre text-xs text-muted-foreground">{JSON.stringify(s.detail)}</code> : null}
							</li>
						))}
					</ul>
					<p className="mt-3 text-xs text-muted-foreground">Syncs run on their own at most once a minute while people visit. {data ? `${data.admins} admin${data.admins === 1 ? "" : "s"} registered.` : ""}</p>
				</Async>
			</Panel>
		</div>
	)
}
