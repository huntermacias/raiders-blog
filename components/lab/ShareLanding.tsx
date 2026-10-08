import Link from "@/components/SiteLink"
import ShareRedirect from "@/components/lab/ShareRedirect"

/**
 * What a shared Lab link opens: the card in the link preview (read from this page's HTML, so the preview is the
 * card that was shared), then the reader is sent straight on to the interactive page at the same part. A reader
 * whose browser does not follow the redirect sees the card and a button.
 */
export default function ShareLanding({ crumb, title, image, alt, href, button }: { crumb: string; title: string; image: string | null; alt: string; href: string; button: string }) {
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<ShareRedirect href={href} />
			<section className="container py-10 sm:py-14">
				<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
					<Link href="/lab" className="hover:text-lab-ink">
						The Lab
					</Link>{" "}
					&middot; {crumb}
				</p>
				<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
				{image ? (
					<Link href={href} className="mt-6 block max-w-3xl overflow-hidden rounded-2xl border border-lab-line bg-lab-tint">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={image} alt={alt} width={1200} height={630} className="block h-auto w-full" />
					</Link>
				) : null}
				<p className="mt-6">
					<Link href={href} className="inline-flex min-h-[44px] items-center rounded-lg bg-lab-ink px-5 py-2 text-sm font-bold text-lab-page transition hover:opacity-90">
						{button}
					</Link>
				</p>
			</section>
		</div>
	)
}
