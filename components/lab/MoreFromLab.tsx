import Link from "@/components/SiteLink"
import { Badges } from "@/components/lab/LabToolCard"
import { LAB_TOOLS, type LabWeeks, otherTools, toolBadges } from "@/lib/lab/tools"

/**
 * The strip at the bottom of a Lab page that points to the other tools, so a reader can hop between them without going back to
 * the hub. `current` is the page's path; that tool is left out. `weeks` adds the "Week 5" tags the hub shows.
 */
export default function MoreFromLab({ current, weeks }: { current?: string; weeks?: LabWeeks }) {
	const tools = otherTools(current)
	if (!tools.length) return null
	return (
		<section className="border-t border-lab-line" aria-labelledby="more-lab-heading">
			<div className="container py-10 sm:py-12">
				<div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
					<h2 id="more-lab-heading" className="m-0 font-serif text-2xl font-bold tracking-tight">
						More from the Lab
					</h2>
					<Link href="/lab" className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
						All {LAB_TOOLS.length} tools &rarr;
					</Link>
				</div>
				<ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
					{tools.map((t) => (
						<li key={t.id}>
							<Link href={t.href} className="group block h-full rounded-xl border border-lab-line bg-lab-surface px-4 py-3 transition hover:border-lab-line-strong hover:bg-lab-tint">
								<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
									<span className="font-serif text-base font-bold">{t.title}</span>
									{weeks ? <Badges badges={toolBadges(t, weeks)} /> : t.isNew ? <Badges badges={["New"]} /> : null}
								</span>
								<span className="mt-1 block text-sm leading-snug text-lab-soft">{t.short}</span>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
