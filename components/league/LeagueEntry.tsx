"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Loader2, Lock, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { teamInfo } from "@/lib/nfl"
import { MAX_SCORE, type OpenGame } from "@/lib/league"
import { trackConversion } from "@/lib/analytics"
import { loadUtm } from "@/lib/utm"
import { type LeagueCreds, clearCreds, loadCreds, postJson, saveCreds } from "@/lib/league.client"

type Saved = Record<string, { awayScore: number; homeScore: number }>
type Phase = "loading" | "anon" | "authed" | "offline"

// Fixed zone so the server render and the client hydration agree.
function formatKickoff(iso: string) {
	return new Date(iso).toLocaleString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: "America/Los_Angeles",
		timeZoneName: "short",
	})
}

function toMap(picks: { predictionId: string; awayScore: number; homeScore: number }[]): Saved {
	const m: Saved = {}
	for (const p of picks) m[p.predictionId] = { awayScore: p.awayScore, homeScore: p.homeScore }
	return m
}

/** The two ways in: claim a handle, or come back with a recovery key. */
function SignIn({ onDone, notice }: { onDone: (c: LeagueCreds, saved: Saved, fresh: boolean) => void; notice?: string | null }) {
	const [mode, setMode] = useState<"join" | "signin">("join")
	const [handle, setHandle] = useState("")
	const [key, setKey] = useState("")
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy) return
		setBusy(true)
		setError(null)
		if (mode === "join") {
			const utm = loadUtm()
			const r = await postJson<{ handle: string; key: string }>("/api/league/join", { handle, utm: utm ?? undefined })
			if (r.ok) {
				trackConversion("league_join", utm)
				onDone({ handle: r.data.handle, key: r.data.key }, {}, true)
			} else setError(r.message)
		} else {
			const r = await postJson<{ handle: string; picks: { predictionId: string; awayScore: number; homeScore: number }[] }>("/api/league/signin", { handle, key })
			if (r.ok) onDone({ handle: r.data.handle, key }, toMap(r.data.picks), false)
			else setError(r.message)
		}
		setBusy(false)
	}

	return (
		<div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
			{notice && (
				<p role="status" className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
					{notice}
				</p>
			)}
			<div role="tablist" aria-label="Join or sign in" className="mb-5 inline-flex rounded-lg border border-border bg-muted p-1 text-sm font-semibold">
				{(["join", "signin"] as const).map((m) => (
					<button
						key={m}
						type="button"
						role="tab"
						aria-selected={mode === m}
						onClick={() => {
							setMode(m)
							setError(null)
						}}
						className={cn("rounded-md px-3 py-1.5 transition-colors", mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
					>
						{m === "join" ? "New here" : "I have a key"}
					</button>
				))}
			</div>

			<h3 className="font-serif text-2xl font-bold tracking-tight">{mode === "join" ? "Pick a handle and you're in" : "Welcome back"}</h3>
			<p className="mt-1 max-w-xl text-sm text-muted-foreground">
				{mode === "join"
					? "No email, no password. You get a recovery key to keep. It's the only way back in on another device."
					: "Enter your handle and the recovery key you saved."}
			</p>

			<form onSubmit={submit} className="mt-5 grid max-w-xl gap-3" noValidate>
				<div>
					<label htmlFor="lg-handle" className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Handle
					</label>
					<Input
						id="lg-handle"
						value={handle}
						onChange={(e) => setHandle(e.target.value)}
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						maxLength={16}
						placeholder="SilverAndBlack"
					/>
					{mode === "join" && <p className="mt-1 text-xs text-muted-foreground">3 to 16 letters, numbers or underscores. Shown on the public board.</p>}
				</div>
				{mode === "signin" && (
					<div>
						<label htmlFor="lg-key" className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
							Recovery key
						</label>
						<Input id="lg-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" autoCapitalize="characters" spellCheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" className="font-mono" />
					</div>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" disabled={busy || handle.trim() === "" || (mode === "signin" && key.trim() === "")}>
						{busy ? (
							<>
								<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> One sec
							</>
						) : mode === "join" ? (
							"Claim my handle"
						) : (
							"Sign in"
						)}
					</Button>
				</div>
				<p aria-live="polite" className="min-h-[1.25rem] text-sm font-medium text-rose-700 dark:text-rose-400">
					{error}
				</p>
			</form>
		</div>
	)
}

function KeyReveal({ creds, onDismiss }: { creds: LeagueCreds; onDismiss: () => void }) {
	const [copied, setCopied] = useState(false)

	async function copy() {
		try {
			await navigator.clipboard.writeText(creds.key)
			setCopied(true)
		} catch {
			// Clipboard blocked: the key is selectable text, they can copy by hand.
		}
	}

	return (
		<div role="alert" className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-sm md:p-8">
			<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">You&rsquo;re in as {creds.handle}</p>
			<h3 className="mt-1 font-serif text-2xl font-bold tracking-tight">Save your recovery key</h3>
			<p className="mt-1 max-w-xl text-sm text-muted-foreground">
				This is the only time it&rsquo;s shown. It&rsquo;s how you sign back in on a new phone or after clearing your browser, and I can&rsquo;t recover it for you.
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-3">
				<code className="select-all rounded-lg border border-border bg-muted px-4 py-3 font-mono text-lg font-bold tracking-wider">{creds.key}</code>
				<Button type="button" variant="outline" onClick={copy}>
					{copied ? <Check aria-hidden className="mr-2 h-4 w-4" /> : <Copy aria-hidden className="mr-2 h-4 w-4" />}
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
			<Button type="button" className="mt-5" onClick={onDismiss}>
				I&rsquo;ve saved it
			</Button>
		</div>
	)
}

function GameEntry({
	game,
	saved,
	creds,
	onSaved,
	onAuthLost,
}: {
	game: OpenGame
	saved?: { awayScore: number; homeScore: number }
	creds: LeagueCreds
	onSaved: (id: string, s: { awayScore: number; homeScore: number }) => void
	onAuthLost: () => void
}) {
	const away = teamInfo(game.awayTeam)
	const home = teamInfo(game.homeTeam)
	const [a, setA] = useState(saved ? String(saved.awayScore) : "")
	const [h, setH] = useState(saved ? String(saved.homeScore) : "")
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
	const [closed, setClosed] = useState(false)

	// Date.now() only after mount so hydration matches.
	useEffect(() => {
		setClosed(Date.now() >= new Date(game.kickoff).getTime())
	}, [game.kickoff])

	const dirty = !saved || String(saved.awayScore) !== a || String(saved.homeScore) !== h

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy || closed) return
		const aw = Number(a)
		const ho = Number(h)
		const valid = (n: number, s: string) => s.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE
		if (!valid(aw, a) || !valid(ho, h)) {
			setMsg({ kind: "error", text: `Enter both scores as whole numbers from 0 to ${MAX_SCORE}.` })
			return
		}
		if (aw === ho) {
			setMsg({ kind: "error", text: "Pick a winner: the scores can't be tied." })
			return
		}
		setBusy(true)
		setMsg(null)
		const r = await postJson("/api/league/pick", { handle: creds.handle, key: creds.key, predictionId: game._id, awayScore: aw, homeScore: ho })
		setBusy(false)
		if (r.ok) {
			onSaved(game._id, { awayScore: aw, homeScore: ho })
			setMsg({ kind: "ok", text: "Locked in. You can change it until kickoff." })
		} else if (r.status === 401 || r.status === 403) {
			onAuthLost()
		} else if (r.status === 409) {
			setClosed(true)
		} else {
			setMsg({ kind: "error", text: r.message })
		}
	}

	return (
		<form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-label={`Week ${game.week} pick`} noValidate>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					Week {game.week} <span aria-hidden>·</span> {formatKickoff(game.kickoff)}
				</p>
				{closed && (
					<span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
						<Lock aria-hidden className="h-3 w-3" /> Picks closed
					</span>
				)}
			</div>

			<div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3">
				{[
					{ info: away, value: a, set: setA, label: `${away.nick} score` },
					{ info: home, value: h, set: setH, label: `${home.nick} score` },
				].map((row, i) => (
					<div key={row.info.name} className="contents">
						<div className="flex min-w-0 items-center gap-2">
							<span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15" style={{ backgroundColor: row.info.color }} />
							<span className="truncate font-serif text-lg font-bold">{row.info.nick}</span>
							<span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{i === 0 ? "at" : "home"}</span>
						</div>
						<Input
							type="number"
							inputMode="numeric"
							min={0}
							max={MAX_SCORE}
							aria-label={row.label}
							value={row.value}
							disabled={closed}
							onChange={(e) => {
								row.set(e.target.value)
								setMsg(null)
							}}
							className="w-20 text-center font-serif text-xl font-bold tabular-nums"
						/>
					</div>
				))}
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-3">
				<Button type="submit" disabled={busy || closed || !dirty}>
					{busy ? (
						<>
							<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> Saving
						</>
					) : saved ? (
						dirty ? "Update pick" : (
							<>
								<Check aria-hidden className="mr-1.5 h-4 w-4" strokeWidth={3} /> Locked in
							</>
						)
					) : (
						"Lock in pick"
					)}
				</Button>
				<p aria-live="polite" className={cn("min-h-[1.25rem] text-sm font-medium", msg?.kind === "error" ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground")}>
					{msg?.text}
				</p>
			</div>
		</form>
	)
}

/**
 * The play-along box: sign in (or claim a handle), then enter a score for each
 * open game. The server re-checks everything; this just makes it pleasant.
 */
export default function LeagueEntry({ games }: { games: OpenGame[] }) {
	const [phase, setPhase] = useState<Phase>("loading")
	const [creds, setCreds] = useState<LeagueCreds | null>(null)
	const [saved, setSaved] = useState<Saved>({})
	const [fresh, setFresh] = useState<LeagueCreds | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	async function restore(c: LeagueCreds) {
		setPhase("loading")
		const r = await postJson<{ handle: string; picks: { predictionId: string; awayScore: number; homeScore: number }[] }>("/api/league/signin", c)
		if (r.ok) {
			setCreds({ handle: r.data.handle, key: c.key })
			setSaved(toMap(r.data.picks))
			setPhase("authed")
		} else if (r.status === 400 || r.status === 401 || r.status === 403) {
			clearCreds()
			setNotice("You were signed out. Sign in again with your recovery key.")
			setPhase("anon")
		} else {
			setCreds(c)
			setPhase("offline")
		}
	}

	useEffect(() => {
		const c = loadCreds()
		if (c) restore(c)
		else setPhase("anon")
	}, [])

	function signOut() {
		clearCreds()
		setCreds(null)
		setSaved({})
		setFresh(null)
		setNotice(null)
		setPhase("anon")
	}

	if (phase === "loading") {
		return (
			<div role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
				<Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Checking your sign-in
			</div>
		)
	}

	if (phase === "offline" && creds) {
		return (
			<div role="alert" className="rounded-2xl border border-border bg-card p-6">
				<p className="text-sm font-medium">Couldn&rsquo;t reach the league just now.</p>
				<div className="mt-3 flex gap-3">
					<Button type="button" onClick={() => restore(creds)}>
						Try again
					</Button>
					<Button type="button" variant="ghost" onClick={signOut}>
						Sign out
					</Button>
				</div>
			</div>
		)
	}

	if (phase === "anon" || !creds) {
		return (
			<SignIn
				notice={notice}
				onDone={(c, s, isNew) => {
					saveCreds(c)
					setCreds(c)
					setSaved(s)
					setNotice(null)
					setFresh(isNew ? c : null)
					setPhase("authed")
				}}
			/>
		)
	}

	return (
		<div className="grid gap-4">
			{fresh && <KeyReveal creds={fresh} onDismiss={() => setFresh(null)} />}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					Playing as <span className="font-semibold text-foreground">{creds.handle}</span>
				</p>
				<Button type="button" variant="ghost" size="sm" onClick={signOut}>
					<LogOut aria-hidden className="mr-1.5 h-4 w-4" /> Sign out
				</Button>
			</div>

			{games.length === 0 ? (
				<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
					No games are open for picks right now. A new game opens as soon as I put my own pick on the record.
				</p>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{games.map((g) => (
						<GameEntry
							key={g._id}
							game={g}
							saved={saved[g._id]}
							creds={creds}
							onSaved={(id, s) => setSaved((prev) => ({ ...prev, [id]: s }))}
							onAuthLost={() => {
								clearCreds()
								setNotice("You were signed out. Sign in again with your recovery key.")
								setCreds(null)
								setPhase("anon")
							}}
						/>
					))}
				</div>
			)}
		</div>
	)
}
