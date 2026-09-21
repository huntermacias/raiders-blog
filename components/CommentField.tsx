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
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	const onSubmit: SubmitHandler<IFormInput> = async (data) => {
		setSubmitting(true)
		setSubmitError(null)
		try {
			// fetch() only rejects on a network failure -- an HTTP error status
			// (e.g. the Sanity write failing server-side) still resolves here,
			// so the response has to be checked explicitly or a failed submit
			// silently shows the success state.
			const res = await fetch("/api/createComment", {
				method: "POST",
				body: JSON.stringify(data),
			})

			if (!res.ok) {
				const body = await res.json().catch(() => null)
				throw new Error(body?.message || `Submission failed (${res.status})`)
			}

			setSubmitted(true)
		} catch (err) {
			console.log("error", err)
			setSubmitError(
				err instanceof Error ? err.message : "Something went wrong submitting your comment. Please try again."
			)
			setSubmitted(false)
		} finally {
			setSubmitting(false)
		}
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

						{submitError && (
							<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{submitError}
							</div>
						)}

						<Button type="submit" className="self-start" disabled={submitting}>
							{submitting ? "Submitting..." : "Submit comment"}
						</Button>
					</form>
				)}
			</Card>
		</div>
	)
}

export default CommentField
