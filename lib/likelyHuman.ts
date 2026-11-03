// A browser-side check used to keep automated visitors out of the analytics (Vercel Web Analytics, Speed Insights, Google Analytics), so the
// numbers describe readers. It catches the honest cases: a browser that says it is automated (`navigator.webdriver`, set by Playwright,
// Puppeteer and Selenium unless the operator hides it) or has "HeadlessChrome" in its user agent. A determined bot can hide both, which is
// why the edge checks and the Vercel firewall exist; this only stops the common ones from polluting the charts.

type Nav = { webdriver?: boolean; userAgent?: string; languages?: readonly string[] }

export function looksAutomated(nav: Nav | undefined): boolean {
	if (!nav) return false
	if (nav.webdriver === true) return true
	if (/HeadlessChrome|PhantomJS|Playwright|Puppeteer|Lighthouse/i.test(nav.userAgent ?? "")) return true
	// Real browsers always report at least one language; some bare headless setups report none.
	if (Array.isArray(nav.languages) && nav.languages.length === 0) return true
	return false
}

export const isLikelyHuman = (nav?: Nav): boolean => !looksAutomated(nav ?? (typeof navigator === "undefined" ? undefined : navigator))
