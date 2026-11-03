"use client"

import * as React from "react"
import { Maximize2, X } from "lucide-react"

/**
 * Click or tap a picture to see it large. A native <dialog>, so Esc closes it, focus is held inside it while it is open and goes back to
 * the picture afterwards. The big copy is only fetched once someone opens it.
 */
export default function Zoomable({
	zoomSrc,
	alt,
	caption,
	children,
}: {
	zoomSrc: string
	alt: string
	caption?: string | null
	children: React.ReactNode
}) {
	const dialog = React.useRef<HTMLDialogElement>(null)
	const [open, setOpen] = React.useState(false)

	React.useEffect(() => {
		if (!open) return
		const previous = document.body.style.overflow
		document.body.style.overflow = "hidden"
		return () => {
			document.body.style.overflow = previous
		}
	}, [open])

	const show = () => {
		setOpen(true)
		const d = dialog.current
		if (d && typeof d.showModal === "function" && !d.open) d.showModal()
	}
	const hide = () => dialog.current?.close()

	return (
		<>
			<button
				type="button"
				onClick={show}
				aria-label={`Enlarge image${alt ? `: ${alt}` : ""}`}
				className="group relative block w-full cursor-zoom-in rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				{children}
				<span
					aria-hidden
					className="pointer-events-none absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-90 ring-1 ring-white/20 backdrop-blur transition group-hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
				>
					<Maximize2 className="h-4 w-4" />
				</span>
			</button>

			<dialog
				ref={dialog}
				onClose={() => setOpen(false)}
				onClick={hide}
				aria-label={alt || "Enlarged image"}
				className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-black/90 p-0 text-white backdrop:bg-black/80"
			>
				{open && (
					<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-3 sm:p-6">
						<button
							type="button"
							onClick={hide}
							aria-label="Close"
							className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20 sm:right-5 sm:top-5"
						>
							<X className="h-5 w-5" />
						</button>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={zoomSrc} alt={alt} className="max-h-[calc(100dvh-5.5rem)] max-w-full object-contain" />
						{caption && <p className="max-w-3xl text-center text-sm text-white/80">{caption}</p>}
					</div>
				)}
			</dialog>
		</>
	)
}
