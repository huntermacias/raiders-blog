import { previewData } from "next/headers";
import { groq } from "next-sanity";
import type { Metadata } from "next";
import { client } from "../../lib/sanity.client";
import PreviewSuspense from "../../components/PreviewSuspense"
import PreviewBlogList from "../../components/PreviewBlogList";
import BlogList from "../../components/BlogList";
import GameReportsTeaser from "../../components/GameReportsTeaser";
import Script from "next/script";

const query = groq`
	*[_type=='post' && !(_id in path('drafts.**'))] {
		...,
		author->,
		categories[]->
	} | order(_createdAt desc)
`

const gameReportsQuery = groq`
	*[_type=='gameReport' && !(_id in path('drafts.**'))] {
		_id, title, slug, opponent, gameDate, raidersScore, opponentScore, mainImage
	} | order(gameDate desc) [0...3]
`

// Always render fresh from Sanity. Time-based ISR (revalidate) only refreshes
// this page in the background on the *next* real visitor request after the
// window elapses -- on a low-traffic route that can mean it never refreshes.
// force-dynamic renders on every request instead, so newly published content
// (or the games index / homepage list of recent posts) shows immediately.
export const dynamic = "force-dynamic"

// Set here (page-level), not on the root layout: every other route already
// sets its own `alternates.canonical` via generateMetadata, and adding one
// at the layout level too made Next 13.2.1's metadata merge crash
// ("Cannot clone object of unsupported type") on every route that has to
// reconcile a layout-level `alternates` against its own page-level one.
// Page-level only, matching the working pattern everywhere else, avoids
// that merge entirely.
export const metadata: Metadata = {
	alternates: {
		canonical: "https://www.raidersrundown.com/",
	},
}

export default async function page() {

	if(previewData()) {
		return (
			<PreviewSuspense 
				fallback={(
					<div role="status">
						<p className="text-center text-lg animate-pulse text-[#51e665]">Loading preview Data...</p>
					</div>
				)}

			>
			<PreviewBlogList query={query} />
			</PreviewSuspense>
		)
	} 

	

	const [posts, games] = await Promise.all([
		client.fetch(query),
		client.fetch(gameReportsQuery),
	]);

  return (
	  <div>
		  <GameReportsTeaser games={games} />

		  <BlogList posts={posts} />
	  </div>

  )
}
