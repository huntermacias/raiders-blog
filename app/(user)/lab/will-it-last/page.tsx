import type { Metadata } from "next"

import WillItLastPage, { willItLastMetadata } from "@/components/lab/WillItLastPage"

// Built from the JSON in the repo, so it is static. The page itself is shared with the other 31 teams (./[team]).

export function generateMetadata(): Metadata {
	return willItLastMetadata("LV")
}

export default function Page() {
	return <WillItLastPage team="LV" />
}
