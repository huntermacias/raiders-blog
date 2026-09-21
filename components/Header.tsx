"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
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
import { ThemeToggle } from "@/components/theme-toggle"

const navLinks = [
	{ href: "/", label: "Home" },
	//{ href: "/#latest", label: "Latest" },
	{ href: "/games", label: "Game Reports" },
	{ href: "/live", label: "Live" },
	{ href: "/community", label: "Discussion" },
	{ href: "https://huntermacias.com", label: "Meet the Maintainer", external: true },
]

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
	const isActive = !external && href === pathname

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
					<span>Raider Nation, since 2023</span>
					<span className="text-background/70">Silver &amp; Black, every day</span>
				</div>
			</div>

			<div className="container flex h-16 items-center justify-between gap-4">
				<Link href="/" className="flex items-center gap-3">
					<Image
						className="rounded-full ring-1 ring-border"
						height={40}
						width={40}
						src="https://i.pinimg.com/originals/07/e6/4d/07e64d8088fd0ead3d3f15339008eb29.jpg"
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

				<nav className="hidden items-center gap-6 md:flex">
					{navLinks.map((link) => (
						<NavLink key={link.label} {...link} />
					))}
				</nav>

				<div className="flex items-center gap-1">
					<ThemeToggle />

					<Sheet open={open} onOpenChange={setOpen}>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
								<Menu className="h-5 w-5" />
							</Button>
						</SheetTrigger>
						<SheetContent side="right">
							<SheetHeader>
								<SheetTitle className="font-serif">Raiders Rundown</SheetTitle>
							</SheetHeader>
							<nav className="mt-8 flex flex-col gap-6">
								{navLinks.map((link) => (
									<NavLink key={link.label} {...link} onClick={() => setOpen(false)} />
								))}
							</nav>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	)
}

export default Header
