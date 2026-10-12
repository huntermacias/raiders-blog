import type { Yard } from "@/lib/lab/playersKit"
import { yardPos } from "@/lib/lab/playersKit"

export type YardMark = { v: number; se?: number | null; name: string; color?: string }

const clamp = (x: number) => Math.max(0.02, Math.min(0.98, x))

/**
 * One number set against the league. The strip runs from the 10th-best player's value to the 90th-best, always worse on the left and
 * better on the right (a style stat just runs low to high). The shaded stretch is where the middle half of players sit, the tick is
 * the median, and the thin line either side of the dot is where the player's true level most likely is, given how many plays are
 * behind it. A longer line means less certainty.
 */
export default function Yardstick({
	marks,
	yard,
	higher,
	fmt,
	peers,
	compact = false,
}: {
	marks: YardMark[]
	yard: Yard
	higher: boolean | null
	fmt: (v: number) => string
	peers: string
	compact?: boolean
}) {
	const pos = (v: number) => yardPos(v, yard, higher)
	const band = [pos(yard.q[1]), pos(yard.q[3])].sort((a, b) => a - b)
	const median = pos(yard.q[2])
	const left = higher === false ? yard.q[4] : yard.q[0]
	const right = higher === false ? yard.q[0] : yard.q[4]
	const label = `${marks.map((m) => `${m.name}: ${fmt(m.v)}`).join("; ")}. The middle half of ${peers} run from ${fmt(yard.q[1])} to ${fmt(yard.q[3])}, and the typical one is ${fmt(yard.q[2])}.`
	return (
		<div className="w-full" role="img" aria-label={label}>
			<div className="relative h-6">
				<div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-lab-line" />
				<div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm bg-lab-line-strong" style={{ left: `${clamp(band[0]) * 100}%`, width: `${Math.max(0.01, clamp(band[1]) - clamp(band[0])) * 100}%` }} />
				<div className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-lab-muted" style={{ left: `${clamp(median) * 100}%` }} />
				{marks.map((m, i) => {
					const c = clamp(pos(m.v))
					const lo = m.se ? clamp(pos(m.v - 1.645 * m.se * (higher === false ? -1 : 1))) : null
					const hi = m.se ? clamp(pos(m.v + 1.645 * m.se * (higher === false ? -1 : 1))) : null
					const color = m.color ?? "var(--pc-accent)"
					return (
						<div key={i}>
							{lo !== null && hi !== null ? (
								<div className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full opacity-55" style={{ left: `${Math.min(lo, hi) * 100}%`, width: `${Math.abs(hi - lo) * 100}%`, background: color }} />
							) : null}
							<div
								className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lab-surface shadow"
								style={{ left: `${c * 100}%`, background: color }}
							/>
						</div>
					)
				})}
			</div>
			{compact ? null : (
				<div className="mt-0.5 flex items-baseline justify-between font-mono text-[10px] tabular-nums text-lab-muted">
					<span>{fmt(left)}</span>
					<span className="font-sans">{higher === null ? `low to high · typical ${fmt(yard.q[2])}` : "worse to better"}</span>
					<span>{fmt(right)}</span>
				</div>
			)}
		</div>
	)
}
