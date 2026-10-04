"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ChevronDown, ExternalLink } from "lucide-react"

import Link from "@/components/SiteLink"
import { cn } from "@/lib/utils"

export type MoreItem = {
	href: string
	label: string
	/** One line under the label, so a short menu still says what each page is. */
	hint: string
	external?: boolean
}

/** Whether `pathname` is this item's page or one under it (a live thread is under /live). */
export function isUnder(href: string, pathname: string | null): boolean {
	if (!pathname || !href.startsWith("/")) return false
	return pathname === href || pathname.startsWith(href + "/")
}

/**
 * A small "More" menu for the pages that get less traffic, so the main bar stays short.
 * A disclosure rather than an ARIA menu: it is a button that shows a list of links, closes on
 * Escape, an outside click, focus leaving it, or choosing a link, and Tab moves through it normally.
 */
export default function NavMore({ items, label = "More" }: { items: MoreItem[]; label?: string }) {
	const pathname = usePathname()
	const [open, setOpen] = React.useState(false)
	const root = React.useRef<HTMLDivElement>(null)
	const button = React.useRef<HTMLButtonElement>(null)
	const panelId = React.useId()
	const active = items.some((i) => !i.external && isUnder(i.href, pathname))

	React.useEffect(() => {
		if (!open) return
		const onPointer = (e: PointerEvent) => {
			if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return
			setOpen(false)
			button.current?.focus()
		}
		document.addEventListener("pointerdown", onPointer)
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("pointerdown", onPointer)
			document.removeEventListener("keydown", onKey)
		}
	}, [open])

	// Close when the page changes.
	React.useEffect(() => setOpen(false), [pathname])

	return (
		<div
			ref={root}
			className="relative"
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
			}}
		>
			<button
				ref={button}
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"inline-flex items-center gap-1 rounded-sm text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					active || open ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{label}
				<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
			</button>

			<div
				id={panelId}
				hidden={!open}
				className="absolute right-0 top-full z-50 mt-3 w-72 origin-top-right rounded-lg border border-border bg-background p-1.5 shadow-lg"
			>
				<ul>
					{items.map((item) => {
						const current = !item.external && isUnder(item.href, pathname)
						return (
							<li key={item.label}>
								<Link
									href={item.href}
									target={item.external ? "_blank" : undefined}
									rel={item.external ? "noopener noreferrer" : undefined}
									aria-current={current ? "page" : undefined}
									onClick={() => setOpen(false)}
									className={cn(
										"block rounded-md px-3 py-2.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
										current && "bg-muted/60"
									)}
								>
									<span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
										{item.label}
										{item.external && <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />}
									</span>
									<span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{item.hint}</span>
								</Link>
							</li>
						)
					})}
				</ul>
			</div>
		</div>
	)
}
