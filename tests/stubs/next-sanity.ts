// Stand-in for `next-sanity`: `groq` is a plain tagged template, and the
// client factory returns an empty object. Tests that need a client mock
// `lib/sanity.client` directly.
export function groq(strings: TemplateStringsArray, ...values: unknown[]): string {
	return String.raw({ raw: strings }, ...values)
}
export function createClient(): Record<string, unknown> {
	return {}
}
