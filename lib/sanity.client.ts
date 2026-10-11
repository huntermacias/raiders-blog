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

// Token-free client that reads through Sanity's edge cache (the API CDN). The homepage uses it for its stories and
// recaps: public, published content that every visitor asks for in the same shape, so one cached answer serves everyone
// instead of Sanity running the same query again for each visit. Sanity clears the cache for a document when it is
// published, so a new post still shows up promptly. Anything that must be read the instant it changes (reader votes,
// graded picks) stays on `readClient`. Set `useCdn` to false to go back to reading straight from the API.
export const cdnClient = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: true,
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

// Client for pages served through ISR (posts and game reports).
//
// `readClient` below is wrapped to send `cache: "no-store"` on every query, which opts a page out of static
// caching. These pages want the opposite: Next keeps the rendered page and the query results for
// ISR_REVALIDATE_SECONDS, then refreshes them in the background, so most visits are served from the CDN instead
// of waiting on Sanity. A Studio edit shows up within about two minutes (one window to expire, one to refresh).
export const ISR_REVALIDATE_SECONDS = 60
export const isrClient = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: false,
});
export const isrFetch = (query: string, params: Record<string, unknown> = {}): Promise<any> =>
	isrClient.fetch(query, params, { next: { revalidate: ISR_REVALIDATE_SECONDS } })

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
