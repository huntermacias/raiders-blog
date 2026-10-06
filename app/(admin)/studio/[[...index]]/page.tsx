import Studio from "./Studio"

// Page metadata and viewport for the Studio (replaces the old head.tsx, which Next no longer reads).
export {metadata, viewport} from "next-sanity/studio"

// The Studio is a client component, so this page stays a server component to be able to export metadata.
export default function StudioPage() {
	return <Studio />
}
