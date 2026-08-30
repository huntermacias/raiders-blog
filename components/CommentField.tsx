"use client"

import { useState } from "react"
import { useForm, SubmitHandler } from "react-hook-form"
import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface IFormInput {
	_id: string
	name: string
	email: string
	comment: string
}

type Props = {
	postId: any
}

function CommentField({ postId }: Props) {
	const { register, handleSubmit, formState: { errors } } = useForm<IFormInput>()
	const [submitted, setSubmitted] = useState(false)

	const onSubmit: SubmitHandler<IFormInput> = (data) => {
		fetch("/api/createComment", {
			method: "POST",
			body: JSON.stringify(data),
		})
			.then(() => setSubmitted(true))
			.catch((err) => {
				console.log("error", err)
				setSubmitted(false)
			})
	}

	return (
		<div className="container max-w-2xl py-10">
			<Card className="p-6 sm:p-8">
				{submitted ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center">
						<MessageCircle className="h-8 w-8 text-primary" />
						<h3 className="text-xl font-semibold">Thanks for your comment!</h3>
						<p className="text-sm text-muted-foreground">
							Once it&apos;s approved, it will appear below.
						</p>
					</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
						<div>
							<p className="text-sm text-muted-foreground">Enjoyed this article?</p>
							<h4 className="font-serif text-2xl font-bold">Leave a comment</h4>
						</div>

						<input {...register("_id")} type="hidden" value={postId} />

						<label className="flex flex-col gap-1.5">
							<span className="text-sm font-medium">Name</span>
							<Input {...register("name", { required: true })} placeholder="Your name" />
						</label>

						<label className="flex flex-col gap-1.5">
							<span className="text-sm font-medium">Email</span>
							<Input {...register("email", { required: true })} type="email" placeholder="you@example.com" />
						</label>

						<label className="flex flex-col gap-1.5">
							<span className="text-sm font-medium">Comment</span>
							<Textarea {...register("comment", { required: true })} placeholder="Share your thoughts..." rows={6} />
						</label>

						{(errors.name || errors.email || errors.comment) && (
							<div className="flex flex-col gap-1 text-sm text-destructive">
								{errors.name && <span>The name field is required.</span>}
								{errors.email && <span>The email field is required.</span>}
								{errors.comment && <span>The comment field is required.</span>}
							</div>
						)}

						<Button type="submit" className="self-start">
							Submit comment
						</Button>
					</form>
				)}
			</Card>
		</div>
	)
}

export default CommentField
