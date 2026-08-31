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

export const revalidate = 60; // revalide this page every 60 seconds

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
