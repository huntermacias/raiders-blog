import type { ReactNode } from "react"

/** One small line icon per profile section, drawn on a 24px grid. Decorative: the label beside it carries the meaning. */
const PATHS: Record<string, ReactNode> = {
	read: (
		<>
			<path d="M5 4.5h11a3 3 0 0 1 3 3V19.5H8a3 3 0 0 1-3-3Z" />
			<path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
		</>
	),
	team: (
		<>
			<path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.3-7 9-4.2-1.7-7-4.8-7-9V6Z" />
			<path d="m9 12 2.2 2.2L15.5 9.8" />
		</>
	),
	stack: (
		<>
			<path d="M5 20V10M10 20V5M15 20v-7M20 20V8" />
		</>
	),
	league: (
		<>
			<circle cx="7" cy="16.5" r="1.6" />
			<circle cx="11.5" cy="9" r="1.6" />
			<circle cx="16.5" cy="14" r="1.6" />
			<circle cx="19" cy="6.5" r="1.6" />
			<path d="M3.5 3.5v17h17" />
		</>
	),
	progress: (
		<>
			<path d="M3.5 3.5v17h17" />
			<path d="m7 15 3.5-4.5 3 2.5L19 6.5" />
		</>
	),
	career: (
		<>
			<rect x="3.5" y="5" width="17" height="15" rx="2" />
			<path d="M3.5 10h17M8 3.5V7M16 3.5V7" />
			<path d="m7.5 17 3-3 2.5 2 3.5-4" />
		</>
	),
	situations: (
		<>
			<circle cx="12" cy="12" r="8" />
			<circle cx="12" cy="12" r="4" />
			<circle cx="12" cy="12" r="0.8" />
		</>
	),
	numbers: (
		<>
			<rect x="4" y="4" width="7" height="7" rx="1.5" />
			<rect x="13" y="4" width="7" height="7" rx="1.5" />
			<rect x="4" y="13" width="7" height="7" rx="1.5" />
			<rect x="13" y="13" width="7" height="7" rx="1.5" />
		</>
	),
	style: (
		<>
			<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" />
			<path d="m12 8.5 1.1 2.4 2.4 1.1-2.4 1.1L12 15.5l-1.1-2.4L8.5 12l2.4-1.1Z" />
		</>
	),
	money: (
		<>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M14.6 9.2c-.5-.8-1.4-1.2-2.6-1.2-1.5 0-2.5.8-2.5 1.9 0 2.7 5.2 1.3 5.2 4 0 1.1-1 2-2.7 2-1.3 0-2.3-.5-2.9-1.4M12 6.5V8M12 16v1.5" />
		</>
	),
	time: (
		<>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M12 7.5V12l3 2" />
		</>
	),
	log: (
		<>
			<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
			<circle cx="4.8" cy="6.5" r="0.9" />
			<circle cx="4.8" cy="12" r="0.9" />
			<circle cx="4.8" cy="17.5" r="0.9" />
		</>
	),
	box: (
		<>
			<rect x="3.5" y="5" width="17" height="14" rx="2" />
			<path d="M3.5 10h17M9 10v9" />
		</>
	),
	like: (
		<>
			<circle cx="9" cy="8.5" r="3" />
			<path d="M3.5 19c.4-3 2.5-5 5.5-5s5.1 2 5.5 5" />
			<path d="M15.5 6a3 3 0 0 1 0 5.6M17.5 14.3c1.6.6 2.8 2.1 3 4.7" />
		</>
	),
}

export type SectionKey = keyof typeof PATHS

/** The section key from a nav id such as "stack-edge". */
export function keyOf(id: string): SectionKey {
	const k = id.split("-")[0]
	return (k in PATHS ? k : "read") as SectionKey
}

export default function SectionIcon({ name, className = "h-5 w-5" }: { name: SectionKey; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
			{PATHS[name]}
		</svg>
	)
}
