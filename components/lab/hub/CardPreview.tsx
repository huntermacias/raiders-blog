"use client"

import * as React from "react"

/** The Lab Report card as the link preview shows it, in the hero. A card that fails to draw leaves nothing behind rather than a broken picture. */
export default function CardPreview({ src, alt }: { src: string; alt: string }) {
	const [failed, setFailed] = React.useState(false)
	const ref = React.useRef<HTMLImageElement>(null)
	React.useEffect(() => {
		const img = ref.current
		if (img && img.complete && img.naturalWidth === 0) setFailed(true)
	}, [])
	if (failed) return null
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img ref={ref} src={src} alt={alt} width={1200} height={630} decoding="async" onError={() => setFailed(true)} className="block h-auto w-full rounded-2xl border border-lab-line-strong bg-lab-tint shadow-[var(--lab-shadow)]" data-testid="report-preview" />
	)
}
