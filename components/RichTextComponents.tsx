import Image from "next/image"
import Link from "next/link"

import { bodyImageUrl, hotspotPosition } from "../lib/urlFor"

export const RichTextComponents = {
	types: {
		image: ({ value }: any) => {
			// object-cover (not object-contain) + a standardized server-side crop
			// so every inline image fills this box edge-to-edge regardless of its
			// original aspect ratio, instead of being letterboxed/pillarboxed to
			// fit -- object-contain was leaving portrait photos with big dark
			// bars down the sides.
			return (
				<span className="relative my-8 block h-96 w-full overflow-hidden rounded-lg not-prose">
					<Image
						className="object-cover"
						src={bodyImageUrl(value)}
						alt="Blog post image"
						fill
						style={{ objectPosition: hotspotPosition(value) }}
						sizes="(min-width: 1024px) 768px, 100vw"
					/>
				</span>
			)
		},
	},

	list: {
		bullet: ({ children }: any) => <ul>{children}</ul>,
		number: ({ children }: any) => <ol>{children}</ol>,
	},

	block: {
		h1: ({ children }: any) => <h1>{children}</h1>,
		h2: ({ children }: any) => <h2>{children}</h2>,
		h3: ({ children }: any) => <h3>{children}</h3>,
		h4: ({ children }: any) => <h4>{children}</h4>,
		h5: ({ children }: any) => <h5>{children}</h5>,
		blockquote: ({ children }: any) => (
			<blockquote className="border-l-primary">{children}</blockquote>
		),
	},

	marks: {
		link: ({ children, value }: any) => {
			const rel = !value.href.startsWith("/") ? "noreferrer noopener" : undefined
			return (
				<Link href={value.href} rel={rel} target={rel ? "_blank" : undefined}>
					{children}
				</Link>
			)
		},
	},
}
