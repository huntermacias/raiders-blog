import { updatedText } from "@/lib/lab/unitsKit"

/** How often each kind of Lab data is rebuilt, in words a reader can use. Keep in step with the workflows in .github/workflows. */
const KINDS = {
	/** units.json and scouting.json: units.yml (Sunday to Wednesday every 2 hours, Thursday to Saturday three times a day). */
	grades: { what: "Grades updated", note: "Rechecked every few hours on game days" },
	/** schedule.json (and rooting.json): rooting.yml, a few hours after games end. */
	results: { what: "Standings updated", note: "Refreshed a few hours after games end" },
	/** rooting.json. */
	odds: { what: "Odds rebuilt", note: "Refreshed a few hours after games end" },
	/** season.json, clips.json: lab-data.yml, Monday and Tuesday. */
	replays: { what: "Replays rebuilt", note: "Rebuilt every Monday" },
} as const

export type StampKind = keyof typeof KINDS

/**
 * "Grades updated Sun, Oct 11, 4:35 PM ET": when the numbers on the page last changed, and how often they are rechecked.
 * The time is when the numbers last changed (a recheck that finds nothing new changes nothing), in the NFL's own time zone so
 * every reader sees the same thing. Renders nothing when the date is missing or unreadable.
 */
export default function UpdatedStamp({ at, kind, what, note, className = "" }: { at: string | undefined | null; kind: StampKind; what?: string; note?: string | null; className?: string }) {
	const text = at ? updatedText(at) : ""
	if (!text || !at) return null
	const k = KINDS[kind]
	const extra = note === undefined ? k.note : note
	return (
		<p className={`m-0 flex flex-col gap-x-2 gap-y-0.5 text-xs text-lab-muted sm:flex-row sm:flex-wrap sm:items-center ${className}`} data-testid="updated-stamp">
			<span className="inline-flex items-center gap-2">
				<span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-lab-muted" />
				<span>
					{what ?? k.what} <time dateTime={at} className="font-semibold text-lab-soft">{text}</time>
				</span>
			</span>
			{extra ? <span className="pl-3.5 sm:pl-0 sm:before:mr-2 sm:before:content-['·']">{extra}</span> : null}
		</p>
	)
}
