"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Link2, X as XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

// Not a full CMS screen -- a fast, one-handed way to post short timestamped
// updates during a live game/draft/event, without going through Sanity
// Studio's full article editor. This lives outside /studio (which has
// Sanity's own login) so it gates itself with a shared secret instead --
// see LIVE_POST_SECRET in pages/api/liveEvent.ts. That secret never touches
// the client bundle: it's only ever sent as a header, and the API route is
// what actually checks it.
//
// Design-wise this is deliberately built to look like a broadcast control
// room rather than a bare admin form -- Hunter is the only person who uses
// it, but he's the one looking at it every game day, and it doubles as a
// "here's how this is actually run" flex when other people see it over his
// shoulder.
const SECRET_STORAGE_KEY = "raiders-rundown:live-post-secret"

type EventSummary = LiveEvent & { _id: string }

function timeAgo(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime()
	const mins = Math.round(diffMs / 60000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins}m ago`
	const hours = Math.round(mins / 60)
	if (hours < 24) return `${hours}h ago`
	return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function clockTime(d: Date): string {
	return d.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		timeZone: "America/Los_Angeles",
	})
}

function elapsed(sinceIso: string, now: Date): string {
	const secs = Math.max(0, Math.floor((now.getTime() - new Date(sinceIso).getTime()) / 1000))
	const h = Math.floor(secs / 3600)
	const m = Math.floor((secs % 3600) / 60)
	const s = secs % 60
	const pad = (n: number) => n.toString().padStart(2, "0")
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function detectEmbedKind(raw: string): "x" | "youtube" | "unknown" | null {
	const url = raw.trim()
	if (!url) return null
	try {
		const host = new URL(url).hostname
		if (host.endsWith("x.com") || host.endsWith("twitter.com")) return "x"
		if (host.endsWith("youtube.com") || host.endsWith("youtu.be")) return "youtube"
		return "unknown"
	} catch {
		return "unknown"
	}
}

function StatusDot({ status }: { status: LiveEvent["status"] }) {
	if (status === "live") {
		return (
			<span className="relative inline-flex h-2 w-2">
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
				<span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
			</span>
		)
	}
	if (status === "final") {
		return <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
	}
	return <span className="inline-flex h-2 w-2 rounded-full bg-zinc-500" />
}

export default function LivePostPage() {
	const [secret, setSecret] = useState<string | null>(null)
	const [secretInput, setSecretInput] = useState("")
	const [authError, setAuthError] = useState<string | null>(null)

	const [events, setEvents] = useState<EventSummary[]>([])
	const [loading, setLoading] = useState(false)
	const [selectedId, setSelectedId] = useState<string | null>(null)

	const [newTitle, setNewTitle] = useState("")
	const [creating, setCreating] = useState(false)

	const [draft, setDraft] = useState("")
	const [posting, setPosting] = useState(false)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const [showLink, setShowLink] = useState(false)
	const [embedUrl, setEmbedUrl] = useState("")
	const embedKind = detectEmbedKind(embedUrl)

	// Ticking clock + elapsed timers. Starts null so the server-rendered
	// shell and the first client render match exactly (a real timestamp
	// would differ between them and trip a hydration warning) -- it fills
	// in a tick after mount, same pattern used for GamePoll's localStorage
	// read elsewhere in this codebase.
	const [now, setNow] = useState<Date | null>(null)
	useEffect(() => {
		setNow(new Date())
		const id = setInterval(() => setNow(new Date()), 1000)
		return () => clearInterval(id)
	}, [])

	useEffect(() => {
		try {
			const stored = window.sessionStorage.getItem(SECRET_STORAGE_KEY)
			if (stored) setSecret(stored)
		} catch {
			// ignore -- storage may be unavailable
		}
	}, [])

	async function callApi(action: string, extra: Record<string, unknown> = {}) {
		if (!secret) throw new Error("Locked")
		const res = await fetch("/api/liveEvent", {
			method: "POST",
			headers: { "x-live-secret": secret },
			body: JSON.stringify({ action, ...extra }),
		})
		if (!res.ok) {
			const errorBody = await res.json().catch(() => ({}))
			throw new Error(errorBody.message || `Request failed (${res.status})`)
		}
		return res.json()
	}

	async function loadEvents(withSecret: string) {
		setLoading(true)
		try {
			const res = await fetch("/api/liveEvent", { headers: { "x-live-secret": withSecret } })
			if (!res.ok) {
				if (res.status === 401) {
					setAuthError("That code didn't work.")
					setSecret(null)
					try {
						window.sessionStorage.removeItem(SECRET_STORAGE_KEY)
					} catch {}
				}
				return
			}
			const data = await res.json()
			setEvents(data.events ?? [])
			setAuthError(null)
			if (!selectedId && data.events?.length) {
				const firstLive = data.events.find((e: EventSummary) => e.status === "live")
				setSelectedId((firstLive ?? data.events[0])._id)
			}
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (secret) loadEvents(secret)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [secret])

	function unlock() {
		if (!secretInput.trim()) return
		try {
			window.sessionStorage.setItem(SECRET_STORAGE_KEY, secretInput.trim())
		} catch {}
		setSecret(secretInput.trim())
	}

	async function createEvent() {
		if (!newTitle.trim() || creating) return
		setCreating(true)
		try {
			const { event } = await callApi("createEvent", { title: newTitle.trim() })
			setEvents((prev) => [event, ...prev])
			setSelectedId(event._id)
			setNewTitle("")
		} catch (err: any) {
			alert(err.message ?? "Could not create event")
		} finally {
			setCreating(false)
		}
	}

	async function setStatus(eventId: string, status: "upcoming" | "live" | "final") {
		try {
			await callApi("setStatus", { eventId, status })
			setEvents((prev) => prev.map((e) => (e._id === eventId ? { ...e, status } : e)))
		} catch (err: any) {
			alert(err.message ?? "Could not update status")
		}
	}

	async function postUpdate() {
		const body = draft.trim()
		if (!body || !selectedId || posting) return
		setPosting(true)
		try {
			const { event } = await callApi("postUpdate", {
				eventId: selectedId,
				body,
				embedUrl: embedUrl.trim() || undefined,
			})
			setEvents((prev) => prev.map((e) => (e._id === selectedId ? event : e)))
			setDraft("")
			setEmbedUrl("")
			setShowLink(false)
			textareaRef.current?.focus()
		} catch (err: any) {
			alert(err.message ?? "Could not post update")
		} finally {
			setPosting(false)
		}
	}

	// ---------------------------------------------------------------------
	// Locked screen
	// ---------------------------------------------------------------------
	if (!secret) {
		return (
			<main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08090b] p-6">
				<Ambient />
				<div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_0_60px_-15px_rgba(220,38,38,0.35)] backdrop-blur-xl">
					<div className="mb-6 flex flex-col items-center gap-3 text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-gradient-to-b from-white/10 to-transparent">
							<span className="relative inline-flex h-2.5 w-2.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
								<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
							</span>
						</div>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Raiders Rundown</p>
							<h1 className="font-serif text-xl font-bold text-white">Live Control</h1>
						</div>
					</div>
					<div className="space-y-3">
						<Input
							type="password"
							placeholder="Access code"
							value={secretInput}
							onChange={(e) => setSecretInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && unlock()}
							autoFocus
							className="border-white/10 bg-black/40 text-white placeholder:text-zinc-600 focus-visible:ring-red-500"
						/>
						{authError && <p className="text-sm text-red-400">{authError}</p>}
						<Button
							className="w-full bg-gradient-to-b from-red-600 to-red-700 text-white shadow-lg shadow-red-950/50 hover:from-red-500 hover:to-red-600"
							onClick={unlock}
						>
							Unlock
						</Button>
					</div>
				</div>
			</main>
		)
	}

	const selected = events.find((e) => e._id === selectedId)

	// ---------------------------------------------------------------------
	// Console
	// ---------------------------------------------------------------------
	return (
		<main className="relative min-h-screen overflow-hidden bg-[#08090b] text-zinc-100">
			<Ambient />

			<div className="relative mx-auto max-w-2xl px-4 py-6 sm:py-10">
				{/* Console header */}
				<div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Raiders Rundown</p>
						<h1 className="font-serif text-2xl font-bold tracking-tight text-white">Live Control</h1>
					</div>
					<div className="text-right">
						<div className="flex items-center justify-end gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-red-500">
							<span className="relative inline-flex h-1.5 w-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
								<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
							</span>
							On air
						</div>
						<p className="font-mono text-sm tabular-nums text-zinc-400">{now ? clockTime(now) : "--:--:--"} PT</p>
					</div>
				</div>

				{/* New event */}
				<div className="mb-4 flex gap-2">
					<Input
						placeholder='New event, e.g. "Live: Raiders vs Broncos"'
						value={newTitle}
						onChange={(e) => setNewTitle(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && createEvent()}
						className="border-white/10 bg-white/[0.03] text-white placeholder:text-zinc-600 focus-visible:ring-red-500"
					/>
					<Button
						onClick={createEvent}
						disabled={creating || !newTitle.trim()}
						className="shrink-0 bg-white text-black hover:bg-zinc-200"
					>
						{creating ? "Starting..." : "Go Live"}
					</Button>
				</div>

				{/* Event picker */}
				{loading && events.length === 0 ? (
					<p className="text-sm text-zinc-500">Loading events...</p>
				) : (
					<div className="mb-6 flex flex-wrap gap-2">
						{events.map((e) => (
							<button
								key={e._id}
								onClick={() => setSelectedId(e._id)}
								className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
									e._id === selectedId
										? "border-white/20 bg-white/10 text-white shadow-[0_0_20px_-5px_rgba(255,255,255,0.15)]"
										: "border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200"
								}`}
							>
								<StatusDot status={e.status} />
								{e.title}
							</button>
						))}
						{events.length === 0 && !loading && (
							<p className="text-sm text-zinc-600">No events yet -- start one above.</p>
						)}
					</div>
				)}

				{selected && (
					<div className="space-y-5">
						{/* Event header + status segmented control */}
						<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
							<div>
								<p className="font-serif text-lg font-semibold text-white">{selected.title}</p>
								{selected.status === "live" && selected.startedAt && now && (
									<p className="font-mono text-xs tabular-nums text-red-400">
										LIVE &middot; {elapsed(selected.startedAt, now)}
									</p>
								)}
								{selected.status !== "live" && (
									<p className="text-xs capitalize text-zinc-500">{selected.status}</p>
								)}
							</div>
							<div className="flex overflow-hidden rounded-lg border border-white/10">
								{(["upcoming", "live", "final"] as const).map((s) => (
									<button
										key={s}
										onClick={() => setStatus(selected._id, s)}
										className={`px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
											selected.status === s
												? s === "live"
													? "bg-red-600 text-white"
													: "bg-white text-black"
												: "bg-transparent text-zinc-500 hover:bg-white/5"
										}`}
									>
										{s}
									</button>
								))}
							</div>
						</div>

						{/* Composer */}
						<div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 shadow-[0_0_40px_-20px_rgba(220,38,38,0.4)] transition-shadow focus-within:shadow-[0_0_40px_-15px_rgba(220,38,38,0.6)]">
							<Textarea
								ref={textareaRef}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => {
									if ((e.metaKey || e.ctrlKey) && e.key === "Enter") postUpdate()
								}}
								placeholder="What's happening..."
								rows={3}
								className="border-0 bg-transparent p-0 text-base text-white placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0"
								autoFocus
							/>
							{showLink && (
								<div className="mt-3 border-t border-white/5 pt-3">
									<div className="flex items-center gap-2">
										<Input
											autoFocus
											placeholder="Paste an X or YouTube link..."
											value={embedUrl}
											onChange={(e) => setEmbedUrl(e.target.value)}
											className="border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-600 focus-visible:ring-red-500"
										/>
										<button
											onClick={() => {
												setShowLink(false)
												setEmbedUrl("")
											}}
											className="shrink-0 rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
											aria-label="Remove attached link"
										>
											<XIcon className="h-4 w-4" />
										</button>
									</div>
									{embedKind === "x" && (
										<p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-400">
											<CheckCircle2 className="h-3 w-3" /> Will embed as an X post
										</p>
									)}
									{embedKind === "youtube" && (
										<p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-400">
											<CheckCircle2 className="h-3 w-3" /> Will embed as a YouTube video
										</p>
									)}
									{embedKind === "unknown" && (
										<p className="mt-1.5 text-[11px] text-amber-500">
											Only X and YouTube links render as embeds -- other links won&apos;t show a preview.
										</p>
									)}
								</div>
							)}

							<div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2">
								<div className="flex items-center gap-3">
									<span className="font-mono text-[11px] text-zinc-600">
										{draft.length > 0 ? `${draft.length} chars · ` : ""}
										⌘/Ctrl + Enter
									</span>
									{!showLink && (
										<button
											onClick={() => setShowLink(true)}
											className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
										>
											<Link2 className="h-3 w-3" /> Attach link
										</button>
									)}
								</div>
								<Button
									onClick={postUpdate}
									disabled={posting || !draft.trim()}
									className="bg-gradient-to-b from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600 active:scale-95"
								>
									{posting ? "Posting..." : "Post"}
								</Button>
							</div>
						</div>

						{/* Feed */}
						<div className="space-y-2">
							{selected.updates?.length ? (
								[...selected.updates]
									.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
									.map((u) => (
										<div
											key={u._key}
											className="live-update-enter rounded-lg border-l-2 border-red-600/60 bg-white/[0.02] px-3.5 py-2.5"
										>
											<p className="whitespace-pre-wrap text-sm text-zinc-100">{u.body}</p>
											<div className="mt-1 flex items-center gap-2">
												<p className="font-mono text-[11px] uppercase tracking-wide text-zinc-600">
													{timeAgo(u.postedAt)}
												</p>
												{u.embedUrl && (
													<span className="flex items-center gap-1 text-[11px] text-zinc-500">
														<Link2 className="h-3 w-3" /> link attached
													</span>
												)}
											</div>
										</div>
									))
							) : (
								<p className="text-sm text-zinc-600">No updates yet -- post the first one above.</p>
							)}
						</div>
					</div>
				)}
			</div>

			<style jsx global>{`
				@keyframes liveUpdateEnter {
					from {
						opacity: 0;
						transform: translateY(-6px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				.live-update-enter {
					animation: liveUpdateEnter 0.35s ease-out;
				}
			`}</style>
		</main>
	)
}

// Soft, slow-breathing radial glows behind the console -- purely
// decorative, pointer-events disabled so they never intercept clicks.
function Ambient() {
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			<div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-red-700/20 blur-[120px]" />
			<div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-zinc-500/10 blur-[120px]" />
			<div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.4))]" />
		</div>
	)
}
