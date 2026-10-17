// Browser-side helpers for League accounts. Same-origin fetches with cookies; never throws.

export type Res<T = unknown> = { ok: true; data: T } | { ok: false; status: number; message: string; code?: string }

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<Res<T>> {
	try {
		const res = await fetch(path, {
			method,
			credentials: "same-origin",
			headers: body === undefined ? undefined : { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
		const data = await res.json().catch(() => ({}))
		if (res.ok) return { ok: true, data: data as T }
		const message = typeof data?.message === "string" ? data.message : res.status === 429 ? "Too many attempts. Try again in a few minutes." : "Something went wrong. Try again."
		return { ok: false, status: res.status, message, code: typeof data?.code === "string" ? data.code : undefined }
	} catch {
		return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection and try again." }
	}
}

export const post = <T = unknown>(path: string, body: unknown) => call<T>("POST", path, body)
export const get = <T = unknown>(path: string) => call<T>("GET", path)

/** Better Auth answers failures with { message, code }. Turn the codes people can fix into plain words. */
export function authMessage(r: { status: number; message: string; code?: string }): string {
	switch (r.code) {
		case "INVALID_EMAIL_OR_PASSWORD":
			return "That email and password do not match."
		case "EMAIL_NOT_VERIFIED":
			return "Confirm your email first. We sent you a link when you signed up."
		case "INVALID_PASSWORD":
			return "That is not your current password."
		case "INVALID_TOKEN":
			return "This link has expired or was already used. Request a new one."
		case "PASSWORD_TOO_SHORT":
			return "Use at least 10 characters."
		default:
			return r.status === 429 ? "Too many attempts. Try again in a few minutes." : r.status === 403 && !r.code ? "Your account cannot sign in. Contact us if this is a mistake." : r.message
	}
}

export const signIn = (email: string, password: string) => post("/api/auth/sign-in/email", { email, password })
export const signOut = () => post("/api/auth/sign-out", {})
export const requestReset = (email: string) => post("/api/auth/request-password-reset", { email, redirectTo: "/league/reset-password" })
export const resetPassword = (token: string, newPassword: string) => post("/api/auth/reset-password", { token, newPassword })
export const changePassword = (currentPassword: string, newPassword: string) => post("/api/auth/change-password", { currentPassword, newPassword, revokeOtherSessions: true })
export const resendVerification = (email: string) => post("/api/auth/send-verification-email", { email, callbackURL: "/league/verified" })

export type Me = { signedIn: false } | { signedIn: true; player: { id: string; handle: string } | null; needsHandle: boolean; admin: boolean }
export const me = () => get<Me>("/api/league/account/me")

export const PASSWORD_MIN = 10

/** The same advice the server enforces, as it can be shown while typing. The server is the authority. */
export function passwordHints(pw: string, ctx: { handle?: string; email?: string }): { ok: boolean; label: string }[] {
	const lower = pw.toLowerCase()
	const handle = (ctx.handle ?? "").toLowerCase()
	const local = (ctx.email ?? "").toLowerCase().split("@")[0]
	return [
		{ ok: pw.length >= PASSWORD_MIN, label: `At least ${PASSWORD_MIN} characters` },
		{ ok: !(handle.length >= 4 && lower.includes(handle)) && !(local.length >= 4 && lower.includes(local)), label: "Not your handle or email" },
	]
}
