import { previewData } from "next/headers";
import { groq } from "next-sanity";
import { client } from "../../lib/sanity.client";
import PreviewSuspense from "../../components/PreviewSuspense"
import PreviewBlogList from "../../components/PreviewBlogList";
import BlogList from "../../components/BlogList";
import GameReportsTeaser from "../../components/GameReportsTeaser";
import Script from "next/script";
import GoogleAnalytics from "@bradgarropy/next-google-analytics"

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

		  <GoogleAnalytics measurementId="G-P1HE62KWXG" />

	  </div>

  )
}
