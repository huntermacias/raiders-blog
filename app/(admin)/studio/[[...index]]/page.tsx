import Studio from "./Studio"

// Page metadata and viewport for the Studio (replaces the old head.tsx, which Next no longer reads).
export {metadata, viewport} from "next-sanity/studio"

// The page is the same for everyone, so it is built once at deploy time and served from Vercel's cache instead of
// being rendered by a function on every visit. That is what next-sanity recommends for the Studio, and it removes
// the cold-start render that used to time out (a 504, "Task timed out after 10 seconds").
export const dynamic = "force-static"

// Studio links that go deeper, such as /studio/structure/post, are rendered once on first visit and then cached.
// Give that first render more room than the default 10 seconds.
export const maxDuration = 60

export function generateStaticParams() {
	return [{index: []}]
}

// The Studio is a client component, so this page stays a server component to be able to export metadata.
export default function StudioPage() {
	return <Studio />
}
