"use client"

import * as React from "react"

import type { Overview, PolicyRow } from "@/lib/league2/services/adminLeague"
import { admin, isoToLocal, localToIso, when } from "./api"
import { ActionBox, Async, Badge, LabeledInput, Panel, inputCls, useLoad } from "./ui"

function Family({ family, rows, reload }: { family: string; rows: PolicyRow[]; reload: () => void }) {
	const latest = rows[rows.length - 1]
	const [json, setJson] = React.useState(JSON.stringify(latest.rules, null, 2))
	const [from, setFrom] = React.useState(isoToLocal(new Date(Date.now() + 7 * 86_400_000).toISOString()))
	const parsed = React.useMemo(() => {
		try {
			return { ok: true as const, value: JSON.parse(json) as unknown }
		} catch {
			return { ok: false as const }
		}
	}, [json])
	return (
		<li className="min-w-0 rounded-xl border border-border p-3">
			<p className="font-semibold">
				{latest.label} <span className="font-normal text-muted-foreground">({family})</span>
			</p>
			<ul className="mt-2 grid gap-2">
				{rows.map((p) => (
					<li key={p.id} className="min-w-0 rounded-lg bg-muted/40 p-2.5 text-sm">
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-semibold">Version {p.version}</span>
							{p.frozenAt ? <Badge tone="good">fixed</Badge> : <Badge tone="warn">draft</Badge>}
							<span className="text-xs text-muted-foreground">
								applies to games that lock {new Date(p.effectiveFrom).getUTCFullYear() < 2000 ? "from the start" : `after ${when(p.effectiveFrom)}`} · used by {p.grades} grade{p.grades === 1 ? "" : "s"}
							</span>
						</div>
						<pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(p.rules)}</pre>
						{!p.frozenAt && (
							<div className="mt-2">
								<ActionBox
									label="Make this version public and fixed"
									title="Freeze this version? It can never be edited afterwards; changes become a new version."
									onSubmit={async (reason) => {
										const r = await admin("freeze_policy", { policyId: p.id, reason })
										if (!r.ok) return r.message
										reload()
										return null
									}}
								/>
							</div>
						)}
					</li>
				))}
			</ul>
			<div className="mt-3">
				<ActionBox
					label="Publish new rules"
					title="Publish the next version. It applies only to games that lock after the date below, so nothing already open is rescored."
					canSubmit={parsed.ok && localToIso(from) !== null}
					onSubmit={async (reason) => {
						const r = await admin("publish_policy", { family, rules: parsed.ok ? parsed.value : null, effectiveFrom: localToIso(from), reason })
						if (!r.ok) return r.message
						reload()
						return null
					}}
				>
					<div className="sm:col-span-2">
						<LabeledInput label="Rules (JSON)">
							<textarea value={json} onChange={(e) => setJson(e.target.value)} rows={8} spellCheck={false} className={inputCls + " h-auto py-2 font-mono text-xs"} aria-invalid={!parsed.ok || undefined} />
						</LabeledInput>
						{!parsed.ok && <p role="alert" className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">That is not valid JSON.</p>}
					</div>
					<LabeledInput label="Applies to games locking after (your local time)">
						<input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
					</LabeledInput>
				</ActionBox>
			</div>
		</li>
	)
}

export function RulesPanel() {
	const { state, data, error, reload } = useLoad<Overview>(async () => {
		const r = await admin<Overview & { ok: true }>("overview")
		return r.ok ? { ok: true, data: r.data } : r
	}, [])
	const families = React.useMemo(() => {
		const m: Record<string, PolicyRow[]> = {}
		data?.policies.forEach((p) => (m[p.family] = (m[p.family] ?? []).concat(p)))
		return Object.keys(m).map((f) => ({ family: f, rows: m[f].sort((a, b) => a.version - b.version) }))
	}, [data])
	return (
		<Panel id="rules" title="Scoring rules" aside={<span className="text-xs text-muted-foreground">Rules are versioned. Played games are never rescored by a new version.</span>}>
			<Async state={state} error={error}>
				<ul className="grid gap-4">
					{families.map((f) => (
						<Family key={f.family + f.rows.length} family={f.family} rows={f.rows} reload={reload} />
					))}
				</ul>
			</Async>
		</Panel>
	)
}
