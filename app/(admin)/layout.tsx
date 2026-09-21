import { Inter, Fraunces } from "next/font/google"

import "../../styles/globals.css";

// Loaded here too (not just the (user) layout) so /live-post and any future
// admin-only pages get the same Fraunces/Inter pairing as the public site
// instead of falling back to generic system fonts -- this is a control
// panel Hunter will actually want to look at, not just a bare HTML form.
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
