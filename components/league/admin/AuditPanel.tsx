"use client"

import * as React from "react"

import type { AuditRow } from "@/lib/league2/services/adminLeague"
import { Notice } from "@/components/league/account/kit"
import { admin, when } from "./api"
import { Badge, LabeledInput, Panel, inputCls } from "./ui"

export function AuditPanel() {
	const [action, setAction] = React.useState("")
	const [subject, setSubject] = React.useState("")
	const [rows, setRows] = React.useState<AuditRow[]>([])
	const [state, setState] = React.useState<"idle" | "loading" | "error">("loading")
	const [err, setErr] = React.useState("")
	const [more, setMore] = React.useState(false)

	const load = React.useCallback(async (reset: boolean, beforeId?: number) => {
		setState("loading")
		const r = await admin<{ rows: AuditRow[] }>("audit", { filterAction: action.trim(), filterSubject: subject.trim(), beforeId })
		if (!r.ok) return (setErr(r.message), setState("error"))
		setRows((cur) => (reset ? r.data.rows : cur.concat(r.data.rows)))
		setMore(r.data.rows.length >= 50)
		setState("idle")
	}, [action, subject])

	React.useEffect(() => {
		load(true)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<Panel id="audit" title="Audit log" aside={<span className="text-xs text-muted-foreground">Every change, newest first. Entries cannot be edited or removed.</span>}>
			<form
				className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
				onSubmit={(e) => {
					e.preventDefault()
					load(true)
				}}
			>
				<LabeledInput label="Action starts with">
					<input value={action} onChange={(e) => setAction(e.target.value)} placeholder="result." className={inputCls} />
				</LabeledInput>
				<LabeledInput label="About (e.g. event: or player:)">
					<input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
				</LabeledInput>
				<button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
					Filter
				</button>
			</form>
			{state === "error" && (
				<div className="mt-3">
					<Notice kind="error">{err}</Notice>
				</div>
			)}
			<ul className="mt-4 grid gap-2" aria-busy={state === "loading"}>
				{rows.map((r) => (
					<li key={r.id} className="rounded-lg border border-border p-2.5 text-sm">
						<div className="flex flex-wrap items-center gap-2">
							<Badge>{r.action}</Badge>
							<span className="text-muted-foreground">{when(r.at)}</span>
							<span className="text-xs text-muted-foreground">{r.subject}</span>
							<span className="text-xs text-muted-foreground">by {r.role === "system" ? "system" : r.actor.slice(0, 8)}</span>
						</div>
						{r.reason && <p className="mt-1">{r.reason}</p>}
						{(r.before !== null || r.after !== null) && (
							<details className="mt-1">
								<summary className="cursor-pointer text-xs text-muted-foreground">What changed</summary>
								<pre className="mt-1 overflow-x-auto text-xs">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre>
							</details>
						)}
					</li>
				))}
			</ul>
			{state === "loading" && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading…</p>}
			{state === "idle" && rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing matches.</p>}
			{state === "idle" && more && (
				<button type="button" onClick={() => load(false, rows[rows.length - 1]?.id)} className="mt-3 h-9 rounded-md border border-input px-4 text-sm font-semibold">
					Show older
				</button>
			)}
		</Panel>
	)
}
