// Patch a published game report found by id, and only if it really is one.
//
// The vote and reaction routes used to run `client.patch(<id from the browser>)`, which wrote counters onto whatever document the id named. A
// selection by query makes Sanity check the type and the published-ness in the same call that writes, so a made-up id, a post, a draft or a
// settings document matches nothing and nothing is written.

import type { SanityClient } from "next-sanity"

/** The GROQ filter for "this id is a published game report" (the only document type that carries polls, reactions and player votes). */
export const PUBLISHED_GAME = `*[_type == "gameReport" && _id == $id && !(_id in path("drafts.**"))`

export type PatchOps = (patch: ReturnType<SanityClient["patch"]>) => ReturnType<SanityClient["patch"]>

/** Run `ops` on the matching game report. Returns its new state, or null when nothing matched. */
export async function patchPublishedGame(
	client: Pick<SanityClient, "patch">,
	id: string,
	ops: PatchOps,
	extraFilter = "",
	extraParams: Record<string, string> = {}
): Promise<Record<string, any> | null> {
	const selection = { query: `${PUBLISHED_GAME}${extraFilter}]`, params: { id, ...extraParams } }
	const result = await ops(client.patch(selection) as ReturnType<SanityClient["patch"]>).commit()
	const doc = Array.isArray(result) ? result[0] : result
	return doc ?? null
}
