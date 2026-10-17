"use client"

import * as React from "react"

import type { MemberDetail, MemberSummary } from "@/lib/league2/services/admin"
import type { AdminEntry } from "@/lib/league2/services/adminLeague"
import { STRONG_EVIDENCE, type EvidenceKind } from "@/lib/league2/domain/legacyClaim"
import { Notice } from "@/components/league/account/kit"
import { admin, when } from "./api"
import { ActionBox, Async, Badge, LabeledInput, Panel, inputCls, useLoad } from "./ui"

const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
	x_dm_from_original_account: "Message from the original X account",
	email_used_when_contacting: "Email address the owner used when they contacted us",
	pick_details_only_owner_knows: "Pick details only the owner would know",
	signup_link_or_device_detail: "Sign-up link or device detail",
}

function LegacyLink({ member, reload }: { member: MemberDetail; reload: () => void }) {
	const [handle, setHandle] = React.useState("")
	const [evidence, setEvidence] = React.useState<EvidenceKind[]>([])
	const toggle = (k: EvidenceKind) => setEvidence((e) => (e.indexOf(k) >= 0 ? e.filter((x) => x !== k) : e.concat(k)))
	return (
		<ActionBox
			label="Link an old-style player to this account"
			title="Hand a handle-and-key player to this account after review. Needs two kinds of evidence. This account must have no picks of its own."
			canSubmit={handle.trim().length >= 3 && evidence.length >= 2}
			onSubmit={async (reason) => {
				const r = await admin("link_legacy", { handleLower: handle.trim().toLowerCase(), claimantUserId: member.userId, evidence, notes: reason })
				if (!r.ok) return r.message
				reload()
				return null
			}}
		>
			<div className="sm:col-span-2">
				<LabeledInput label="Old handle">
					<input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={16} className={inputCls} autoCapitalize="none" autoCorrect="off" />
				</LabeledInput>
			</div>
			<fieldset className="sm:col-span-2">
				<legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evidence you have checked (pick at least two)</legend>
				{STRONG_EVIDENCE.map((k) => (
					<label key={k} className="mt-1 flex items-start gap-2 text-sm">
						<input type="checkbox" checked={evidence.indexOf(k) >= 0} onChange={() => toggle(k)} className="mt-1" />
						{EVIDENCE_LABEL[k]}
					</label>
				))}
			</fieldset>
		</ActionBox>
	)
}

