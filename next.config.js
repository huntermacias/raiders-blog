/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
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
