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
  // The image optimizer will resize and re-encode anything from a host listed here, for anyone who asks, and every distinct (url, width, quality,
  // format) is a billed transformation plus cache storage. So: only this project's own Sanity images, no SVG (a past critical advisory), one
  // quality, one modern format, a short list of widths, and a year-long cache for assets whose URL changes when the image does.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io", pathname: "/images/27bpkxp4/production/**" }],
    formats: ["image/webp"],
    qualities: [75],
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [64, 128, 256, 384],
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: false,
  },
  // The comparison page reads its two players from the query string, so Next renders it for every request and marks the response private. Its
  // output depends only on the deployment's data and that query string, so Vercel's CDN may keep it: Vercel-CDN-Cache-Control is read by the CDN
  // alone, wins over the Cache-Control Next sets, and is stripped before the response reaches the browser. The cache is per deployment, so a new
  // build (new data) starts empty.
  async headers() {
    return [
      // Plain hardening headers on every page. (No Content-Security-Policy: the site loads analytics, embeds and the Studio, and a policy that
      // is wrong breaks them silently; add one with a report endpoint if you want it.)
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
        ],
      },
      // A *.vercel.app address is a deployment, not the site. Whatever a crawler finds there must never be indexed under that name.
      {
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
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
      // Every production deployment also answers at its own unique *.vercel.app address (and the project's alias). Crawlers find those from
      // logs and certificates and walk them as a second copy of the site, paying for every request twice. On production builds they send
      // visitors to the real domain instead; previews are left alone so a branch can still be opened. Set ALLOW_VERCEL_HOST=1 on a deploy to
      // look at its own address once.
      ...(process.env.VERCEL_ENV === "production" && process.env.ALLOW_VERCEL_HOST !== "1"
        ? [
            {
              source: "/:path*",
              has: [{ type: "host", value: ".*\\.vercel\\.app" }],
              destination: "https://www.raidersrundown.com/:path*",
              permanent: false,
            },
          ]
        : []),
      {
        source: "/post/nfl-power-rankings-after-week-3-raiders-crack-the-top-five-and-chicago-blows-up-the-top-10",
        destination: "/post/week-3-power-rankings",
        permanent: true,
      },
    ]
  },
}
