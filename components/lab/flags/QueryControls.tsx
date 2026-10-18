"use client"

import { useRouter } from "next/navigation"

export type Field = { name: string; label: string; value: string; options: { value: string; label: string }[] }

/**
 * Pickers that live in the address: choosing one opens the same page with the new query, so every view of a compare or situations page is a link
 * that can be shared and bookmarked. `keep` carries other parts of the query along (the dimension chosen with chips, say).
 */
export default function QueryControls({ path, fields, keep = {} }: { path: string; fields: Field[]; keep?: Record<string, string> }) {
	const router = useRouter()
	const go = (name: string, value: string) => {
		const q = new URLSearchParams()
		for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v)
		for (const f of fields) {
			const v = f.name === name ? value : f.value
			if (v) q.set(f.name, v)
		}
		const s = q.toString()
		router.push(`${path}${s ? `?${s}` : ""}`, { scroll: false })
	}
	return (
		<div className="flex flex-wrap items-end gap-x-5 gap-y-3">
			{fields.map((f) => (
				<label key={f.name} className="block text-sm">
					<span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{f.label}</span>
					<select value={f.value} onChange={(e) => go(f.name, e.target.value)} className="min-h-11 w-full min-w-[10rem] rounded-lg border border-lab-line-strong bg-lab-surface px-3 text-base text-lab-ink sm:text-sm">
						{f.options.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
			))}
		</div>
	)
}
