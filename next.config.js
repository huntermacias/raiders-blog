/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Always define the Player Lab method switch ("v1" unless NEXT_PUBLIC_LAB_METHOD=v2 is set for the build). Next only inlines a
  // NEXT_PUBLIC_ variable that exists at build time, so without this a default build kept both data files and chose one at run time.
  env: { NEXT_PUBLIC_LAB_METHOD: process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? "v2" : "v1" },
  experimental: {
    // Sanity Studio (via next-sanity) bundles the Mux video input plugin,
    // whose dependency chain (@mux/mux-player -> custom-media-element) ships
    // as ESM-only. Next's webpack build needs this loosened to bundle it
    // instead of erroring with "ESM packages need to be imported".
    // See: https://nextjs.org/docs/messages/import-esm-externals
    esmExternals: "loose",
    // The share-card route (satori + resvg) loads hb.wasm from harfbuzzjs at runtime with fs, which
    // Vercel's file tracing can't see, so the function shipped without it and every card fell back to
    // the default image ("ENOENT .../harfbuzzjs/hb.wasm"). List the files it reads so they are bundled.
  },
  // Moved out of `experimental` in Next 15.
  outputFileTracingIncludes: {
    "/api/og": ["./node_modules/harfbuzzjs/hb.wasm", "./node_modules/@resvg/resvg-js-*/**"],
  },
  images: {
    domains: ["i.pinimg.com", "cdn.sanity.io"],
  },
  // The comparison page reads its two players from the query string, so Next renders it for every request and marks the response private. Its
  // output depends only on the deployment's data and that query string, so Vercel's CDN may keep it: Vercel-CDN-Cache-Control is read by the CDN
  // alone, wins over the Cache-Control Next sets, and is stripped before the response reaches the browser. The cache is per deployment, so a new
  // build (new data) starts empty.
  async headers() {
    return [
      {
        source: "/lab/players/compare",
        headers: [{ key: "Vercel-CDN-Cache-Control", value: "max-age=3600, stale-while-revalidate=86400" }],
      },
    ]
  },
  // Permanent (308) redirects for URLs that changed after they were shared.
  // Add a line here whenever a post's slug is edited in Studio, so the old
  // link keeps working and search engines carry its ranking to the new one.
  async redirects() {
    return [
      {
        source: "/post/nfl-power-rankings-after-week-3-raiders-crack-the-top-five-and-chicago-blows-up-the-top-10",
        destination: "/post/week-3-power-rankings",
        permanent: true,
      },
    ]
  },
}
