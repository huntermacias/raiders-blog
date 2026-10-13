"use client"

import * as React from "react"
import { Link2, Share2 } from "lucide-react"

import ShareCard, { type ShareVariant } from "@/components/lab/ShareCard"
import { trackPlayers } from "@/lib/lab/track"

const SITE_URL = "https://www.raidersrundown.com"

/**
 * The share section of a comparison: the actual graphic that will be posted (head to head, radar or one player's case), a choice between
 * them, and the ways to send it. The graphic and the link both carry the comparison exactly as configured, so whoever opens it sees the
 * same players, stretch of games and stats.
 */
export default function CompareShare({
	query,
	stamp,
	text,
	a,
	b,
	group,
	variants,
}: {
	/** The comparison's address after "?": players, range, stats. */
	query: string
	stamp: number
	text: string
	a: { slug: string; name: string }
	b: { slug: string; name: string }
	group: string
	variants: ShareVariant[]
}) {
	const [variantId, setVariantId] = React.useState(variants[0]?.id ?? "h2h")
	const [note, setNote] = React.useState("")
	const variant = variants.find((v) => v.id === variantId) ?? variants[0]
	const src = `/api/og?type=compare&${query}&${variant.params}&size=wide&v=${stamp}`
	const [loaded, setLoaded] = React.useState("")

	const copyLink = async () => {
		const url = `${window.location.origin}/lab/players/compare?${query}`
		try {
			await navigator.clipboard.writeText(url)
			setNote("Link copied")
			trackPlayers("player_compare_share", { a: a.slug, b: b.slug, group, method: "copy_link", format: variant.id })
		} catch {
			window.prompt("Copy this link", url)
		}
		window.setTimeout(() => setNote(""), 2400)
	}

	const postOnX = () => {
		const url = `${SITE_URL}/lab/players/compare?${query}&utm_source=x&utm_medium=social&utm_campaign=compare_share`
		trackPlayers("player_compare_share", { a: a.slug, b: b.slug, group, method: "x", format: variant.id })
		window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer")
	}

	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center" data-testid="compare-share">
			<div>
				<div role="group" aria-label="Which graphic" className="mb-3 flex flex-wrap gap-2">
					{variants.map((v) => (
						<button
							key={v.id}
							type="button"
							aria-pressed={variant.id === v.id}
							onClick={() => setVariantId(v.id)}
							title={v.hint}
							className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${variant.id === v.id ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-soft hover:bg-lab-hover hover:text-lab-ink"}`}
						>
							{v.name}
						</button>
					))}
				</div>
				<div className="relative overflow-hidden rounded-2xl border border-lab-line bg-lab-tint shadow-[var(--lab-shadow)]" style={{ aspectRatio: "1200 / 630" }}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img key={src} src={src} alt={variant.alt ?? variant.name} width={1200} height={630} loading="lazy" decoding="async" onLoad={() => setLoaded(src)} className={`block h-full w-full object-contain transition-opacity duration-500 ${loaded === src ? "opacity-100" : "opacity-0"}`} />
					{loaded !== src ? <p className="absolute inset-0 m-0 grid place-items-center text-xs text-lab-muted">Drawing the graphic&hellip;</p> : null}
				</div>
				<p className="m-0 mt-2 text-xs text-lab-muted">{variant.hint}</p>
			</div>

			<div>
				<h3 className="m-0 font-serif text-xl font-bold sm:text-2xl">Settle it on X</h3>
				<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">Post the graphic or the link. Either one opens this exact comparison: same players, same games, same stats.</p>
				<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
					<ShareCard
						target={{ type: "compare", query, linkQuery: query, sharePath: "/lab/players/compare", name: `${a.name} vs ${b.name}`, file: `raiders-rundown-${a.slug}-vs-${b.slug}`, campaign: "compare_share" }}
						variants={variants}
						variantId={variantId}
						onVariant={setVariantId}
						hd
						stamp={stamp}
						text={text}
						alt={`${a.name} compared with ${b.name}`}
						label="Save or share the graphic"
						className="w-full justify-center !rounded-lg !border-lab-ink !bg-lab-ink !py-3 !text-lab-page hover:!opacity-90"
						footnote="On X the link opens as a preview card. To post the picture itself, save it and attach it."
						onOpen={() => trackPlayers("player_compare_share_open", { a: a.slug, b: b.slug, group })}
						onAction={(method) => trackPlayers("player_compare_share", { a: a.slug, b: b.slug, group, method, format: variant.id })}
					/>
					<button type="button" onClick={postOnX} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line-strong bg-lab-surface px-4 py-2 text-sm font-semibold text-lab-ink transition hover:bg-lab-hover">
						<Share2 className="h-4 w-4" aria-hidden />
						Post the link on X
					</button>
					<button type="button" onClick={copyLink} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-lab-line-strong bg-lab-surface px-4 py-2 text-sm font-semibold text-lab-ink transition hover:bg-lab-hover">
						<Link2 className="h-4 w-4" aria-hidden />
						Copy the link
					</button>
				</div>
				<p className="m-0 mt-2 min-h-[1.25rem] text-xs font-semibold text-lab-soft" role="status" aria-live="polite">
					{note}
				</p>
			</div>
		</div>
	)
}
