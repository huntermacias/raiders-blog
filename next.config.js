/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
    // Sanity Studio (via next-sanity) bundles the Mux video input plugin,
    // whose dependency chain (@mux/mux-player -> custom-media-element) ships
    // as ESM-only. Next's webpack build needs this loosened to bundle it
    // instead of erroring with "ESM packages need to be imported".
    // See: https://nextjs.org/docs/messages/import-esm-externals
    esmExternals: "loose",
  },
  images: {
    domains: ["i.pinimg.com", "cdn.sanity.io"],
  },
}
