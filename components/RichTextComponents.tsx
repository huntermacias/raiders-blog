import Image from "next/image"
import Link from "next/link"

import urlFor from "../lib/urlFor"

export const RichTextComponents = {
	types: {
		image: ({ value }: any) => {
			return (
				<span className="relative my-8 block h-96 w-full overflow-hidden rounded-lg not-prose">
					<Image
						className="object-contain"
						src={urlFor(value).url()}
						alt="Blog post image"
						fill
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
