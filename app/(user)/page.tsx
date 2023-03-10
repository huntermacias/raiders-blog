import { previewData } from "next/headers";
import { groq } from "next-sanity";
import { client } from "../../lib/sanity.client";
import PreviewSuspense from "../../components/PreviewSuspense"
import PreviewBlogList from "../../components/PreviewBlogList";
import BlogList from "../../components/BlogList";
import Script from "next/script";
import GoogleAnalytics from "@bradgarropy/next-google-analytics"

const query = groq`
	*[_type=='post'] {
		...,
		author->,
		categories[]->
	} | order(_createdAt desc)
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

	

	const posts = await client.fetch(query);

  return (
	  <div>
		  <BlogList posts={posts} />

		  <GoogleAnalytics measurementId="G-P1HE62KWXG" />

	  </div>

  )
}
