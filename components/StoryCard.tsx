import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

/**
 * The site's one story card: the picture fills the whole card and the text
 * sits right on it, over a dark fade at the bottom. Posts, game reports,
 * related stories and the homepage all use this so they look the same.
 * Server component (no hooks), so it works from client lists too.
 */

type Size = "lead" | "card" | "compact"

const SIZE: Record<Size, { box: string; pad: string; title: string }> = {
	lead: { box: "min-h-[26rem]", pad: "p-6 md:p-8", title: "text-2xl md:text-4xl md:leading-[1.1]" },
	card: { box: "min-h-[22rem]", pad: "p-5", title: "text-xl" },
	compact: { box: "min-h-[14rem]", pad: "p-4", title: "text-lg" },
}

export function storyDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Los_Angeles" })
}

/** "Sep 20, 2026 · 5 min read". Dates are Pacific so a Sunday-night post isn't dated Monday. */
export function StoryMeta({ date, minutes, prefix }: { date: string; minutes?: number | null; prefix?: string }) {
	return (
		<p>
			{prefix}
			{storyDate(date)}
			{typeof minutes === "number" && (
				<>
					<span aria-hidden> · </span>
					<span className="inline-flex items-center gap-1 align-middle">
						<Clock aria-hidden className="h-3 w-3" /> {minutes} min read
					</span>
				</>
			)}
		</p>
	)
}

export type StoryCardProps = {
	href: string
	imageUrl: string
	/** CSS object-position from the Studio hotspot. */
	imagePosition?: string
	sizes: string
	size?: Size
	/** Load right away: only for the one image at the top of the page. */
	priority?: boolean
	/** Short labels above the title (categories, "vs Chiefs"). */
	badges?: string[]
	/** Anything pinned to the top-left of the picture, like a W/L result. */
	corner?: ReactNode
	title: string
	description?: string | null
	/** Small print under the title. */
	meta?: ReactNode
	/** Label next to the arrow; empty string hides it. */
	cta?: string
	className?: string
}

export default function StoryCard({
	href,
	imageUrl,
	imagePosition,
	sizes,
	size = "card",
	priority,
	badges = [],
	corner,
	title,
	description,
	meta,
	cta = "Read",
	className,
}: StoryCardProps) {
	const s = SIZE[size]
	return (
		<Link
			href={href}
			className={cn(
				"group relative isolate flex flex-col justify-end overflow-hidden rounded-2xl border border-border bg-[#09090b] shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				s.box,
				className
			)}
		>
			<Image
				src={imageUrl}
				alt=""
				fill
				priority={priority}
				sizes={sizes}
				className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
				style={{ objectPosition: imagePosition }}
			/>
			<div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/0" />
			{corner && <div className="absolute left-3 top-3">{corner}</div>}
			<div className={cn("text-zinc-50", s.pad)}>
				{badges.length > 0 && (
					<div className="mb-3 flex flex-wrap gap-2">
						{badges.map((b) => (
							<Badge key={b} variant="outline" className="border-white/30 bg-black/30 text-zinc-100 backdrop-blur">
								{b}
							</Badge>
						))}
					</div>
				)}
				<h3 className={cn("font-serif font-bold leading-tight tracking-tight group-hover:underline", s.title)}>{title}</h3>
				{description && (
					<p className={cn("mt-3 line-clamp-2 text-zinc-300", size === "lead" ? "max-w-2xl text-sm md:text-base" : "text-sm")}>{description}</p>
				)}
				{(meta || cta) && (
					<div className="mt-4 flex items-center justify-between gap-4 text-xs text-zinc-300">
						<div>{meta}</div>
						{cta && (
							<span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-zinc-50">
								{cta} <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
							</span>
						)}
					</div>
				)}
			</div>
		</Link>
	)
}
