"use client"

import * as React from "react"
import { Check, Download, Image as ImageIcon, Link2, Share2, X as CloseIcon } from "lucide-react"

import { KIND_NAMES, SHARE_PATH, SIZE_PIXELS, type ShareKind, type ShareSize, type ShareView, viewQuery } from "@/lib/lab/lastShare"

const SITE_URL = "https://www.raidersrundown.com"

const SIZE_CHOICES: { id: ShareSize; name: string; where: string }[] = [
	{
		id: "wide",
		name: "Wide",
		where: "Link previews on X, Facebook, iMessage, Slack",
	},
	{
		id: "tall",
		name: "Tall",
		where: "Posting the picture: Instagram, X in the feed, phones",
	},
]

/** What a card is of when it is not a "Will it last?" card: the route's `type`, the link's query (without the size), where a shared link lands, and the words for it. */
export type ShareTarget = { type: string; query: string; sharePath: string; name: string; file: string }

type Props = {
	/** The part of the "Will it last?" page the card is of. Leave out when `target` says what it is of. */
	kind?: ShareKind
	/** What the card shows: the stat, the filters, the pinned team, how the dots are laid out. */
	view?: Partial<ShareView>
	target?: ShareTarget
	/** Changes when the data does, so a new card is fetched. */
	stamp: number
	/** The words that go with a post. */
	text: string
	/** What the card is of, for the picture's alt text and file name. */
	alt: string
	/** The button's words; defaults to "Share". */
	label?: string
	className?: string
	/** Called when the reader sends the card somewhere, with how. Lets a page count shares without the window knowing about its analytics. */
	onAction?: (method: "share" | "save" | "copy_image" | "copy_link" | "x" | "facebook") => void
}

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A Share button for one part of the page. It opens a window with the card for that part, a choice of a wide
 * picture (what link previews use) or a tall one (what you post as a picture), and the ways to send it: the
 * phone's own share sheet, save, copy the image, copy the link, X and Facebook. The link carries the chart's
 * stat, filters and pinned team, so whoever opens it sees the same chart.
 */
