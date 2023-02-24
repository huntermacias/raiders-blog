import Link from "next/link"
import { ArrowUturnLeftIcon } from "@heroicons/react/24/solid";

function StudioNavbar(props: any) {
  return (
	<div>
		<div className="flex items-center justify-between p-5">
			<Link className="text-[#2acb8c] flex items-center" href="/">
				<ArrowUturnLeftIcon className="h-6 w-6 text-[#2acb8c] mr-2" />

				Go to the Website
			</Link>

			<div className="hidden md:flex p-5 rounded-lg justify-center border-2 border-[#2acb8c]">
				<h1 className="font-bold text-white">Want Raider News & Updates sent to your inbox daily? 👉 </h1>
				<Link href="https://www.huntermacias.io" className="text-[#2acb8c] ml-2">www.huntermacias.io</Link>
			</div>

		</div>
		<>{props.renderDefault(props)}</>
	</div>
  );
}

export default StudioNavbar