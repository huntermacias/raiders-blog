import Image from "next/image"
import Link from "@/components/SiteLink"

import { bodyImageUrl, hotspotPosition, imageAspectRatio } from "../lib/urlFor"
import PlayerEmbed from "./lab/players/PlayerEmbed"
import Embed from "./embeds/Embed"

export const RichTextComponents = {
	types: {
		image: ({ value }: any) => {
			// The container's aspect-ratio is derived from this specific
			// image's real dimensions (read off its Sanity asset ref, no
			// network round trip), so it always matches the photo exactly --
			// nothing is ever cropped (the old object-cover behavior) and
			// nothing is ever letterboxed (the old fixed-16:9-box behavior).
			// A tall phone screenshot gets a tall box; a wide screenshot gets
			// a wide one. object-contain is safe here specifically because
			// the box already matches the image, so it never has to shrink
			// to fit and reveal empty space.
			const ratio = imageAspectRatio(value)
			return (
				<span
					className="relative my-8 block w-full max-h-[80vh] overflow-hidden rounded-lg bg-muted not-prose"
					style={{ aspectRatio: ratio }}
				>
					<Image
						className="object-contain"
						src={bodyImageUrl(value)}
						alt="Blog post image"
						fill
						style={{ objectPosition: hotspotPosition(value) }}
						sizes="(min-width: 1024px) 768px, 100vw"
					/>
				</span>
			)
		},
		// Lets an editor place a YouTube or X (Twitter) embed anywhere inside
		// the rich text body, reusing the same detection/rendering used for
		// the game report's standalone "Video / social embeds" field.
		videoEmbed: ({ value }: any) => <Embed url={value.url} caption={value.caption} />,
		// A live card for a player from the Lab: photo, grade, key numbers against the league, and a link to his page.
		playerCard: ({ value }: any) => <PlayerEmbed slug={value.player} note={value.note} />,
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
		// A name in the text that links to the player's page in the Lab.
		playerLink: ({ children, value }: any) =>
			value?.player ? (
				<Link href={`/lab/players/${value.player}?ref=post`}>{children}</Link>
			) : (
				<>{children}</>
			),
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
