import { existsSync } from "node:fs"

// The Raiders shield shows up next to the Rundown logo once the file is in /public. The page is built ahead of
// time, so this is checked at build; nothing broken is ever shown when the file is not there.
export const RAIDERS_LOGO = "/raiders-shield.png"

export const hasRaidersLogo = (root: string = process.cwd()): boolean => existsSync(`${root}/public${RAIDERS_LOGO}`)

export const raidersLogo: string | null = hasRaidersLogo() ? RAIDERS_LOGO : null
