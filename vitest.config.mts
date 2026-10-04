import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

// Unit tests for the parts of the site that must not silently break: the
// grading and ranking math, the API routes that take input from strangers, the
// feeds crawlers read, the Studio schemas and the homepage components.
//
// `yarn build` runs these first (see package.json), so a failing test stops a
// deploy before `next build` starts and the last good version stays live.
export default defineConfig({
	resolve: {
		alias: [
			// The Studio and the data client pull in heavy packages that the logic under
			// test never touches. These stand-ins keep the tests fast and offline.
			{ find: /^sanity$/, replacement: `${root}tests/stubs/sanity.ts` },
			{ find: /^next-sanity$/, replacement: `${root}tests/stubs/next-sanity.ts` },
			{ find: /^@\//, replacement: root },
		],
	},
	esbuild: { jsx: "automatic" },
	test: {
		environment: "node",
		include: ["tests/**/*.test.{ts,tsx}"],
		setupFiles: ["tests/setup.tsx"],
		restoreMocks: true,
		testTimeout: 20_000,
	},
})
