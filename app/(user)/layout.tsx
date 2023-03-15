import Banner from "../../components/Banner";
import Header from "../../components/Header";
import "../../styles/globals.css";

export const metadata = {
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
  title: "Las Vegas Raiders News | Latest Updates, Rumors, and Analysis",
  description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
  colorScheme: 'dark',
  creator: 'Hunter Macias',
  image: 'https://i.imgur.com/q0mNqvS.jpeg', 
  icons: {
    icon: 'https://i.imgur.com/q0mNqvS.jpeg',
    shortcut: 'https://i.imgur.com/q0mNqvS.jpeg',
    apple: 'https://i.imgur.com/q0mNqvS.jpeg',
    other: {
      rel: 'raider-image',
      url: 'https://i.imgur.com/q0mNqvS.jpeg',
    },
  },
  icon: 'https://i.imgur.com/q0mNqvS.jpeg',
  twitter: {
    card: 'summary_large_image',
    title: 'Las Vegas Raiders News | Latest Updates, Rumors, and Analysis',
    description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
    siteId: '1467726470533754880',
    creator: 'Hunter Macias',
    creatorId: '1467726470533754880',
    images: ['https://i.imgur.com/q0mNqvS.jpeg'],
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
