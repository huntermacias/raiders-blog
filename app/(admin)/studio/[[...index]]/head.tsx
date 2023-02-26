// Re-export `NextStudioHead` as default if you're happy with the default behavior
export {NextStudioHead} from 'next-sanity/studio/head'

// To customize it, use it as a children component:
import {NextStudioHead} from 'next-sanity/studio/head'

const mt = {
  title: `Las Vegas Raiders News | Latest Updates, Rumors, and Analysis`,
  description: `Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.`,
  image: `https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg`,
  url: `https://www.raidersrundown.com`
}

export default function CustomStudioHead() {
  return (
    <>
      <NextStudioHead favicons={false} />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="https://wallpaperaccess.com/full/4284608.jpg"
      />
      <meta name="twitter:title" content={mt.title} />
      <meta name="twitter:description" content={mt.description} />
      <meta name="twitter:image" content={mt.image} />
      <meta name="twitter:card" content={mt.description} />
    </>
  )
}