function Entries({ playerId }: { playerId: string }) {
	const l = useLoad<{ entries: AdminEntry[] }>(async () => {
		const r = await admin<{ entries: AdminEntry[] }>("member_entries", { playerId })
		return r.ok ? { ok: true, data: r.data } : r
	}, [playerId])
	return (
		<div className="mt-4">
			<h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Picks</h4>
			<Async state={l.state} error={l.error}>
				{l.data && l.data.entries.length === 0 ? (
					<p className="mt-1 text-sm text-muted-foreground">No picks yet.</p>
				) : (
					<ul className="mt-1 grid gap-2">
						{l.data?.entries.map((e) => (
							<li key={e.entryId} className="rounded-lg border border-border p-2.5 text-sm">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-semibold">
										Week {e.week}: {e.matchup}
									</span>
									<span className="text-muted-foreground">{JSON.stringify(e.payload).replace(/[{}"]/g, "").replace(/,/g, " · ")}</span>
									{e.voided ? <Badge tone="bad">removed</Badge> : e.points !== null ? <Badge tone="good">{e.points} pts</Badge> : <Badge>not graded</Badge>}
									{e.revisions > 1 && <span className="text-xs text-muted-foreground">changed {e.revisions - 1}×</span>}
								</div>
								{e.voided && e.voidedReason && <p className="mt-1 text-xs text-muted-foreground">Removed: {e.voidedReason}</p>}
								<div className="mt-2 flex flex-wrap items-start gap-2">
									{e.voided ? (
										<ActionBox
											label="Put back"
											onSubmit={async (reason) => {
												const r = await admin("restore_entry", { entryId: e.entryId, reason })
												if (!r.ok) return r.message
												l.reload()
												return null
											}}
										/>
									) : (
										<ActionBox
											label="Remove pick"
											tone="danger"
											title="Remove this pick from play? It is kept on record but stops counting."
											onSubmit={async (reason) => {
												const r = await admin("void_entry", { entryId: e.entryId, reason })
												if (!r.ok) return r.message
												l.reload()
												return null
											}}
										/>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</Async>
		</div>
	)
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
	const d = useLoad<{ member: MemberDetail }>(async () => {
		const r = await admin<{ member: MemberDetail }>("detail", { playerId: id })
		return r.ok ? { ok: true, data: r.data } : r
	}, [id])
	const [note, setNote] = React.useState("")
	const m = d.data?.member
	const after = () => (d.reload(), onChanged())
	const act = (action: string, extra: Record<string, unknown> = {}) => async (reason: string) => {
		const r = await admin(action, { playerId: id, reason, ...extra })
		if (!r.ok) return r.message
		after()
		return null
	}
	return (
		<Async state={d.state} error={d.error}>
			{m && (
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="font-serif text-2xl font-bold">{m.handle}</h3>
						{m.disabled ? <Badge tone="bad">disabled</Badge> : <Badge tone="good">active</Badge>}
						{m.legacyState && <Badge>old-style: {m.legacyState}</Badge>}
						{m.userId ? <Badge tone={m.emailVerified ? "good" : "warn"}>{m.emailVerified ? "email verified" : "email not verified"}</Badge> : <Badge>no account yet</Badge>}
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{m.maskedEmail ?? "No email"} · joined {when(m.joinedAt)} · {m.entries} picks ({m.gradedEntries} graded) · {m.activeSessions} active sign-in{m.activeSessions === 1 ? "" : "s"}
					</p>
					<div className="mt-3 flex flex-wrap items-start gap-2">
						{m.disabled ? (
							<ActionBox label="Restore account" onSubmit={act("restore")} />
						) : (
							<ActionBox label="Disable account" tone="danger" title="Disable this account? It leaves the boards and every sign-in ends." onSubmit={act("disable")} />
						)}
						{m.userId && <ActionBox label="Sign out everywhere" onSubmit={act("revoke_sessions")} />}
						{m.userId && m.emailVerified && (
							<ActionBox
								label="Email a reset link"
								title="Send the owner a password reset link at their verified address. You never see or set a password."
								needsReason={false}
								onSubmit={async () => {
									const r = await admin("send_reset", { playerId: id })
									if (!r.ok) return r.message
									setNote("Reset link sent.")
									return null
								}}
							/>
						)}
						{(m.legacyState === "claimed" || m.legacyState === "retired") && (
							<ActionBox label="Undo the upgrade" tone="danger" title="Undo this player's upgrade? Their old recovery key works again and the account loses this player." onSubmit={act("rollback_claim", { handleLower: m.handle.toLowerCase() })} />
						)}
						{m.userId && <LegacyLink member={m} reload={after} />}
					</div>
					{note && (
						<div className="mt-2">
							<Notice kind="ok">{note}</Notice>
						</div>
					)}
					<Entries playerId={id} />
					{m.cases.length > 0 && (
						<div className="mt-4">
							<h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Support cases</h4>
							<ul className="mt-1 text-sm">
								{m.cases.map((c) => (
									<li key={c.id}>
										{c.kind.replace(/_/g, " ")} · {c.status.replace(/_/g, " ")} · {when(c.createdAt)}
									</li>
								))}
							</ul>
						</div>
					)}
					<div className="mt-4">
						<h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent changes</h4>
						{m.recentAudit.length === 0 ? (
							<p className="mt-1 text-sm text-muted-foreground">Nothing recorded.</p>
						) : (
							<ul className="mt-1 grid gap-1 text-sm">
								{m.recentAudit.map((a, i) => (
									<li key={i}>
										<span className="text-muted-foreground">{when(a.at)}</span> {a.action}
										{a.reason ? <span className="text-muted-foreground"> — {a.reason}</span> : null}
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			)}
		</Async>
	)
}

export function MembersPanel() {
	const [q, setQ] = React.useState("")
	const [submitted, setSubmitted] = React.useState("")
	const [selected, setSelected] = React.useState<string | null>(null)
	const list = useLoad<{ members: MemberSummary[] }>(async () => {
		if (!submitted) return { ok: true, data: { members: [] } }
		const r = await admin<{ members: MemberSummary[] }>("search", { query: submitted })
		return r.ok ? { ok: true, data: r.data } : r
	}, [submitted])
	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
			<Panel id="mem-search" title="Find a member">
				<form
					role="search"
					onSubmit={(e) => {
						e.preventDefault()
						setSubmitted(q.trim())
						setSelected(null)
					}}
				>
					<LabeledInput label="Handle starts with, or exact email">
						<input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} autoCapitalize="none" autoCorrect="off" maxLength={100} />
					</LabeledInput>
					<button type="submit" className="mt-2 h-9 w-full rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
						Search
					</button>
				</form>
				<Async state={list.state} error={list.error}>
					{submitted && list.data && list.data.members.length === 0 ? (
						<p className="mt-3 text-sm text-muted-foreground">Nobody matches.</p>
					) : (
						<ul className="mt-3 grid gap-1.5">
							{list.data?.members.map((m) => (
								<li key={m.playerId}>
									<button type="button" onClick={() => setSelected(m.playerId)} aria-pressed={selected === m.playerId} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${selected === m.playerId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
										<span className="font-semibold">{m.handle}</span>
										<span className="text-xs text-muted-foreground">{m.disabled ? "disabled" : m.maskedEmail ?? "no account"}</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</Async>
			</Panel>
			<Panel id="mem-detail" title={selected ? "Member" : "Select a member"}>
				{selected ? <Detail key={selected} id={selected} onChanged={list.reload} /> : <p className="text-sm text-muted-foreground">Search for a member, then pick them to see their account, picks and recent changes.</p>}
			</Panel>
		</div>
	)
}
