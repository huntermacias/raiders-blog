import { groq } from "next-sanity";
import Image from "next/image";
import { client } from "../../../../lib/sanity.client";
import urlFor from "../../../../lib/urlFor";
import { PortableText } from "@portabletext/react";
import { RichTextComponents } from "../../../../components/RichTextComponents";
import CommentField from "../../../../components/CommentField";
import SocialShare from "../../../../components/SocialShare";
import { ChatBubbleBottomCenterIcon } from "@heroicons/react/24/outline";
import { useRef } from "react";


type Props = {
	params: {
		slug: string;
	};
};



export const revalidate = 60; // revalide this page every 60 seconds

export async function generateStaticParams() {
	const query = groq`
	*[_type=="post"]
	{
		slug
	}`;

	const slugs: Post[] = await client.fetch(query); 
	const slugRoutes = slugs.map((slug) => slug.slug.current);

	return slugRoutes.map(slug => ({
		slug,
	}));
}

async function Post({params: {slug}} : Props) {

	const query = groq`
	*[_type=='post' && slug.current == $slug][0]
	{
		...,
		author->,
		categories[]->,
		'comments': *[
		_type=="comment" && 
		post._ref == ^._id &&
		approved == true
		],
	}
	`

	const post: Post = await client.fetch(query, { slug });
	// console.log('comment', post.comments.length);

  return (
	<div>

		<article className="px-10 pb-28">
			<section className="space-y-2 border border-[#363a3b] text-white">
				<div className="relative min-h-56 flex flex-col md:flex-row justify-between">
					<div className="absolute top-0 w-full h-full opacity-10 blur-sm p-10">
						<Image
							className="object-cover object-center mx-auto"
							src={urlFor(post.mainImage).url()}
							alt={post.author.name}
							fill
						/>
					</div>

					<section className="p-5 bg-[#363a3b] w-full">
						<div className="flex flex-col md:flex-row justify-between gap-y-5">
							<div>
								<h1 className="text-4xl font-extrabold">{post.title}</h1>
								<p>
									{new Date(post._createdAt).toLocaleDateString("en-US", {
										day: "numeric", 
										month: "long", 
										year: "numeric", 
									})}
								</p>
							</div>

							<div className="flex items-center space-x-2">
								<Image
									className="rounded-full"
									src={urlFor(post.author.image).url()}
									alt={post.author.name}
									height={40}
									width={40}
								/>	
								<div className="w-64">
									<h3 className="text-lg font-bold">{post.author.name}</h3>
									{/* <p>{post.author.bio}</p> */}
								</div>


							</div>
						</div>

						<div>
							<h2 className="italic pt-10">{post.description}</h2>
							
							<div className="flex items-center justify-end mt-auto space-x-2">
								{post.categories.map((category) => (
									<div key={category._id}>
										<p className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm font-semibold mt-4">{category.title}</p>
										
									</div>
								))}
							</div>
							
						</div>
					</section>
				</div>
			</section>

			
			<div className="flex flex-row justify-between mt-2">
				<div>
					<SocialShare customurl={`https://www.raidersrundown.com/post/${post.slug.current}`} />
				</div>
				
				<div className="flex flex-row p-2 space-x-4 text-white mt-2 items-center align-middle">
					<h2 className="text-xl">{post.comments.length}</h2>
					<ChatBubbleBottomCenterIcon className="h-7 w-7" />
				</div>
			</div>

			<PortableText value={post.body} components={RichTextComponents} />

		</article>
		
		{/* comment form */}
		<CommentField postId={post._id} />

		{/* comments */}
		<div className="flex flex-col p-10 my-10 max-w-2xl mx-auto shadow-emerald-500 shadow space-y-2">
			<h3 className="text-4xl"> Comments </h3>
			<hr className="pb-2"/>
			{post.comments.map((comment) => (
				<div key={comment._id}>
					<p>
						<span className="text-emerald-500">@{comment.name}</span>
						: {comment.comment}</p>
				</div>
			))}
		</div>
		

	</div>
	
  )
}

export default Post