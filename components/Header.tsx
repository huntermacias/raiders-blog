import Image from "next/image"
import Link from "next/link"

function Header() {
  return (
	<header className="flex items-center justify-between space-x-2 font-bold px-10 py-5" >
		<div className="flex items-center space-x-2">
			<Link href="/">
			<Image 
				className="rounded-full"
				height={50}
				width={50}
				src="https://i.pinimg.com/originals/07/e6/4d/07e64d8088fd0ead3d3f15339008eb29.jpg"
				alt="logo"
				/>
			</Link>
			<h1>Las Vegas Raiders News | Latest Updates, Rumors, and Analysis</h1>
		</div>

		<div className="">
			<Link 
				href="https://www.huntermacias.io"
				className="px-5 py-3 text-sm md:text-base bg-gray-900 text-[#2acb8c] flex items-center rounded-full text-center"
			>
				Tech Blog
			</Link>
		</div>
	</header>
  )
}

export default Header