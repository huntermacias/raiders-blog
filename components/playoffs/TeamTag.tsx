import { teamByAbbr } from "@/lib/nfl"

/** A team's color and abbreviation. The abbreviation carries the identity, so the color is only decoration. */
export default function TeamTag({ id, nick = false, className = "" }: { id: string; nick?: boolean; className?: string }) {
	const info = teamByAbbr(id)
	return (
		<span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
			<span className="block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-lab-page" style={{ background: info.color }} aria-hidden="true" />
			<span className="font-bold">{nick ? info.nick : id}</span>
		</span>
	)
}
