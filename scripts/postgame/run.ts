// Runs the postgame pipeline from a GitHub Action (bundled with esbuild, run under Node).
//
//   node run.cjs create            create a draft game report if ESPN has a final Raiders game with no report yet
//   node run.cjs enrich            add the Lab's pieces to existing drafts
//   add --dry-run to log what would happen without writing anything
//
// Secrets: SANITY_WRITE_TOKEN (an Editor token), NOTIFY_WEBHOOK_URL (optional; Slack, Discord or anything that
// takes {"text": ...}). Without a webhook the message only goes to the Action's log and summary.

import { appendFileSync } from "node:fs"

import { type Io, createDraft, enrichDrafts } from "../../lib/postgame/run"

const PROJECT = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "27bpkxp4"
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET || "production"
const SITE = process.env.SITE_URL || "https://www.raidersrundown.com"
const TOKEN = process.env.SANITY_WRITE_TOKEN
const HOOK = process.env.NOTIFY_WEBHOOK_URL
const API = `https://${PROJECT}.api.sanity.io/v2023-05-03/data`

async function sanity(path: string, init?: RequestInit) {
	if (!TOKEN) throw new Error("SANITY_WRITE_TOKEN is not set")
	const res = await fetch(`${API}/${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } })
	const text = await res.text()
	if (!res.ok) throw new Error(`Sanity ${res.status}: ${text.slice(0, 300)}`)
	return JSON.parse(text)
}

const io: Io = {
	now: () => new Date(),
	getJson: async (url) => {
		const res = await fetch(url, { headers: { "User-Agent": "raidersrundown-postgame" } })
		if (!res.ok) throw new Error(`${url} -> ${res.status}`)
		return res.json()
	},
	query: async <T,>(groq: string, params: Record<string, string> = {}) => {
		const qs = new URLSearchParams({ query: groq, perspective: "raw" })
		for (const [k, v] of Object.entries(params)) qs.set(`$${k}`, JSON.stringify(v))
		return (await sanity(`query/${DATASET}?${qs.toString()}`)).result as T
	},
	mutate: async (mutations) => {
		await sanity(`mutate/${DATASET}`, { method: "POST", body: JSON.stringify({ mutations }) })
	},
	notify: async (text) => {
		console.log(`NOTIFY: ${text}`)
		if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`)
		if (!HOOK) return
		try {
			// "text" for Slack, "content" for Discord.
			await fetch(HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }) })
		} catch (err) {
			console.error("notify failed", err)
		}
	},
	log: (line) => console.log(line),
	dryRun: process.argv.includes("--dry-run"),
}

async function main() {
	const mode = process.argv[2]
	if (mode === "create") await createDraft(io, SITE)
	else if (mode === "enrich") await enrichDrafts(io, SITE)
	else throw new Error("usage: run.cjs create|enrich [--dry-run]")
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
