// 'use client'

// import { Input } from "@nextui-org/react";


function Banner() {
  return (
	// <div className="flex flex-col">
		<div className="flex flex-col lg:flex-row lg:space-x-5 justify-between font-bold px-10 py-5 mb-10">
			<div>
				<h1 className="text-6xl">All About the Shield</h1>
				<h2 className="mt-5 md:mt-0">
					Welcome to the home of <span className="underline decoration-4 decoration-[#212725]">Raider Nation!</span>
				</h2>
			</div>
			<p className="mt-5 md:mt-2 text-gray-400 max-w-sm">
				Game Recaps | Player Profiles | Draft Predictions | Latest Updates & Rumors | Analysis & More !
			</p>
		</div>


		
			/* <div className="text-white text-2xl px-10 py-6">
			<Input className="text-white"
				rounded
				bordered
				label="Search"
				placeholder="Search by Category..."
				status="success"
				color="success"
			/>
		 </div> */
		


	// </div>
  )
}

export default Banner