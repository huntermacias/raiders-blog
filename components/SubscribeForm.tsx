"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackConversion } from "@/lib/analytics"
import { loadUtm } from "@/lib/utm"

type Status = "idle" | "sending" | "done" | "error"

export default function SubscribeForm({ source }: { source: string }) {
	const [email, setEmail] = useState("")
	const [website, setWebsite] = useState("") // honeypot
	const [status, setStatus] = useState<Status>("idle")
	const [message, setMessage] = useState("")

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (status === "sending") return
		setStatus("sending")
		setMessage("")
		try {
			const utm = loadUtm()
			const res = await fetch("/api/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, website, source, utm: utm ?? undefined }),
			})
			const data = await res.json().catch(() => ({}))
			if (res.ok) {
				trackConversion("newsletter_signup", utm)
				setStatus("done")
				setMessage("You're in. Check your inbox for a confirmation link.")
			} else {
				setStatus("error")
				setMessage(data?.message || "Couldn't sign you up. Try again in a minute.")
			}
		} catch {
			setStatus("error")
			setMessage("Couldn't reach the server. Check your connection and try again.")
		}
	}

	if (status === "done") {
		return (
			<p role="status" className="flex items-center gap-2 text-sm font-semibold">
				<Check aria-hidden className="h-4 w-4" strokeWidth={3} /> {message}
			</p>
		)
	}

	return (
		<form onSubmit={onSubmit} noValidate className="w-full">
			<div className="flex flex-col gap-2 sm:flex-row">
				<label htmlFor={`sub-${source}`} className="sr-only">
					Email address
				</label>
				<Input
					id={`sub-${source}`}
					type="email"
					inputMode="email"
					autoComplete="email"
					required
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="sm:max-w-xs"
				/>
				{/* Honeypot: hidden from people and assistive tech, bots fill it in. */}
				<div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
					<label>
						Website
						<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
					</label>
				</div>
				<Button type="submit" disabled={status === "sending" || email.trim() === ""}>
					{status === "sending" ? (
						<>
							<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> Signing up
						</>
					) : (
						"Get the Sunday picks"
					)}
				</Button>
			</div>
			<p aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm text-rose-700 dark:text-rose-400">
				{status === "error" ? message : ""}
			</p>
		</form>
	)
}