export default function ShareCard({ kind, view = {}, target, stamp, text, alt, label = "Share", className = "", onAction }: Props) {
	const [open, setOpen] = React.useState(false)
	const [size, setSize] = React.useState<ShareSize>("wide")
	const [note, setNote] = React.useState("")
	const [canShare, setCanShare] = React.useState(false)
	const [canCopyImage, setCanCopyImage] = React.useState(false)
	// What has loaded or failed is remembered by the picture's address, so a picture the browser already had cannot be mistaken for one still drawing.
	const [loadedSrc, setLoadedSrc] = React.useState("")
	const [failedKey, setFailedKey] = React.useState("")
	const [attempt, setAttempt] = React.useState(0)
	const trigger = React.useRef<HTMLButtonElement>(null)
	const panel = React.useRef<HTMLDivElement>(null)
	const closeRef = React.useRef<HTMLButtonElement>(null)
	const titleId = React.useId()

	React.useEffect(() => {
		setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
		setCanCopyImage(typeof window !== "undefined" && typeof window.ClipboardItem !== "undefined" && !!navigator.clipboard?.write)
	}, [])

	const close = React.useCallback(() => {
		setOpen(false)
		setNote("")
		trigger.current?.focus()
	}, [])

	React.useEffect(() => {
		if (!open) return
		closeRef.current?.focus()
		const prev = document.body.style.overflow
		document.body.style.overflow = "hidden"
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault()
				close()
				return
			}
			if (e.key !== "Tab" || !panel.current) return
			const items = Array.from(panel.current.querySelectorAll<HTMLElement>(focusable))
			if (!items.length) return
			const first = items[0]
			const last = items[items.length - 1]
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault()
				last.focus()
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault()
				first.focus()
			}
		}
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("keydown", onKey)
			document.body.style.overflow = prev
		}
	}, [open, close])

	

	const t: ShareTarget = target ?? {
		type: "last",
		query: viewQuery(view, { kind: kind ?? "chart" }),
		sharePath: SHARE_PATH,
		name: KIND_NAMES[kind ?? "chart"],
		file: `raiders-will-it-last-${kind ?? "chart"}${view.stat ? `-${view.stat.replace(".", "-")}` : ""}`,
	}
	const query = t.query
	const src = `/api/og?type=${t.type}${query ? `&${query}` : ""}&size=${size}&v=${stamp}`
	const shown = attempt ? `${src}&retry=${attempt}` : src
	const loaded = loadedSrc === shown
	const failed = failedKey === shown
	const filename = `${t.file}-${size}.png`
	const px = SIZE_PIXELS[size]
	// The query, then any tracking parameters, joined with "&"; nothing to carry means no "?".
	const linkFor = (origin: string, utm = "") => {
		const qs = [query, utm.replace(/^&/, "")].filter(Boolean).join("&")
		return `${origin}${t.sharePath}${qs ? `?${qs}` : ""}`
	}

	const say = (s: string) => {
		setNote(s)
		window.setTimeout(() => setNote((cur) => (cur === s ? "" : cur)), 2400)
	}

	const copyLink = async () => {
		const url = linkFor(window.location.origin)
		try {
			await navigator.clipboard.writeText(url)
			say("Link copied")
			onAction?.("copy_link")
		} catch {
			window.prompt("Copy this link", url)
		}
	}

	const copyImage = async () => {
		try {
			const blob = await (await fetch(src)).blob()
			await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })])
			say("Image copied")
			onAction?.("copy_image")
		} catch {
			say("Could not copy the image. Use Save image instead.")
		}
	}

	const nativeShare = async () => {
		const url = linkFor(SITE_URL, "&utm_source=share&utm_medium=social&utm_campaign=lab_share")
		try {
			const blob = await (await fetch(src)).blob()
			const file = new File([blob], filename, { type: "image/png" })
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({ files: [file], text: `${text} ${url}` })
				onAction?.("share")
				return
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === "AbortError") return
		}
		try {
			await navigator.share({ text, url })
			onAction?.("share")
		} catch {
			/* the reader closed the share sheet */
		}
	}

	const postOnX = () => {
		const url = linkFor(SITE_URL, "&utm_source=x&utm_medium=social&utm_campaign=lab_share")
		onAction?.("x")
		window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer")
	}

	const postOnFacebook = () => {
		const url = linkFor(SITE_URL, "&utm_source=facebook&utm_medium=social&utm_campaign=lab_share")
		onAction?.("facebook")
		window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer")
	}

	const action = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line-strong bg-lab-surface px-4 py-2 text-sm font-semibold text-lab-ink transition hover:bg-lab-hover"

	return (
		<>
			<button
				ref={trigger}
				type="button"
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-label={`${label}: ${t.name}`}
				className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border border-lab-line-strong bg-lab-surface px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-lab-ink transition hover:bg-lab-hover ${className}`}
			>
				<Share2 className="h-4 w-4" aria-hidden />
				{label}
			</button>
			{open ? (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
					<div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lab flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-lab-line bg-lab-page text-lab-ink shadow-[var(--lab-shadow)] sm:max-h-[92dvh] sm:rounded-2xl">
						<div className="flex items-center justify-between gap-3 border-b border-lab-line px-4 py-3 sm:px-5">
							<h2 id={titleId} className="m-0 font-serif text-lg font-bold">
								Share: {t.name}
							</h2>
							<button ref={closeRef} type="button" onClick={close} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
								<CloseIcon className="h-4 w-4" aria-hidden />
							</button>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
							<div role="group" aria-label="Picture size" className="grid gap-2 sm:grid-cols-2">
								{SIZE_CHOICES.map((c) => (
									<button key={c.id} type="button" aria-pressed={size === c.id} onClick={() => setSize(c.id)} className={`rounded-xl border px-4 py-2.5 text-left transition ${size === c.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}>
										<span className="block text-sm font-bold">
											{c.name}{" "}
											<span className="font-mono text-xs font-medium opacity-80">
												{SIZE_PIXELS[c.id].width}&times;
												{SIZE_PIXELS[c.id].height}
											</span>
										</span>
										<span className={`block text-xs ${size === c.id ? "opacity-80" : "text-lab-muted"}`}>{c.where}</span>
									</button>
								))}
							</div>
							<div className={`mx-auto mt-4 overflow-hidden rounded-xl border border-lab-line bg-lab-tint ${size === "tall" ? "max-w-[22rem]" : "w-full"}`} style={{ aspectRatio: `${px.width} / ${px.height}` }}>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img key={shown} src={shown} alt={alt} width={px.width} height={px.height} decoding="async" onLoad={() => setLoadedSrc(shown)} onError={() => setFailedKey(shown)} className={`block h-full w-full object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`} />
							</div>
							{failed && !loaded ? (
								<p className="m-0 mt-2 text-center text-xs text-lab-soft" role="alert">
									The card did not draw.{" "}
									<button
										type="button"
										onClick={() => setAttempt((n) => n + 1)}
										className="font-semibold underline underline-offset-4"
									>
										Try again
									</button>
								</p>
							) : !loaded ? (
								<p className="m-0 mt-2 text-center text-xs text-lab-muted">Drawing the card&hellip;</p>
							) : null}
						</div>
						<div className="border-t border-lab-line px-4 py-3 sm:px-5">
							<div className="grid gap-2 sm:grid-cols-3">
								{canShare ? (
									<button type="button" onClick={nativeShare} className={`${action} border-lab-ink bg-lab-ink text-lab-page hover:opacity-90`}>
										<Share2 className="h-4 w-4" aria-hidden />
										Share&hellip;
									</button>
								) : null}
								<a href={src} download={filename} onClick={() => onAction?.("save")} className={action}>
									<Download className="h-4 w-4" aria-hidden />
									Save image
								</a>
								{canCopyImage ? (
									<button type="button" onClick={copyImage} className={action}>
										<ImageIcon className="h-4 w-4" aria-hidden />
										Copy image
									</button>
								) : null}
								<button type="button" onClick={copyLink} className={action}>
									{note === "Link copied" ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
									Copy link
								</button>
								<button type="button" onClick={postOnX} className={action}>
									Post on X
								</button>
								<button type="button" onClick={postOnFacebook} className={action}>
									Post on Facebook
								</button>
							</div>
							<p className="m-0 mt-2 min-h-[1.25rem] text-center text-xs font-semibold text-lab-soft" role="status" aria-live="polite">
								{note || "The link opens this same chart, with the same filters."}
							</p>
						</div>
					</div>
				</div>
			) : null}
		</>
	)
}
