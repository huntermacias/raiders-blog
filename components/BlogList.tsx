import { ArrowUpRightIcon } from "@heroicons/react/24/solid";
// import { HandThumbUpIcon, HandThumbDownIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import urlFor from "../lib/urlFor";
import ClientSideRoute from "./ClientSideRoute";


type Props = {
	posts: Post[];
};



function BlogList({posts}: Props) {
  return (
	<div>
		<hr className="border-[#383837] mb-10" />

		<div className="grid grid-cols-1 md:grid-cols-2 px-10 gap-10 gap-y-16 pb-24">
			
			{/* posts */}
			{posts.map(post => (
				
				<ClientSideRoute key={post._id} route={`/post/${post.slug.current}`}>
					<div className="group cursor-pointer flex flex-col ">
						<div className="relative w-full h-80 drop-shadow-xl group-hover:scale-105 transition-transform duration-200 ease-out shadow-lg shadow-emerald-800">
							<Image 
								className="object-cover object-left lg:object-center"
								src={urlFor(post.mainImage).url()}
								alt={post.author.name}
								fill
							/>
							<div className="absolute bottom-0 w-full bg-opacity-20 bg-black backdrop-blur-lg rounded drop-shadow-lg text-white p-5 flex justify-between">
								<div>
									<p className="font-bold">{post.title}</p>
									<p>
										{new Date(post._createdAt).toLocaleDateString("en-US", {
											day: 'numeric',
											month: 'long', 
											year: 'numeric',
										})}
									</p>
								</div>

								<div className="flex flex-col md:flex-row gap-y-2 md:gap-x-2 items-center">
									{post.categories.map(category => (
										<div key={post._id} className="bg-[#2acb8c] text-center text-black px-3 py-1 rounded-full text-sm font-semibold">
											<p>{category.title}</p>
										</div>
									))}

								</div>
							</div>
						</div>

						<div className="mt-5 flex-1">
							<p className="underline text-lg font-bold">{post.title}</p>
							<p className="line-clamp-2 text-gray-500">{post.description}</p>
						</div>
						<div>
							
							<p className="mt-5 font-bold flex items-center group-hover:underline">
								Read Post
								<ArrowUpRightIcon className="ml-2 h-4 w-4" />

								{/* <HandThumbUpIcon className="ml-6 rounded-lg text-white h-6 w-6 hover:bg-emerald-400/30" />
								<HandThumbDownIcon className="ml-14 rounded-lg text-white h-6 w-6 hover:bg-red-500/30" /> */}
							</p>

							

						</div>
					</div>

				</ClientSideRoute>
			))}
		</div>

		
	

	</div>
  )
}

export default BlogList
