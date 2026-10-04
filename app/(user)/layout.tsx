import { Inter, Fraunces } from "next/font/google"
import { Analytics } from "@vercel/analytics/react"
import GoogleAnalytics from "@bradgarropy/next-google-analytics"

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
  // Self-hosted icons (public/). Google picks the favicon from the <link rel="icon">
  // in the page head, so these must point at files on this domain, not a
  // third-party host. favicon.ico is a real multi-size .ico (16-64px); the
  // PNGs are for browsers/phones that want a bigger one.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  // Allow Google to show large image previews (Discover and image-rich results).
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' as const, 'max-snippet': -1, 'max-video-preview': -1 },
  },
  // Site-wide fallback for pages that don't set their own (e.g. the
  // homepage). Individual posts and game reports override this with
  // generateMetadata so shared links show the right image/title.
  openGraph: {
    type: 'website',
    siteName: 'Raiders Rundown',
    title: 'Las Vegas Raiders News | Latest Updates, Rumors, and Analysis',
    description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
    images: ['https://www.raidersrundown.com/og-default-v2.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Las Vegas Raiders News | Latest Updates, Rumors, and Analysis',
    description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
    siteId: '1467726470533754880',
    creator: 'Hunter Macias',
    creatorId: '1467726470533754880',
    images: ['https://www.raidersrundown.com/og-default-v2.png'],
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
        {/* RSS auto-discovery. A plain tag rather than metadata.alternates.types:
            on Next 13.2 that becomes a URL object, which the dev-mode metadata
            clone can't copy ("Cannot clone object of unsupported type"). */}
        <link rel="alternate" type="application/rss+xml" title="Raiders Rundown" href="https://www.raidersrundown.com/rss.xml" />
        {/* Google Search Console site ownership verification (URL-prefix
            property for https://www.raidersrundown.com) -- lets Google
            confirm you control the site without a DNS record. */}
        <meta name="google-site-verification" content="bSslkMdt7Yxw4H6hlQvdGcwK3UWfXjJqcWWc3Z4LDbo" />
      </head>
      <body className={cn("min-h-screen font-sans antialiased", fontSans.variable, fontSerif.variable)}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
        <Analytics />
        {/* Moved here from the homepage's page.tsx: this component (per its
            own docs) is meant to be mounted once at the app root so it
            tracks every route. Mounted only on "/" it was firing solely on
            the homepage -- meaning GA4 was blind to every game report,
            post, and the /games and /community pages, which is most of
            this site's actual content and where real reader behavior would
            show up. */}
        <GoogleAnalytics measurementId="G-P1HE62KWXG" />
      </body>
    </html>
  )
}
