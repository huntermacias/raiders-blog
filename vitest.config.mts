import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

// Unit tests for the parts of the site that must not silently break: the
// grading and ranking math, the API routes that take input from strangers, the
// feeds crawlers read, the Studio schemas and the homepage components.
//
// They run in GitHub Actions (.github/workflows/ci.yml) on every push to main and every pull request, not inside the Vercel build: `yarn build` is
// just `next build`, so a deploy spends no build CPU on them.
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
		// Vercel runs the build with NODE_ENV=production, and vitest keeps whatever
		// is already set. React then loads its production build, which has no
		// act() and fails every component test. Tests always run in "test" mode.
		env: { NODE_ENV: "test" },
		environment: "node",
		include: ["tests/**/*.test.{ts,tsx}"],
		setupFiles: ["tests/setup.tsx"],
		restoreMocks: true,
		testTimeout: 20_000,
	},
})
