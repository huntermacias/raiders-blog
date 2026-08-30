"use client"

import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type Props = {
	value: string
	onChange: (value: string) => void
	resultCount: number
}

function SearchBar({ value, onChange, resultCount }: Props) {
	return (
		<div className="w-full max-w-sm">
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Search articles..."
					className="pl-9 pr-9"
					aria-label="Search articles"
				/>
				{value && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2"
						onClick={() => onChange("")}
						aria-label="Clear search"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>
			{value && (
				<p className="mt-1.5 text-xs text-muted-foreground">
					{resultCount} result{resultCount === 1 ? "" : "s"}
				</p>
			)}
		</div>
	)
}

export default SearchBar
