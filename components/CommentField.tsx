"use client"
import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form"

interface IFormInput {
	_id: string; 
	name: string;
	email: string; 
	comment: string;
}

type Props = {
	postId: any;
	
};

function CommentField({postId} : Props) {

	const { register, handleSubmit, formState:{errors}  } = useForm<IFormInput>();
	const [submitted, setSubmitted] = useState(false)

	const onSubmit: SubmitHandler<IFormInput> = (data) => {
		fetch('/api/createComment', {
			method: 'POST', 
			body: JSON.stringify(data), 
		}).then(() => {
			console.log(data);
			setSubmitted(true)
		}).catch((err) => {
			console.log('error', err);
			setSubmitted(false);
		})
	}

	return (
		<div>

			<hr className="max-w-lg my-5 mx-auto border border-[#41f098]" />

			{submitted ? (
				<div className="flex flex-col p-10 my-10 bg-[#929496] text-white max-w-2xl mx-auto">
					<h3 className="text-2xl font-bold">Thank you for submitting your comment!</h3>
					<p>Once it has been approved, it will appear below!</p>
				</div>
			):(

				<form onSubmit={handleSubmit(onSubmit)}className="flex flex-col p-5 max-w-2xl mx-auto mb-10">
					<h3 className="text-md text-[#edf0ee]">Enjoyed this article? </h3>
					<h4 className="text-3xl font-bold">Leave a comment below!</h4>
					<hr className="py-3 mt-2" />

					<input 
						{...register("_id")}
						type="hidden"
						name="_id"
						value={postId}
					/>
					
					<label className="block mb-5">
						<span className="text-white">Name</span>
						<input 
							{...register("name", {required: true})}
							className="shadow border rounded py-2 px-3 form-input mt-1 block w-full ring-emerald-500 outline-none focus:ring" 
							placeholder="Enter Name Here" 
							type='text' 
							
							/>
					</label>

					<label className="block mb-5">
						<span className="text-white">Email</span>
						<input  
							{...register("email", {required: true})}
							className="shadow border rounded py-2 px-3 form-input mt-1 block w-full ring-emerald-500 outline-none focus:ring" 
							placeholder="Enter Email Here" 
							type='email' 
							
							/>
					</label>

					<label className="block mb-5">
						<span className="text-white">Comment</span>
						<textarea 
							{...register("comment", {required: true})}
							className="shadow border rounded py-2 px-3 form-textarea mt-1 block w-full ring-emerald-500 outline-none focus:ring" 
							placeholder="Enter Comment Here" 
							rows={8} 
						
							/>
					</label>

					{/* errors will return when field validation fails */}
					<div className="flex flex-col p-5">
						{errors.name && (
							<span className="text-red-500">- The Name Field is required</span>
						)}
						{errors.email && (
							<span className="text-red-500">- The Email Field is required</span>
						)}
						{errors.comment && (
							<span className="text-red-500">- The Comment Field is required</span>
						)}
					</div>

					<input type="submit" className="shadow bg-emerald-500 hover:bg-emerald-400 focus:shadow-outline focus:outline-none text-white font-bold py-2 px-4 rounded cursor-pointer" />

				</form>
			)}
		</div>
	)


}

export default CommentField