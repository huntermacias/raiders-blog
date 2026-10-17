"use client"

import * as React from "react"

import type { AdminEvent, Overview } from "@/lib/league2/services/adminLeague"
import { nick } from "@/lib/league2/format"
import { admin, isoToLocal, localToIso, when } from "./api"
import { ActionBox, Async, Badge, LabeledInput, Panel, inputCls, useLoad } from "./ui"

const STATE_TONE: Record<string, "neutral" | "good" | "warn" | "bad"> = { final: "good", cancelled: "bad", postponed: "warn", in_progress: "warn", scheduled: "neutral" }

function Score({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
	return (
		<LabeledInput label={label}>
			<input id={id} inputMode="numeric" pattern="[0-9]*" maxLength={2} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className={inputCls} />
		</LabeledInput>
	)
}

function EventCard({ e, reload }: { e: AdminEvent; reload: () => void }) {
	const [away, setAway] = React.useState(e.awayScore?.toString() ?? "")
	const [home, setHome] = React.useState(e.homeScore?.toString() ?? "")
	const [bAway, setBAway] = React.useState(e.blogger?.away.toString() ?? "")
	const [bHome, setBHome] = React.useState(e.blogger?.home.toString() ?? "")
	const [lock, setLock] = React.useState(isoToLocal(e.lockAt ?? e.kickoff))
	const run = (action: string, extra: Record<string, unknown>) => async (reason: string) => {
		const r = await admin(action, { eventId: e.id, reason, ...extra })
		if (!r.ok) return r.message
		reload()
		return null
	}
	return (
		<li className="rounded-xl border border-border p-3">
			<div className="flex flex-wrap items-center gap-2">
				<p className="font-semibold">
					Week {e.week}: {nick(e.awayTeam)} at {nick(e.homeTeam)}
				</p>
				<Badge tone={STATE_TONE[e.state] ?? "neutral"}>{e.state.replace("_", " ")}</Badge>
				{e.pinned && <Badge tone="warn">score set by admin</Badge>}
				{e.blogger && e.blogger.afterLockRevisions > 0 && <Badge tone="warn">blogger pick changed after lock</Badge>}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Kickoff {when(e.kickoff)}
				{e.lockAt ? ` · picks lock ${when(e.lockAt)}` : ""} · {e.entries} pick{e.entries === 1 ? "" : "s"} ({e.graded} graded{e.voided ? `, ${e.voided} removed` : ""})
				{e.awayScore !== null && e.homeScore !== null ? ` · final ${e.awayScore}–${e.homeScore}` : ""}
				{e.blogger ? ` · blogger ${e.blogger.away}–${e.blogger.home}` : ""}
			</p>
			<div className="mt-3 flex flex-wrap items-start gap-2">
				<ActionBox label={e.state === "final" ? "Correct score" : "Set final score"} title="Set the final score. Every pick is regraded; the old grades stay as history." onSubmit={run("set_result", { away: Number(away), home: Number(home) })} canSubmit={away !== "" && home !== ""}>
					<Score id={`a-${e.id}`} label={`${nick(e.awayTeam)} score`} value={away} onChange={setAway} />
					<Score id={`h-${e.id}`} label={`${nick(e.homeTeam)} score`} value={home} onChange={setHome} />
				</ActionBox>
				<ActionBox label="Blogger's pick" title="Enter or correct the blogger's pick. After the lock, the change stays visible on the public record." onSubmit={run("blogger_pick", { away: Number(bAway), home: Number(bHome) })} canSubmit={bAway !== "" && bHome !== "" && bAway !== bHome}>
					<Score id={`ba-${e.id}`} label={`${nick(e.awayTeam)}`} value={bAway} onChange={setBAway} />
					<Score id={`bh-${e.id}`} label={`${nick(e.homeTeam)}`} value={bHome} onChange={setBHome} />
				</ActionBox>
				{e.state !== "final" && e.state !== "cancelled" && (
					<ActionBox label="Move the lock" title="Change when picks close (your local time)" onSubmit={run("move_lock", { lockAt: localToIso(lock) })} canSubmit={localToIso(lock) !== null}>
						<LabeledInput label="Picks close at">
							<input type="datetime-local" value={lock} onChange={(ev) => setLock(ev.target.value)} className={inputCls} />
						</LabeledInput>
					</ActionBox>
				)}
				{e.pinned && <ActionBox label="Let the sync decide the score" title="Hand the score back to Sanity and ESPN" onSubmit={run("release_pin", {})} />}
				{e.state === "cancelled" ? <ActionBox label="Restore game" onSubmit={run("restore_event", {})} /> : <ActionBox label="Cancel game" tone="danger" title="Cancel this game? Its picks stop counting for everyone." onSubmit={run("cancel_event", {})} />}
			</div>
		</li>
	)
}

export function GamesPanel() {
	const comps = useLoad<Overview>(async () => {
		const r = await admin<Overview & { ok: true }>("overview")
		return r.ok ? { ok: true, data: r.data } : r
	}, [])
	const [comp, setComp] = React.useState("")
	React.useEffect(() => {
		if (comps.data && !comp) setComp((comps.data.competitions.find((c) => c.kind === "btb") ?? comps.data.competitions[0])?.id ?? "")
	}, [comps.data, comp])
	const list = useLoad<{ events: AdminEvent[] }>(async () => {
		if (!comp) return { ok: true, data: { events: [] } }
		const r = await admin<{ events: AdminEvent[] }>("events", { competitionId: comp })
		return r.ok ? { ok: true, data: r.data } : r
	}, [comp])

	return (
		<Panel
			id="games"
			title="Games"
			aside={
				comps.data && comps.data.competitions.length > 0 ? (
					<label className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">Competition</span>
						<select value={comp} onChange={(e) => setComp(e.target.value)} className={inputCls + " w-auto"}>
							{comps.data.competitions.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name} {c.season}
								</option>
							))}
						</select>
					</label>
				) : null
			}
		>
			<Async state={comps.state === "error" ? "error" : list.state} error={comps.error || list.error}>
				{list.data && list.data.events.length === 0 ? (
					<p className="text-sm text-muted-foreground">No games in this competition yet.</p>
				) : (
					<ul className="grid gap-3">
						{list.data?.events.map((e) => (
							<EventCard key={e.id} e={e} reload={list.reload} />
						))}
					</ul>
				)}
			</Async>
		</Panel>
	)
}
