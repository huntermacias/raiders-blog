import { getRuntime } from "@/lib/league2/auth/server"

export const dynamic = "force-dynamic"

/**
 * Local testing only: lets an end-to-end run read the emails the app would have sent. It answers 404 unless the app is
 * NOT in production, LEAGUE_DEV_OUTBOX=on is set, and the mailer is the in-memory one (no email provider configured).
 */
export async function GET(): Promise<Response> {
	const rt = getRuntime()
	const sent = (rt?.mailer as { sent?: unknown[] } | undefined)?.sent
	if (process.env.NODE_ENV === "production" || process.env.LEAGUE_DEV_OUTBOX !== "on" || !rt || !Array.isArray(sent)) return new Response("Not found", { status: 404 })
	return Response.json({ sent }, { headers: { "Cache-Control": "no-store" } })
}
