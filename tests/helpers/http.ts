import type { NextApiRequest, NextApiResponse } from "next"
import { vi } from "vitest"

type ReqInit = {
	method?: string
	headers?: Record<string, string | string[] | undefined>
	body?: unknown
	query?: Record<string, string | string[] | undefined>
	remoteAddress?: string
}

export function mockReq(init: ReqInit = {}): NextApiRequest {
	return {
		method: init.method ?? "POST",
		headers: init.headers ?? {},
		body: init.body,
		query: init.query ?? {},
		socket: { remoteAddress: init.remoteAddress },
	} as unknown as NextApiRequest
}

export type MockRes = NextApiResponse & {
	statusCode: number
	body: unknown
	headers: Record<string, string>
	ended: boolean
	redirectedTo: string | null
	rawBody: unknown
}

/** A just-enough NextApiResponse that records what the handler did. */
export function mockRes(): MockRes {
	const res = {
		statusCode: 200,
		body: undefined as unknown,
		rawBody: undefined as unknown,
		headers: {} as Record<string, string>,
		ended: false,
		redirectedTo: null as string | null,
	} as MockRes
	res.status = vi.fn((code: number) => {
		res.statusCode = code
		return res
	}) as unknown as MockRes["status"]
	res.json = vi.fn((b: unknown) => {
		res.body = b
		res.ended = true
		return res
	}) as unknown as MockRes["json"]
	res.setHeader = vi.fn((k: string, v: string | number | readonly string[]) => {
		res.headers[k] = String(v)
		return res
	}) as unknown as MockRes["setHeader"]
	res.end = vi.fn((b?: unknown) => {
		if (b !== undefined) res.rawBody = b
		res.ended = true
		return res
	}) as unknown as MockRes["end"]
	res.write = vi.fn((b: unknown) => {
		res.rawBody = b
		return true
	}) as unknown as MockRes["write"]
	res.redirect = vi.fn((a: number | string, b?: string) => {
		res.statusCode = typeof a === "number" ? a : 307
		res.redirectedTo = typeof a === "number" ? (b as string) : a
		res.ended = true
		return res
	}) as unknown as MockRes["redirect"]
	return res
}

/** A fake Sanity patch builder: patch(id).setIfMissing(..).inc(..).commit() */
export function fakePatch(result: Record<string, unknown>) {
	const calls: { setIfMissing?: unknown; inc?: unknown; set?: unknown; append?: unknown[] } = {}
	const chain: Record<string, unknown> = {}
	chain.setIfMissing = vi.fn((v: unknown) => {
		calls.setIfMissing = v
		return chain
	})
	chain.inc = vi.fn((v: unknown) => {
		calls.inc = v
		return chain
	})
	chain.set = vi.fn((v: unknown) => {
		calls.set = v
		return chain
	})
	chain.append = vi.fn((...v: unknown[]) => {
		calls.append = v
		return chain
	})
	chain.commit = vi.fn(async () => result)
	return { chain, calls }
}
