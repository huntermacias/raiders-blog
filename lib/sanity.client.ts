import { createClient } from "next-sanity"

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
export const token = process.env.NEXT_SANITY_TOKEN;
const apiVersion = '2022-11-15';

export const client = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: false, 
	token,
});

// Token-free, read-only client for statically generated / ISR pages.
//
// Next 13.x treats any fetch that carries an `Authorization` header as
// uncacheable, so using the token-bearing client above on a page that has
// generateStaticParams/revalidate throws "Page changed from static to
// dynamic at runtime". The production dataset is public, so published
// content is readable without a token. Keep using `client` for writes.
export const readClient = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: false,
});
