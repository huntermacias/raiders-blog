import { getPlayers } from "@/lib/lab/data"
import { mapData } from "@/lib/lab/mapKit"
import { GROUP_ORDER, groupOf } from "@/lib/lab/playersKit"

// One small json file per position, written at build time. The league map fetches it when a reader scrolls to it, so it never weighs
// down a profile page that does not use it.
export const dynamic = "force-static"
export const dynamicParams = false

export function generateStaticParams() {
	return GROUP_ORDER.map((group) => ({ group }))
}

export async function GET(_req: Request, ctx: { params: Promise<{ group: string }> }) {
	const { group } = await ctx.params
	const g = groupOf(group)
	if (!g) return new Response("Not found", { status: 404 })
	return Response.json(mapData(getPlayers(), g), { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } })
}
