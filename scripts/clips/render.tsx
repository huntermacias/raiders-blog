// Draws the Lab's win-probability clips with satori + resvg and encodes them with ffmpeg.
//
//   node render.cjs [--week N | --all] [--out public/lab/clips] [--manifest data/lab/clips.json] [--sizes landscape,vertical,square]
//
// With no flags it draws only the games whose clip is missing or out of date (see lib/clips/manifest.ts).
// The GitHub Action bundles this file with esbuild (see .github/workflows/lab-data.yml) and runs the result
// under Node, so nothing here needs Next.
//
// Frames are written once and shown for as long as the plan says (ffmpeg's concat demuxer), so holds on the
// markers and on the final score cost nothing.

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { Resvg } from "@resvg/resvg-js"
import satori from "satori"

import { getGames, getSeason } from "../../lib/lab/data"
import { type ClipEntry, type ClipManifest, CLIP_VERSION, KINDS, clipHash, clipPath, staleGames } from "../../lib/clips/manifest"
import { CLIP_SIZES, type ClipKind, buildClipSpec, planFrames, renderClipFrame } from "../../lib/clips/story"
import { ogFonts } from "../../lib/og/fonts"

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`)
	return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

function ffmpeg(args: string[]) {
	const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] })
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.slice(-1)[0]}`)
}

async function drawFrames(spec: NonNullable<ReturnType<typeof buildClipSpec>>, kind: ClipKind, dir: string) {
	const plan = planFrames(spec)
	const { w } = CLIP_SIZES[kind]
	const fonts = ogFonts() as never
	const list: string[] = []
	const { h } = CLIP_SIZES[kind]
	for (let i = 0; i < plan.frames.length; i++) {
		const f = plan.frames[i]
		const svg = await satori(renderClipFrame(spec, kind, f), { width: w, height: h, fonts })
		const png = new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng()
		const name = join(dir, `f${String(i).padStart(4, "0")}.png`)
		writeFileSync(name, new Uint8Array(png))
		list.push(`file '${name}'`, `duration ${f.hold.toFixed(4)}`)
	}
	// The concat demuxer ignores the last duration unless the last file is repeated.
	list.push(list[list.length - 2])
	writeFileSync(join(dir, "list.txt"), `${list.join("\n")}\n`)
	return plan
}

async function main() {
	const out = arg("out") ?? "public/lab/clips"
	const manifestPath = arg("manifest") ?? "data/lab/clips.json"
	const kinds = (arg("sizes")?.split(",") ?? KINDS) as ClipKind[]
	const games = getGames()
	let manifest: ClipManifest | null = null
	if (existsSync(manifestPath)) {
		try {
			manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ClipManifest
		} catch {
			manifest = null
		}
	}
	const week = arg("week")
	const todo = week ? games.filter((g) => String(g.week) === week) : flag("all") ? games : staleGames(games, manifest)
	if (!todo.length) {
		console.log("All clips are up to date.")
		return
	}
	mkdirSync(out, { recursive: true })
	const next: ClipManifest = {
		version: CLIP_VERSION,
		generatedAt: new Date().toISOString(),
		games: manifest?.version === CLIP_VERSION ? { ...manifest.games } : {},
	}
	const team = getSeason().team
	for (const game of todo) {
		const spec = buildClipSpec(game, team)
		if (!spec) {
			console.log(`Week ${game.week}: no win probability, skipped`)
			continue
		}
		console.log(`Week ${game.week}: drawing`)
		const files = {} as ClipEntry["files"]
		const bytes = {} as ClipEntry["bytes"]
		let seconds = 0
		for (const kind of kinds) {
			const tmp = join(out, `.tmp-week-${game.week}-${kind}`)
			rmSync(tmp, { recursive: true, force: true })
			mkdirSync(tmp, { recursive: true })
			const plan = await drawFrames(spec, kind, tmp)
			seconds = plan.seconds
			const mp4 = join(out, `week-${game.week}-${kind}.mp4`)
			ffmpeg(["-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-movflags", "+faststart", "-an", mp4])
			files[kind] = clipPath(game.week, kind)
			bytes[kind] = statSync(mp4).size
			if (kind === "landscape") {
				const gif = join(out, `week-${game.week}.gif`)
				ffmpeg(["-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-vf", "fps=10,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", gif])
				files.gif = clipPath(game.week, "gif")
				bytes.gif = statSync(gif).size
				const poster = join(out, `week-${game.week}-poster.jpg`)
				ffmpeg(["-sseof", "-0.5", "-i", mp4, "-frames:v", "1", "-q:v", "4", poster])
				files.poster = clipPath(game.week, "poster")
				bytes.poster = statSync(poster).size
			}
			rmSync(tmp, { recursive: true, force: true })
		}
		next.games[String(game.week)] = { week: game.week, hash: clipHash(game), seconds: Math.round(seconds * 10) / 10, files, bytes }
	}
	writeFileSync(manifestPath, `${JSON.stringify(next, null, 1)}\n`)
	console.log(`Wrote ${manifestPath}`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
