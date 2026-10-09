"use client"

import * as React from "react"
import Image from "next/image"
import Link from "@/components/SiteLink"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import NavMore, { isUnder, type MoreItem } from "@/components/NavMore"
import { ThemeToggle } from "@/components/theme-toggle"
import { LAB_TOOLS } from "@/lib/lab/tools"

/** The pages most visitors come for. Home is the logo on desktop, and a row in the phone menu. */
const mainLinks = [
	{ href: "/games", label: "Game Reports" },
	{ href: "/predictions", label: "Predictions" },
	{ href: "/league", label: "League" },
	{ href: "/rankings", label: "Rankings" },
	{ href: "/lab", label: "Lab" },
	{ href: "/schedule", label: "Schedule" },
]

/** Quieter pages, tucked under "More" so the bar stays short. */
const moreLinks: MoreItem[] = [
	{ href: "/live", label: "Live", hint: "Live-updating threads for games, as they happen." },
	{ href: "/community", label: "Discussion", hint: "Every conversation on the site, in one place." },
	{ href: "https://huntermacias.com", label: "Meet the Maintainer", hint: "Hunter's tech blog, and who builds this site.", external: true },
]

/** The Lab's tools, for the menu under "Lab". The list lives in lib/lab/tools.ts, so a new tool shows up here without touching the header. */
const labItems: MoreItem[] = LAB_TOOLS.map((t) => ({ href: t.href, label: t.isNew ? `${t.title} (new)` : t.title, hint: t.short }))

function NavLink({
	href,
	label,
	external,
	onClick,
}: {
	href: string
	label: string
	external?: boolean
	onClick?: () => void
}) {
	const pathname = usePathname()
	const isActive = !external && (href === "/" ? pathname === "/" : isUnder(href, pathname))

	return (
		<Link
			href={href}
			onClick={onClick}
			target={external ? "_blank" : undefined}
			rel={external ? "noopener noreferrer" : undefined}
			className={
				"text-sm font-medium transition-colors hover:text-foreground " +
				(isActive ? "text-foreground" : "text-muted-foreground")
			}
		>
			{label}
		</Link>
	)
}

function Header() {
	const [open, setOpen] = React.useState(false)

	return (
		<header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			{/* eyebrow strip */}
			<div className="hidden border-b border-border/60 bg-foreground text-background sm:block">
				<div className="container flex h-8 items-center justify-between text-[11px] font-semibold uppercase tracking-widest">
					<span>Lifelong Raider &middot; Every pick graded in public</span>
					<Link href="/league" className="text-background/70 transition-colors hover:text-background">
						Beat the Blogger &rarr;
					</Link>
				</div>
			</div>

			<div className="container flex h-16 items-center justify-between gap-4">
				<Link href="/" className="flex items-center gap-3">
					<Image
						className="rounded-full ring-1 ring-border"
						height={40}
						width={40}
						src="/logo-rr.png"
						alt="Raiders Rundown logo"
						priority
					/>
					<div className="hidden flex-col leading-tight sm:flex">
						<span className="font-serif text-lg font-bold tracking-tight">Raiders Rundown</span>
						<span className="text-[11px] uppercase tracking-widest text-muted-foreground">
							News, Rumors &amp; Analysis
						</span>
					</div>
				</Link>

				<nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
					{mainLinks.map((link) =>
						link.href === "/lab" ? <NavMore key={link.label} label={link.label} labelHref={link.href} items={labItems} /> : <NavLink key={link.label} {...link} />
					)}
					<NavMore items={moreLinks} />
				</nav>

				<div className="flex items-center gap-1">
					<ThemeToggle />

					<Sheet open={open} onOpenChange={setOpen}>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
								<Menu className="h-5 w-5" />
							</Button>
						</SheetTrigger>
						<SheetContent side="right">
							<SheetHeader>
								<SheetTitle className="font-serif">Raiders Rundown</SheetTitle>
							</SheetHeader>
							<nav aria-label="Menu" className="mt-8 flex flex-col gap-5">
								<NavLink href="/" label="Home" onClick={() => setOpen(false)} />
								{mainLinks.map((link) =>
									link.href === "/lab" ? (
										<div key={link.label} className="flex flex-col gap-3">
											<NavLink {...link} onClick={() => setOpen(false)} />
											<ul className="m-0 flex list-none flex-col gap-2.5 border-l border-border/60 p-0 pl-4">
												{labItems.map((item) => (
													<li key={item.href}>
														<NavLink href={item.href} label={item.label} onClick={() => setOpen(false)} />
													</li>
												))}
											</ul>
										</div>
									) : (
										<NavLink key={link.label} {...link} onClick={() => setOpen(false)} />
									)
								)}
								<div className="mt-1 flex flex-col gap-5 border-t border-border/60 pt-5">
									<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">More</p>
									{moreLinks.map((link) => (
										<NavLink key={link.label} href={link.href} label={link.label} external={link.external} onClick={() => setOpen(false)} />
									))}
								</div>
							</nav>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	)
}

export default Header
