import Link from "@/components/SiteLink"

import { SignOutButton } from "@/components/league/account/AccountPanel"
import { MODE_NAME, MODE_PATH, type NflMode } from "@/lib/league2/competitions"
import { cn } from "@/lib/utils"

export const btnLight = "inline-flex h-11 items-center justify-center rounded-lg bg-zinc-50 px-5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
export const btnGhost = "inline-flex h-11 items-center justify-center rounded-lg border border-zinc-700 px-5 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"

const SHORT: Record<NflMode, string> = { winners: "Winners", confidence: "Confidence", upset: "Upsets" }

export function AccountBar({ handle, email }: { handle: string | null; email: string | null }) {
	if (!email && !handle) return null
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">
				Signed in as <span className="font-semibold text-foreground">{handle ?? email}</span>
			</p>
			<nav aria-label="Account" className="flex flex-wrap items-center gap-2">
				<Link href="/league" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
					Beat the Blogger
				</Link>
				<Link href="/league/account" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
					Account
				</Link>
				<SignOutButton />
			</nav>
		</div>
	)
}

/** Switch between the three NFL formats. Only the formats an admin has switched on are listed. */
export function ModeNav({ current, open, week }: { current: NflMode; open: Record<NflMode, boolean>; week?: number }) {
	const modes = (Object.keys(MODE_PATH) as NflMode[]).filter((m) => open[m] || m === current)
	if (modes.length < 2) return null
	return (
		<nav aria-label="NFL game formats" className="mb-4 flex flex-wrap gap-1.5">
			{modes.map((m) => (
				<Link key={m} href={week && m !== current ? `${MODE_PATH[m]}?week=${week}` : MODE_PATH[m]} aria-current={m === current ? "page" : undefined} title={MODE_NAME[m]} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", m === current ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70")}>
					{SHORT[m]}
				</Link>
			))}
		</nav>
	)
}

export function WeekNav({ mode, weeks, week }: { mode: NflMode; weeks: number[]; week: number }) {
	if (weeks.length < 2) return null
	return (
		<nav aria-label="Choose a week" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
			{weeks.map((w) => (
				<Link key={w} href={`${MODE_PATH[mode]}?week=${w}`} scroll={false} aria-current={w === week ? "page" : undefined} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", w === week ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70")}>
					{w}
				</Link>
			))}
		</nav>
	)
}

/** The dark hero panel every NFL format opens with. `side` is the stat tiles or the how-it-works list. */
export function Hero({ id, kicker, title, lead, actions, side }: { id: string; kicker: string; title: string; lead: React.ReactNode; actions: React.ReactNode; side: React.ReactNode }) {
	return (
		<section aria-labelledby={id} className="relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-xl">
			<div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 100% 0%, rgba(161,161,170,0.14) 0%, rgba(9,9,11,0) 60%)" }} />
			<div className="relative grid gap-8 p-6 md:grid-cols-[1.4fr_1fr] md:p-10">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{kicker}</p>
					<h1 id={id} className="mt-2 font-serif text-3xl font-bold leading-[1.08] tracking-tight md:text-5xl">
						{title}
					</h1>
					<p className="mt-3 max-w-xl text-lg text-zinc-300">{lead}</p>
					<div className="mt-6 flex flex-wrap gap-3">{actions}</div>
				</div>
				<div>{side}</div>
			</div>
		</section>
	)
}

export function Tiles({ items }: { items: [string, string, string][] }) {
	return (
		<dl className="grid grid-cols-2 gap-3">
			{items.map(([k, v, f]) => (
				<div key={k} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
					<dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{k}</dt>
					<dd className="mt-1 font-serif text-3xl font-bold tabular-nums">{v}</dd>
					<p className="text-xs text-zinc-500">{f}</p>
				</div>
			))}
		</dl>
	)
}

export function HowItWorks({ steps }: { steps: string[] }) {
	return (
		<>
			<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">How it works</p>
			<ul className="grid gap-2 text-sm text-zinc-300">
				{steps.map((t) => (
					<li key={t} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
						{t}
					</li>
				))}
			</ul>
		</>
	)
}

export function GuestActions() {
	return (
		<>
			<Link href="/league/register" className={btnLight}>
				Create a free account
			</Link>
			<Link href="/league/sign-in" className={btnGhost}>
				Sign in
			</Link>
		</>
	)
}

export function SetupNotice() {
	return (
		<p role="status" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
			Your account is almost ready.{" "}
			<Link href="/league/verified" className="font-semibold underline underline-offset-4">
				Finish setting up your handle
			</Link>{" "}
			to start picking.
		</p>
	)
}

export function Champions({ champions, unit }: { champions: { week: number; handles: string[]; points: number }[]; unit: string }) {
	if (champions.length === 0) return null
	return (
		<section aria-labelledby="champs-h" className="mt-12">
			<h2 id="champs-h" className="mb-4 font-serif text-2xl font-bold tracking-tight md:text-3xl">
				Weekly champions
			</h2>
			<ul className="grid gap-3 sm:grid-cols-3">
				{champions.map((c) => (
					<li key={c.week} className="rounded-xl border border-border bg-card p-4 shadow-sm">
						<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Week {c.week}</p>
						<p className="mt-1 font-serif text-xl font-bold">
							{c.handles.slice(0, 3).map((h, i) => (
								<span key={h}>
									{i > 0 && ", "}
									<Link href={`/league/${h}`} className="underline-offset-4 hover:underline">
										{h}
									</Link>
								</span>
							))}
							{c.handles.length > 3 && ` +${c.handles.length - 3}`}
						</p>
						<p className="text-sm text-muted-foreground">
							{c.points} {unit}
							{c.handles.length > 1 ? ", shared title" : ""}
						</p>
					</li>
				))}
			</ul>
		</section>
	)
}
