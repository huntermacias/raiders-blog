// Sending account email (verification, password reset). Kept behind a tiny interface so the provider can change and
// tests never send anything. Server use only.

export type Mail = { to: string; subject: string; text: string; html: string }
export type Mailer = { send(mail: Mail): Promise<void> }

/** Collects messages instead of sending them. Used in development and tests. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
	const sent: Mail[] = []
	return {
		sent,
		async send(mail) {
			sent.push(mail)
		},
	}
}

/** Resend's HTTP API. No SDK needed: one POST. Throws on any non-2xx so callers can show "try again". */
export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
	return {
		async send(mail) {
			const res = await fetchImpl("https://api.resend.com/emails", {
				method: "POST",
				headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
				body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
			})
			if (!res.ok) throw new Error(`Email provider answered ${res.status}`)
		},
	}
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function shell(heading: string, body: string, cta: { label: string; url: string }, footer: string): { html: string; text: string } {
	const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#71717a;margin:0 0 8px">Raiders Rundown League</p>
<h1 style="font-size:24px;margin:0 0 12px">${esc(heading)}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 20px">${esc(body)}</p>
<p style="margin:0 0 24px"><a href="${esc(cta.url)}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif">${esc(cta.label)}</a></p>
<p style="font-size:13px;color:#52525b;line-height:1.5">If the button does not work, copy this link into your browser:<br>${esc(cta.url)}</p>
<p style="font-size:13px;color:#52525b;line-height:1.5">${esc(footer)}</p></div>`
	const text = `${heading}\n\n${body}\n\n${cta.label}: ${cta.url}\n\n${footer}\n`
	return { html, text }
}

export function verificationEmail(to: string, handle: string, url: string): Mail {
	const m = shell("Confirm your email", `Welcome, ${handle}. Confirm this address to finish setting up your League account. The link works for one hour.`, { label: "Confirm my email", url }, "If you did not create this account, ignore this email and nothing will happen.")
	return { to, subject: "Confirm your Raiders Rundown League account", ...m }
}

export function resetEmail(to: string, url: string): Mail {
	const m = shell("Reset your password", "Use the button below to choose a new password. The link works once and expires in one hour.", { label: "Choose a new password", url }, "If you did not ask for this, ignore this email. Your password has not changed.")
	return { to, subject: "Reset your Raiders Rundown League password", ...m }
}

export function existingAccountEmail(to: string, signInUrl: string): Mail {
	const m = shell("Someone tried to sign up with this email", "An account already uses this address. If it was you, sign in instead, or reset your password if you forgot it.", { label: "Go to sign in", url: signInUrl }, "If it was not you, no action is needed.")
	return { to, subject: "Raiders Rundown League sign-up attempt", ...m }
}
