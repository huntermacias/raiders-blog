import Banner from "../../components/Banner";
import Header from "../../components/Header";
import "../../styles/globals.css";

export const metadata = {
  title: "Las Vegas Raiders News | Latest Updates, Rumors, and Analysis",
  description: "Stay up-to-date on the latest Las Vegas Raiders news with our comprehensive coverage. From rumors and analysis to breaking updates, we've got you covered.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="max-2-7xl mx-auto">

        <Header />
        <Banner />
        {children}
        
      </body>
    </html>
  )
}
