import Banner from "../../components/Banner";
import Header from "../../components/Header";
import "../../styles/globals.css";

export const metadata = {
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  title: "Las Vegas Raiders News | Latest Updates, Rumors, and Analysis",
  description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
  colorScheme: 'dark',
  creator: 'Hunter Macias',
  image: 'https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg', 
  icons: {
    icon: 'https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg',
    shortcut: 'https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg',
    apple: 'https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg',
    other: {
      rel: 'raider-image',
      url: 'https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg',
    },
  },
  icon: 'https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg',
  twitter: {
    card: 'summary_large_image',
    title: 'Las Vegas Raiders News | Latest Updates, Rumors, and Analysis',
    description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
    siteId: '1467726470533754880',
    creator: 'Hunter Macias',
    creatorId: '1467726470533754880',
    images: ['https://c4.wallpaperflare.com/wallpaper/526/747/724/football-oakland-raiders-wallpaper-preview.jpg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
      <meta name="twitter:title" content={metadata.twitter.title} />
      <meta name="twitter:description" content={metadata.twitter.description} />
      <meta name="twitter:image" content={metadata.twitter.images[0]} />
      <meta name="twitter:card" content={metadata.twitter.description} />
      </head>
      <body className="max-2-7xl mx-auto">

        <Header />
        <Banner />
        {children}
        
      </body>
    </html>
  )
}
