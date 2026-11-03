// Fills in "Story type" on existing posts from a reviewed list.
//
//   node scripts/assign-story-types.mjs guides/story-types-assignment.json            (shows what it would change)
//   SANITY_WRITE_TOKEN=... node scripts/assign-story-types.mjs guides/story-types-assignment.json --apply
//
// The list is { "<post slug>": "<story type>" }. Only the Story type field is set; slugs, text and everything else are left alone. Posts that
// already have a type are skipped. A post with an unpublished draft gets the field on the draft too, so publishing it later keeps the type.
// Needs a Sanity token that can write (the same one the site uses for comments works: NEXT_SANITY_TOKEN).
import fs from "node:fs"
import { createClient } from "@sanity/client"

const file = process.argv[2]
const apply = process.argv.includes("--apply")
if (!file) {
	console.error("Usage: node scripts/assign-story-types.mjs <assignment.json> [--apply]")
	process.exit(1)
}
const TYPES = new Set(["preview", "power-rankings", "free-agency", "trade", "draft", "film-room", "profile", "opinion", "news"])
const list = JSON.parse(fs.readFileSync(file, "utf8"))
const token = process.env.SANITY_WRITE_TOKEN || process.env.NEXT_SANITY_TOKEN
const client = createClient({
	projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "27bpkxp4",
	dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
	apiVersion: "2022-11-15",
	useCdn: false,
	token,
})

const bad = Object.entries(list).filter(([, t]) => !TYPES.has(t))
if (bad.length) {
	console.error("Not a story type:", bad.map(([s, t]) => `${s} -> ${t}`).join("\n"))
	process.exit(1)
}
if (apply && !token) {
	console.error("Set SANITY_WRITE_TOKEN (or NEXT_SANITY_TOKEN) to apply.")
	process.exit(1)
}

const docs = await client.fetch(`*[_type == "post" && slug.current in $slugs]{ _id, "slug": slug.current, storyType }`, { slugs: Object.keys(list) })
const bySlug = new Map()
for (const d of docs) {
	bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), d])
}
let changed = 0
for (const [slug, type] of Object.entries(list)) {
	const found = bySlug.get(slug)
	if (!found) {
		console.log(`missing   ${slug}`)
		continue
	}
	for (const d of found) {
		if (d.storyType) {
			console.log(`has type  ${slug} (${d.storyType})`)
			continue
		}
		console.log(`${apply ? "set" : "would set"}  ${slug} -> ${type}${d._id.startsWith("drafts.") ? " (draft)" : ""}`)
		changed++
		if (apply) await client.patch(d._id).set({ storyType: type }).commit()
	}
}
console.log(`\n${apply ? "Changed" : "Would change"} ${changed} document(s).${apply ? "" : " Run again with --apply to write them."}`)
