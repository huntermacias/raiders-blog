// Stat catalog entries that exist only in method v2's data. They are merged into STAT (playersKit.ts) only when the site runs on v2
// (NEXT_PUBLIC_LAB_METHOD=v2), so production on v1 keeps exactly the boards and pages it has today.
import type { PlayerGroup, StatInfo } from "../playersKit"
import { pct0, pct1 } from "./fmt"

const EPA = "Expected points added: how many points the play added to (or took from) the offense's scoring chances, given the down, the distance and the field position."
const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`
const yds1 = (v: number) => `${v.toFixed(1)} yds`
const TRACK = "Next Gen Stats, measured on targeted plays at the moment the pass arrives."

const success: StatInfo = { label: "Success rate", short: "Success", path: "success-rate", what: "How often a target gains enough to keep the offense on schedule: about 40% of the yards needed on first down, 60% on second, all of them on third and fourth. It repeats better than EPA per target, because a few long plays swing EPA.", box: "Receiving yards cannot tell a gain that helped from one that did not.", fmt: pct0, higher: true, per: "targets" }
const firstDown: StatInfo = { label: "First downs per target", short: "1st downs", path: "first-downs-per-target", what: "The share of his targets that end in a first down or a touchdown.", box: "First downs are counted, but never against how often he was targeted.", fmt: pct0, higher: true, per: "targets" }
const targetShare: StatInfo = { label: "Share of the team's passes", short: "Target share", path: "target-share", what: "The portion of his team's pass attempts that were thrown to him, in the games he was targeted. It shows how much the offense uses him in the passing game, not how well he plays.", box: "Targets and receptions do not say how big the offense's passing game was.", fmt: pct0, higher: null, per: "targets", lean: ["is rarely a target", "is a regular target"] }
const catchRate: StatInfo = { label: "Catch rate", short: "Catch %", path: "catch-rate", what: "The share of his targets he catches. It describes the kind of targets he gets as much as his hands, so it is shown, not graded.", box: "Receptions without targets cannot say how often he was open and missed.", fmt: pct0, higher: null, per: "targets", lean: ["gets hard targets", "gets easy targets"] }
const sep: StatInfo = { label: "Separation at the catch point", short: "Separation", path: "separation", what: `How far the nearest defender is from him when the pass arrives, on his targets only. ${TRACK} It describes how open the quarterback found him; it is not a measure of route running on every play.`, box: "Not in the box score.", fmt: yds1, higher: null, per: "targets", lean: ["is covered tightly", "is found open"] }
const cushion: StatInfo = { label: "Cushion at the snap", short: "Cushion", path: "cushion", what: `How far off him the defender lines up before the snap, on his targets only. ${TRACK}`, box: "Not in the box score.", fmt: yds1, higher: null, per: "targets", lean: ["gets pressed", "gets a big cushion"] }

export const V2_EXTRA: Partial<Record<PlayerGroup, Record<string, StatInfo>>> = {
	qb: {
		epaRun: { label: "EPA per designed run", short: "EPA/run", path: "epa-per-designed-run", what: `${EPA} Only his designed runs; scrambles are part of his dropbacks.`, box: "Rushing yards ignore down and distance.", fmt: (v) => signed(v, 2), higher: true, per: "designed runs", counts: false },
		scrRate: { label: "Scrambles", short: "Scrambles", path: "scrambles", what: "How often a dropback ends with him running because nobody was open. It describes how he plays.", box: "Scrambles are mixed into rushing totals.", fmt: pct1, higher: null, per: "dropbacks", lean: ["rarely scrambles", "scrambles often"], part: "scrambles" },
		runRate: { label: "Designed runs", short: "Designed runs", path: "designed-runs", what: "Designed quarterback runs as a share of his plays (a read option or a sneak, not a scramble).", box: "Hidden inside his rushing totals.", fmt: pct1, higher: null, per: "plays", lean: ["rarely runs by design", "runs by design often"], part: "designed runs" },
		ttt: { label: "Time to throw", short: "Time to throw", path: "time-to-throw", what: "Seconds from the snap to the throw. Next Gen Stats. It describes the offense and the pressure as much as him, so it is shown, not graded.", box: "Not in the box score.", fmt: (v) => `${v.toFixed(2)} s`, higher: null, per: "throws", lean: ["gets it out fast", "holds it longer"] },
		aggr: { label: "Tight-window throws", short: "Tight window", path: "tight-window-throws", what: "The share of his throws into a window where a defender is within a yard of the receiver. Next Gen Stats. A style, not a skill.", box: "Not in the box score.", fmt: (v) => `${v.toFixed(1)}%`, higher: null, per: "throws", lean: ["throws to open receivers", "throws into tight windows"] },
	},
	rb: {
		ryoe: { label: "Rushing yards over expected", short: "RYOE/carry", path: "rushing-yards-over-expected", what: "Yards per carry beyond what the tracking data expected from where the defense stood. Next Gen Stats lists only some carries, so each number says how many it covers. It is shown as an observed number and not graded: it repeats poorly from one season to the next.", box: "Rushing yards credit the line and the back alike.", fmt: (v) => signed(v, 2), higher: true, per: "tracked carries", counts: false },
		recEpaTgt: { label: "EPA per target as a receiver", short: "Rec EPA/tgt", path: "receiving-epa-per-target", what: `${EPA} His targets in the passing game, kept beside his carries.`, box: "Receiving yards ignore down and distance.", fmt: (v) => signed(v, 2), higher: true, per: "targets", counts: false },
		touchEpa: { label: "EPA per touch", short: "EPA/touch", path: "epa-per-touch", what: `${EPA} Carries and catches together.`, box: "Yards from scrimmage ignore down and distance.", fmt: (v) => signed(v, 2), higher: true, per: "touches", counts: false },
		eightBox: { label: "Runs into eight in the box", short: "8+ in box", path: "runs-into-eight-in-the-box", what: "The share of his tracked carries run against eight or more defenders near the line. A sign of how defenses treat the run game around him.", box: "Not in the box score.", fmt: pct0, higher: null, per: "tracked carries", lean: ["sees light boxes", "sees stacked boxes"] },
		tgtShare: { label: "Share of the team's passes", short: "Target share", path: "target-share", what: "The portion of his team's pass attempts that were thrown to him. It shows how much the offense uses him in the passing game.", box: "Receptions ignore how often the team threw.", fmt: pct1, higher: null, per: "team attempts", lean: ["is rarely a target", "is a regular target"] },
	},
	// Target share describes how much the offense uses him, not how well he plays; v2 shows it and does not rank it (v1 graded it).
	wr: { success, firstDown, catchRate, sep, cushion, share: targetShare },
	te: { success, firstDown, catchRate, sep, cushion, share: targetShare },
	lb: {
		compPct: { label: "Completion rate allowed", short: "Comp % against", path: "completion-rate-allowed", what: "The share of passes thrown at him that are completed. Fewer is better.", box: "Not in the box score.", fmt: pct0, higher: false, per: "targets" },
		tgtRate: { label: "Targets per 100 snaps", short: "Targets/100", path: "targets-per-100-snaps", what: "How often the ball is thrown at him, for every 100 snaps. A role, not a grade.", box: "Not in the box score.", fmt: (v) => v.toFixed(1), higher: null, per: "snaps", lean: ["is rarely tested", "is tested often"] },
	},
	cb: {
		intRate: { label: "Interceptions per target", short: "INT/target", path: "interceptions-per-target", what: "How often a pass thrown at him is intercepted. Rare, so it is shown with the plays behind it and left out of any overall read.", box: "Interceptions are counted, but never against how often he was tested.", fmt: pct1, higher: true, per: "targets", counts: false },
		tgtRate: { label: "Targets per 100 snaps", short: "Targets/100", path: "targets-per-100-snaps", what: "How often the ball is thrown at him, for every 100 snaps. A role, not a grade.", box: "Not in the box score.", fmt: (v) => v.toFixed(1), higher: null, per: "snaps", lean: ["is rarely tested", "is tested often"] },
	},
	saf: {
		intRate: { label: "Interceptions per target", short: "INT/target", path: "interceptions-per-target", what: "How often a pass thrown at him is intercepted. Rare, so it is shown with the plays behind it and left out of any overall read.", box: "Interceptions are counted, but never against how often he was tested.", fmt: pct1, higher: true, per: "targets", counts: false },
		tgtRate: { label: "Targets per 100 snaps", short: "Targets/100", path: "targets-per-100-snaps", what: "How often the ball is thrown at him, for every 100 snaps. A role, not a grade.", box: "Not in the box score.", fmt: (v) => v.toFixed(1), higher: null, per: "snaps", lean: ["is rarely tested", "is tested often"] },
	},
}
