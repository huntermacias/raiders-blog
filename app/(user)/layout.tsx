import { Inter, Fraunces } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"

import Banner from "../../components/Banner"
import Header from "../../components/Header"
import Footer from "../../components/Footer"
import { ThemeProvider } from "../../components/theme-provider"
import { cn } from "../../lib/utils"
import "../../styles/globals.css"

const fontSans = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
})

const fontSerif = Fraunces({
	subsets: ["latin"],
	variable: "--font-serif",
	weight: ["400", "500", "600", "700"],
	style: ["normal", "italic"],
	display: "swap",
})

export const metadata = {
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
  title: "Las Vegas Raiders News | Latest Updates, Rumors, and Analysis",
  description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
  creator: 'Hunter Macias',
  icons: {
    icon: 'https://i.imgur.com/q0mNqvS.jpeg',
    shortcut: 'https://i.imgur.com/q0mNqvS.jpeg',
    apple: 'https://i.imgur.com/q0mNqvS.jpeg',
    other: {
      rel: 'raider-image',
      url: 'https://i.imgur.com/q0mNqvS.jpeg',
    },
  },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="twitter:title" content={metadata.twitter.title} />
        <meta name="twitter:description" content={metadata.twitter.description} />
        <meta name="twitter:image" content={metadata.twitter.images[0]} />
        <meta name="twitter:card" content={metadata.twitter.description} />
      </head>
      <body className={cn("min-h-screen font-sans antialiased", fontSans.variable, fontSerif.variable)}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="flex min-h-screen flex-col">
            <Header />
            <Banner />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
