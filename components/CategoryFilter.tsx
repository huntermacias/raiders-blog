"use client"

import { cn } from "@/lib/utils"

type Props = {
	categories: string[]
	active: string
	onChange: (category: string) => void
}

function CategoryFilter({ categories, active, onChange }: Props) {
	return (
		<div className="flex flex-wrap gap-2">
			{["All", ...categories].map((category) => (
				<button
					key={category}
					type="button"
					onClick={() => onChange(category)}
					className={cn(
						"rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
						active === category
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-background text-muted-foreground hover:text-foreground"
					)}
				>
					{category}
				</button>
			))}
		</div>
	)
}

export default CategoryFilter
