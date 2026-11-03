// Per-address speed bumps for the anonymous write endpoints, in one place so tests can reset them. See lib/rateLimit.ts for what they do and do
// not guarantee: one server instance's memory, a brake on a single noisy visitor, not a wall.
import { createLimiter } from "./rateLimit"

const TEN_MIN = 10 * 60 * 1000

/** Newsletter signups: a reader signs up once; a script tries thousands of addresses. */
export const subscribeLimiter = createLimiter({ max: 6, windowMs: TEN_MIN })
/** Comments are held for approval anyway; four in ten minutes is plenty for a person. */
export const commentLimiter = createLimiter({ max: 4, windowMs: TEN_MIN })
export const pollLimiter = createLimiter({ max: 30, windowMs: TEN_MIN })
export const potmLimiter = createLimiter({ max: 30, windowMs: TEN_MIN })
export const reactLimiter = createLimiter({ max: 40, windowMs: TEN_MIN })
export const predictionLimiter = createLimiter({ max: 40, windowMs: TEN_MIN })
