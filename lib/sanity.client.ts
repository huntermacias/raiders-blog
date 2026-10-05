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

// Never serve a Studio edit from Next's data cache.
//
// Next 13.2.1 caches every server `fetch` that carries no Authorization header
// for a year (until the next deploy), and `dynamic = "force-dynamic"` does not
// change that for the data. The token-free client above sends no Authorization
// header, so on Vercel a published Studio change (new power rankings, graded
// keys...) kept rendering the old data. Passing `cache: "no-store"` opts each
// query out. Pages that want ISR can still pass their own `cache`/`next`
// options, which win over this default.
const readFetch = readClient.fetch?.bind(readClient) as
	| ((query: string, params?: unknown, options?: Record<string, unknown>) => Promise<unknown>)
	| undefined
if (readFetch) {
	;(readClient as unknown as { fetch: unknown }).fetch = (
		query: string,
		params: unknown = {},
		options: Record<string, unknown> = {}
	) => readFetch(query, params, { cache: "no-store", ...options })
}
