import Link from "@/components/SiteLink"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

type Props = {
	title: string
	description?: string | null
	categories: { _id: string; title: string }[]
	author: string
	authorImageUrl?: string | null
	published: string
	minutes: number | null
	/** A tiny copy of the cover, blurred into the background so the header takes its colors from the story's own picture. */
	ambientUrl?: string
	/** Share, comment count and the like, placed by the page. */
	actions: React.ReactNode
}

/**
 * The top of a story: the headline on a dark band that takes its color from the cover picture, in the same style as a game report. Always
 * dark so the type reads the same in either site theme. The cover itself is not used here (it is shown whole, below); only a blurred
 * copy of it tints the background.
 */
export default function PostHero({ title, description, categories, author, authorImageUrl, published, minutes, ambientUrl, actions }: Props) {
	const first = categories[0]
	return (
		<header className="dark relative isolate overflow-hidden bg-[#0b0d10] text-white" data-testid="post-hero">
			{ambientUrl && (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={ambientUrl} alt="" aria-hidden decoding="async" className="absolute inset-0 -z-20 h-full w-full scale-150 object-cover opacity-50 blur-3xl saturate-150" />
			)}
			<div
				className="absolute inset-0 -z-10"
				style={{
					backgroundImage:
						"linear-gradient(to bottom, rgba(11,13,16,0.55), rgba(11,13,16,0.85) 60%, #0b0d10), radial-gradient(circle at 90% 0%, rgba(223,227,234,0.16), transparent 55%), radial-gradient(circle at 5% 0%, rgba(223,227,234,0.12), transparent 50%)",
				}}
			/>
			<div className="container max-w-6xl pb-8 pt-8 sm:pb-12 sm:pt-12">
				<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-white/60">
					<Link href="/" className="shrink-0 hover:text-white hover:underline">Home</Link>
					<span aria-hidden>/</span>
					<span className="shrink-0 text-white/70">Stories</span>
					{first && (
						<>
							<span aria-hidden>/</span>
							<span className="min-w-0 truncate text-white/80">{first.title}</span>
						</>
					)}
				</nav>

				{categories.length > 0 && (
					<div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
						{categories.map((c, i) => (
							<span key={c._id} className="flex items-center gap-3">
								{i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-white/40" />}
								{c.title}
							</span>
						))}
					</div>
				)}

				<h1 className="mx-auto mt-6 max-w-4xl text-balance text-center font-serif text-3xl font-bold leading-[1.08] tracking-tight sm:mt-8 sm:text-5xl">{title}</h1>
				{description && <p className="mx-auto mt-4 max-w-3xl text-pretty text-center text-base text-white/75 sm:text-xl">{description}</p>}

				<div className="mx-auto mt-7 flex max-w-4xl flex-col gap-4 border-t border-white/15 pt-4 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<Avatar className="h-9 w-9 ring-1 ring-white/25">
							{authorImageUrl && <AvatarImage src={authorImageUrl} alt={author} />}
							<AvatarFallback className="bg-white/10 text-white">{author?.[0]}</AvatarFallback>
						</Avatar>
						<span>
							By <span className="font-semibold text-white">{author}</span> &middot; {published}
							{minutes ? <> &middot; {minutes} min read</> : null}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div>
				</div>
			</div>
		</header>
	)
}
