import { getRuntime } from "@/lib/league2/auth/server"

export const dynamic = "force-dynamic"

async function handle(req: Request): Promise<Response> {
	const rt = getRuntime()
	if (!rt) return new Response("Not found", { status: 404 })
	return rt.auth.handler(req)
}

export { handle as GET, handle as POST }
