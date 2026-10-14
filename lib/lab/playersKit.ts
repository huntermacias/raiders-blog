// Player pages: every qualifying player in the league, measured against the players who do his job.
//
// scripts/lab/build_players.py grades each player on a handful of stats for his position, in three slices of games: the whole season,
// his team's last two games ("form") and the games before that ("earlier"). Every number comes with its rank among the players who
// qualify, a standard error that says how much a handful of plays could be moving it, and the league's yardstick (what the 10th,
// 25th, 50th, 75th and 90th best players look like). This file turns that into words and lists, so a number is never shown alone.
// Pure functions of the data they are handed; like unitsKit.ts it imports no data, so the server, the browser and the tests share it.

import { ordinal } from "./unitsKit"

export { ordinal }

export type PlayerGroup = "qb" | "rb" | "wr" | "te" | "ol" | "edge" | "idl" | "lb" | "cb" | "saf" | "k" | "p" | "pr" | "kr"
export type Side = "offense" | "defense" | "special"
export type Slice = {
	v: number
	n: number
	se?: number | null
	g?: number | null
	r?: number | null
	/** The stabilized value the grade and rank are made on. */
	a?: number | null
	/**
	 * Only when his earlier seasons are part of the grade: `hn` is the plays they add, `rl` how much of the league's spread in true level
	 * the number now pins down (0 to 1), `pe` how far from his true level it could still be, in the stat's own units.
	 */
	hn?: number
	rl?: number
	pe?: number
}
export type PlayerStat = { k: string; season: Slice; form: Slice | null; earlier: Slice | null; delta?: number; z?: number }
export type Mover = { score: number; driver: string; stats: number; agree: number; z?: number }
/** [mean share of the team's snaps, games played, games counted]. A game he missed is a zero in the share; the other two say so. */
export type SnapLine = [number, number, number] | null
export type PlayerRow = {
	id: string
	slug: string
	name: string
	team: string
	pos: string
	group: PlayerGroup
	games: number
	snaps: { season: SnapLine; form: SnapLine; earlier: SnapLine }
	stats: PlayerStat[]
	mover: Mover | null
	box: Record<string, number>
	like: string[]
	/** His ESPN id, which is all that is needed to find his headshot. */
	espn?: number
	/** The league's own headshot id, for a player with no ESPN id (most offensive linemen). */
	shot?: string
}
/** `rel` is the share of the differences between players on this stat that is real rather than luck so far (0 to 1); style stats have none. */
export type Yard = { n: number; mean: number; sd: number; q: [number, number, number, number, number]; rel?: number }
export type PlayersData = {
	season: number
	/** The earlier seasons this season's grades start from, when the builder had a history file. */
	priorSeasons?: number[]
	week: number
	team: string
	generatedAt: string
	source: string
	formGames: number
	weeks: number[]
	formWeeks: number[]
	defFormWeeks: number[]
	defWeek: number
	leagueN: Partial<Record<PlayerGroup, number>>
	opp: Record<string, Record<string, string>>
	yard: Partial<Record<PlayerGroup, Record<string, Yard>>>
	players: PlayerRow[]
}
/** [week, that game's value, plays behind it, season-to-date percentile after that week (100 is best) or null]. */
export type LogPoint = [number, number, number, number | null]
export type PlayerLog = { g: Record<string, LogPoint[]>; t?: Record<string, string>; s?: [number, number][]; b?: Record<string, [number, number][]> }
/** What the roster file says about a person: jersey number, height in inches, weight in pounds, birth date, college, [drafting club, overall pick, year], years of experience. */
export type PlayerBio = { no?: number; ht?: number; wt?: number; born?: string; college?: string; draft?: [string, number, number | null]; exp?: number }
/** For one stat: how often a team won when its player's number was in the worst, middle and best third of games league-wide, and how many games that is. */
export type WinSplit = { n: number; t: [number, number, number] }
export type PlayerLogs = {
	season: number
	week: number
	generatedAt: string
	logs: Record<string, Partial<Record<PlayerGroup, PlayerLog>>>
	bio: Record<string, PlayerBio>
	/** {team: {week: [points for, points against]}} */
	res: Record<string, Record<string, [number, number]>>
	win: Partial<Record<PlayerGroup, Record<string, WinSplit>>>
}

export const GROUP_ORDER: PlayerGroup[] = ["qb", "rb", "wr", "te", "ol", "edge", "idl", "lb", "cb", "saf", "k", "p", "pr", "kr"]
export const SIDES: { id: Side; title: string; groups: PlayerGroup[] }[] = [
	{ id: "offense", title: "Offense", groups: ["qb", "rb", "wr", "te", "ol"] },
	{ id: "defense", title: "Defense", groups: ["edge", "idl", "lb", "cb", "saf"] },
	{ id: "special", title: "Special teams", groups: ["k", "p", "pr", "kr"] },
]
export type GroupMeta = {
	title: string
	single: string
	peers: string
	side: Side
	/** What it takes to be graded, in the words a reader would use. Mirrors the volume constants in build_players.py. */
	need: string
	blurb: string
}
export const GROUP_META: Record<PlayerGroup, GroupMeta> = {
	qb: { title: "Quarterbacks", single: "Quarterback", peers: "quarterbacks", side: "offense", need: "40 dropbacks", blurb: "Efficiency on every dropback, accuracy against the difficulty of the throw, and the style of the offense he runs." },
	rb: { title: "Running backs", single: "Running back", peers: "running backs", side: "offense", need: "20 carries", blurb: "Points added per carry, the yards he makes himself after contact, and where the offense runs him." },
	wr: { title: "Wide receivers", single: "Wide receiver", peers: "wide receivers", side: "offense", need: "12 targets", blurb: "Points added per target, catches beyond what the throw allowed, yards after the catch, and how he is used." },
	ol: { title: "Offensive linemen", single: "Offensive lineman", peers: "offensive linemen", side: "offense", need: "150 snaps", blurb: "No public data credits one lineman with a block, so this is what exists: how often he is flagged, and how his whole line does in the games he starts. The line's numbers are shared by the five who start together." },
	te: { title: "Tight ends", single: "Tight end", peers: "tight ends", side: "offense", need: "12 targets", blurb: "The same receiving numbers as wide receivers, graded against other tight ends only." },
	edge: { title: "Edge rushers", single: "Edge rusher", peers: "edge rushers", side: "defense", need: "80 snaps", blurb: "Pressures, sacks and tackles for loss per snap, which says more about a pass rusher than a sack total." },
	idl: { title: "Interior linemen", single: "Interior lineman", peers: "interior linemen", side: "defense", need: "80 snaps", blurb: "Pressure and disruption from the tackles and nose tackles, graded against the inside rushers who play beside them." },
	lb: { title: "Linebackers", single: "Linebacker", peers: "linebackers", side: "defense", need: "10 tackle chances", blurb: "Tackling, disruption and what happens when he covers." },
	cb: { title: "Cornerbacks", single: "Cornerback", peers: "cornerbacks", side: "defense", need: "10 targets", blurb: "What happens when the ball is thrown at him: yards, completions, passer rating and plays on the ball." },
	saf: { title: "Safeties", single: "Safety", peers: "safeties", side: "defense", need: "10 targets", blurb: "Coverage and tackling from the back of the defense, graded against other safeties." },
	k: { title: "Kickers", single: "Kicker", peers: "kickers", side: "special", need: "6 field goal tries", blurb: "Field goals judged by how hard the kicks were, extra points and kickoffs." },
	p: { title: "Punters", single: "Punter", peers: "punters", side: "special", need: "8 punts", blurb: "Field position added per punt, net yards and how often he pins the offense inside the 20." },
	pr: { title: "Punt returners", single: "Punt returner", peers: "punt returners", side: "special", need: "5 punts fielded", blurb: "Points added each time he fields a punt." },
	kr: { title: "Kick returners", single: "Kick returner", peers: "kick returners", side: "special", need: "5 returns", blurb: "Points added and yards gained on kickoff returns." },
}

// ---------------------------------------------------------------------------------------------- the stats

const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`
const pct0 = (v: number) => `${(v * 100).toFixed(0)}%`
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
const yds1 = (v: number) => `${v.toFixed(1)} yds`

export type StatInfo = {
	label: string
	/** A shorter label for table headers. */
	short: string
	/** A url piece, unique within a group. */
	path: string
	/** Plain English: what it counts and what a given value means. */
	what: string
	/** What the box score shows instead, and why it falls short. */
	box: string
	fmt: (v: number) => string
	/** True when more is better, false when less is better, null when it only describes a style. Mirrors build_players.py. */
	higher: boolean | null
	/** What the number is out of, for "(13 targets)". */
	per: string
	/** False when the stat is graded but left out of the mover score, the overall grade, the ladders and the badges, because it is mostly zeros or belongs to his whole line, not to him. */
	counts?: boolean
	/** For a style stat: what a low value and a high value say about how he plays. */
	lean?: [string, string]
	/** True when the number belongs to his whole unit (an offensive line's sack rate), so every lineman who starts beside him shares it. */
	unit?: true
	/** For a style stat that is a share of something he does, what the share counts, so it reads "12 tries, 1 of them from 50+ yards". */
	part?: string
}

const EPA = "Expected points added: how many points the play added to (or took from) the offense's scoring chances, given the down, the distance and the field position."

const QB: Record<string, StatInfo> = {
	epaDb: { label: "EPA per dropback", short: "EPA/dropback", path: "epa-per-dropback", what: `${EPA} Sacks, scrambles and throwaways all count, so it is everything he does when he drops back, not just the completions.`, box: "Passing yards and touchdowns ignore down, distance and sacks, so a 6-yard checkdown on 3rd-and-12 looks like a good play.", fmt: (v) => signed(v, 2), higher: true, per: "dropbacks" },
	success: { label: "Success rate", short: "Success", path: "success-rate", what: "How often a dropback gains enough to keep the offense on schedule: about 40% of the yards needed on first down, 60% on second, all of them on third and fourth.", box: "Yards per attempt cannot tell a gain that helped from one that did not.", fmt: pct0, higher: true, per: "dropbacks" },
	cpoe: { label: "Accuracy over expected", short: "CPOE", path: "accuracy-over-expected", what: "His completion rate compared with what each throw was expected to be, given depth, pressure and where the receiver was. +3 means he completes 3 more of every 100 throws than an average passer would on the same throws.", box: "Completion percentage rewards the quarterback who throws short and punishes the one who throws deep.", fmt: (v) => `${signed(v, 1)} pts`, higher: true, per: "throws" },
	badThrow: { label: "Bad throws", short: "Bad throws", path: "bad-throws", what: "The share of his attempts that Pro Football Reference's charters called a bad throw: off target, not just incomplete. Fewer is better.", box: "An incompletion also blames him for a drop or a throwaway.", fmt: pct1, higher: false, per: "attempts" },
	sackRate: { label: "Sack rate", short: "Sack rate", path: "sack-rate", what: "Sacks as a share of his dropbacks. It is the quarterback and the line together. Fewer is better.", box: "A sack total depends on how often he drops back.", fmt: pct1, higher: false, per: "dropbacks", counts: false },
	adot: { label: "Average depth of throw", short: "Depth", path: "average-depth-of-throw", what: "How far past the line of scrimmage the ball travels, on average. It is a style, not a skill.", box: "Yards per attempt blends depth with everything else.", fmt: yds1, higher: null, per: "throws", lean: ["throws it short", "throws it deep"] },
	deepRate: { label: "Deep throws", short: "Deep %", path: "deep-throws", what: "The share of his throws that travel 20 or more yards in the air.", box: "A long touchdown looks the same however rarely he tries it.", fmt: pct0, higher: null, per: "throws", lean: ["rarely throws deep", "throws deep often"], part: "20+ yards in the air" },
	paRate: { label: "Play-action dropbacks", short: "Play-action", path: "play-action", what: "How often a dropback starts with a fake handoff.", box: "The box score does not record the fake.", fmt: pct0, higher: null, per: "dropbacks", lean: ["rarely uses play-action", "leans on play-action"], part: "off a play-action fake" },
	blitzSeen: { label: "Blitzed", short: "Blitzed", path: "blitzed", what: "How often defenses send an extra rusher at him.", box: "Not in the box score.", fmt: pct0, higher: null, per: "dropbacks", lean: ["is rarely blitzed", "is blitzed often"], part: "against a blitz" },
	oopRate: { label: "Leaves the pocket", short: "Off-platform", path: "leaves-the-pocket", what: "How often he is outside the pocket when he throws or is sacked.", box: "Not in the box score.", fmt: pct0, higher: null, per: "dropbacks", lean: ["stays in the pocket", "plays outside the pocket"], part: "outside the pocket" },
}

const RB: Record<string, StatInfo> = {
	epaRush: { label: "EPA per carry", short: "EPA/carry", path: "epa-per-carry", what: `${EPA} A 4-yard run on 3rd-and-8 loses points even though it gains yards.`, box: "Yards per carry credits a 5-yard run on 3rd-and-15 and ignores the goal-line carry that scores.", fmt: (v) => signed(v, 2), higher: true, per: "carries" },
	success: { label: "Success rate", short: "Success", path: "success-rate", what: "How often a carry gains enough to keep the offense on schedule.", box: "Rushing yards pile up on carries that did not help.", fmt: pct0, higher: true, per: "carries" },
	explosive: { label: "Explosive runs", short: "10+ yd runs", path: "explosive-runs", what: "The share of his carries that go 10 yards or more.", box: "A long run is in the yardage total but its frequency is not.", fmt: pct1, higher: true, per: "carries" },
	yco: { label: "Yards after contact", short: "YAC/carry", path: "yards-after-contact", what: "Yards he gains per carry after the first defender touches him. The blockers have done their job by then; this part is the back.", box: "Rushing yards credit the line and the back alike.", fmt: yds1, higher: true, per: "carries" },
	broken: { label: "Broken tackles", short: "Broken/100", path: "broken-tackles", what: "Tackles he breaks per 100 carries, as charted by Pro Football Reference.", box: "A broken tackle is not recorded anywhere in the box score.", fmt: (v) => `${(v * 100).toFixed(1)} per 100`, higher: true, per: "carries" },
	stuffRate: { label: "Stuffed runs", short: "Stuffed", path: "stuffed-runs", what: "The share of his carries that gain nothing or lose yards. Fewer is better, and the line shares the blame.", box: "Hidden inside the yards per carry.", fmt: pct0, higher: false, per: "carries", counts: false },
	ybc: { label: "Yards before contact", short: "Yds before", path: "yards-before-contact", what: "Yards per carry before a defender touches him. That is mostly the line and the scheme, so it is shown, not graded.", box: "Not in the box score.", fmt: yds1, higher: null, per: "carries", lean: ["gets little room", "gets big lanes"] },
	edgeRate: { label: "Runs to the edge", short: "Edge runs", path: "runs-to-the-edge", what: "The share of his carries run around the end instead of between the tackles.", box: "Not in the box score.", fmt: pct0, higher: null, per: "carries", lean: ["runs between the tackles", "gets to the edge"], part: "around the edge" },
	gunRate: { label: "Carries from shotgun", short: "Shotgun", path: "shotgun-carries", what: "The share of his carries that start with the quarterback in shotgun, a sign of what kind of run game he lives in.", box: "Not in the box score.", fmt: pct0, higher: null, per: "carries", lean: ["runs from under center", "runs from shotgun"], part: "from shotgun" },
}

const REC: Record<string, StatInfo> = {
	epaTgt: { label: "EPA per target", short: "EPA/target", path: "epa-per-target", what: `${EPA} Every target counts, caught or not, so a receiver cannot hide behind a catch total.`, box: "Receiving yards rise with targets, not with what the targets were worth.", fmt: (v) => signed(v, 2), higher: true, per: "targets" },
	croe: { label: "Catches over expected", short: "CROE", path: "catches-over-expected", what: "His catch rate compared with what each target's difficulty predicted. +4 means he catches 4 more of every 100 targets than the throws suggested.", box: "Catch rate rewards the receiver who is only thrown easy passes.", fmt: (v) => `${signed(v * 100, 1)} pts`, higher: true, per: "targets" },
	yacOe: { label: "Yards after catch over expected", short: "YAC over exp.", path: "yards-after-catch-over-expected", what: "The yards he gains after the catch compared with what a typical receiver gets from that spot. It separates the player who makes defenders miss from the one who is simply open.", box: "Yards after the catch is a total, not a comparison with where he caught it.", fmt: (v) => `${signed(v, 1)} yds`, higher: true, per: "catches" },
	drop: { label: "Drop rate", short: "Drops", path: "drop-rate", what: "Passes Pro Football Reference's charters called drops, per target. A drop is a judgment call, so other trackers can count a different number for the same player. Only games PFR has posted are counted. Fewer is better. Almost everyone has few, so it is shown but not counted in his overall grade.", box: "Drops are not an official stat.", fmt: pct1, higher: false, per: "targets", counts: false },
	share: { label: "Share of the team's passes", short: "Target share", path: "target-share", what: "The portion of his team's pass attempts that were thrown to him, in the games he was targeted. It shows whether he is the focus of the offense.", box: "Targets and receptions do not say how big the offense's passing game was.", fmt: pct0, higher: true, per: "targets" },
	adot: { label: "Average depth of target", short: "Depth", path: "average-depth-of-target", what: "How far downfield his targets are, on average. It is a role, not a grade.", box: "Receiving yards blend depth with everything else.", fmt: yds1, higher: null, per: "targets", lean: ["works the short game", "works downfield"] },
	deepRate: { label: "Deep targets", short: "Deep %", path: "deep-targets", what: "The share of his targets that are 20 or more yards downfield.", box: "Not in the box score.", fmt: pct0, higher: null, per: "targets", lean: ["rarely goes deep", "goes deep often"], part: "20+ yards downfield" },
	contested: { label: "Contested targets", short: "Contested", path: "contested-targets", what: "The share of his targets charted as contested: a defender is on him at the catch point. It says how he is used, not whether he wins.", box: "Not in the box score.", fmt: pct0, higher: null, per: "targets", lean: ["gets targeted in open space", "gets targeted in tight coverage"], part: "contested" },
	screen: { label: "Screen targets", short: "Screens", path: "screen-targets", what: "The share of his targets that are screen passes, a sign his yards come from the offense's design.", box: "Not in the box score.", fmt: pct0, higher: null, per: "targets", lean: ["is rarely a screen target", "is a screen target often"], part: "screens" },
}

const EDGE: Record<string, StatInfo> = {
	pressRate: { label: "Pressures per 100 snaps", short: "Pressures/100", path: "pressures-per-100-snaps", what: "Sacks, hits and hurries as Pro Football Reference charts them, for every 100 snaps he plays. A pass rusher is doing his job on plays that never become a sack.", box: "A sack total misses most of what a rusher does and depends on how many snaps he plays.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps" },
	sackRate: { label: "Sacks per 100 snaps", short: "Sacks/100", path: "sacks-per-100-snaps", what: "Sacks for every 100 snaps he plays. Rare, so it swings fast; pressures are the steadier read.", box: "A sack total ignores how many snaps he played.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps", counts: false },
	tflRate: { label: "Tackles for loss per 100 snaps", short: "TFL/100", path: "tackles-for-loss-per-100-snaps", what: "Plays he ends behind the line of scrimmage, for every 100 snaps.", box: "Tackles for loss are counted, but never against the snaps he played.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps" },
	missedPct: { label: "Missed tackle rate", short: "Missed", path: "missed-tackles", what: "The share of his tackle chances he missed. Fewer is better.", box: "Tackle totals reward the player who gets the most chances, not the one who finishes them.", fmt: pct0, higher: false, per: "tackle chances" },
}

const LB: Record<string, StatInfo> = {
	missedPct: { label: "Missed tackle rate", short: "Missed", path: "missed-tackles", what: "The share of his tackle chances he missed. Fewer is better.", box: "Tackle totals reward the player who gets the most chances, not the one who finishes them.", fmt: pct0, higher: false, per: "tackle chances" },
	tackleRate: { label: "Tackles per 100 snaps", short: "Tackles/100", path: "tackles-per-100-snaps", what: "Tackles for every 100 snaps he plays. It shows how often the ball is finding him, which is partly the scheme.", box: "A tackle total ignores snaps.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps" },
	tflRate: { label: "Tackles for loss per 100 snaps", short: "TFL/100", path: "tackles-for-loss-per-100-snaps", what: "Plays he ends behind the line of scrimmage, for every 100 snaps.", box: "Tackles for loss are counted, but never against the snaps he played.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps" },
	pressRate: { label: "Pressures per 100 snaps", short: "Pressures/100", path: "pressures-per-100-snaps", what: "How often he gets after the quarterback, for every 100 snaps. For a linebacker it describes his job more than his quality, so it is shown, not graded.", box: "Not in the box score.", fmt: (v) => v.toFixed(1), higher: null, per: "snaps", lean: ["stays home", "rushes often"] },
	yardsTgt: { label: "Yards allowed per target", short: "Yds/target", path: "yards-allowed-per-target", what: "The yards the receiver he is covering gets each time he is targeted. Fewer is better.", box: "Coverage is not in the box score.", fmt: (v) => v.toFixed(1), higher: false, per: "targets" },
}

const DB: Record<string, StatInfo> = {
	yardsTgt: { label: "Yards allowed per target", short: "Yds/target", path: "yards-allowed-per-target", what: "The yards the receiver he is covering gets each time he is targeted. Fewer is better.", box: "Interceptions are rare and say little about the hundred plays where he is just covering.", fmt: (v) => v.toFixed(1), higher: false, per: "targets" },
	rating: { label: "Passer rating allowed", short: "Rating against", path: "passer-rating-allowed", what: "The passer rating of quarterbacks throwing at him. 158.3 is perfect for the passer, so lower is better for the defender.", box: "Not in the box score.", fmt: (v) => v.toFixed(0), higher: false, per: "targets" },
	compPct: { label: "Completion rate allowed", short: "Comp % against", path: "completion-rate-allowed", what: "The share of passes thrown at him that are completed. Fewer is better.", box: "Not in the box score.", fmt: pct0, higher: false, per: "targets" },
	pbuRate: { label: "Passes defended per target", short: "PBU/target", path: "passes-defended-per-target", what: "How often a pass thrown at him ends with him breaking it up. A cornerback does this far more often than he intercepts.", box: "Passes defended are counted, but never against how often he was tested.", fmt: pct0, higher: true, per: "targets" },
	missedPct: { label: "Missed tackle rate", short: "Missed", path: "missed-tackles", what: "The share of his tackle chances he missed. Fewer is better.", box: "Tackle totals reward the player who gets the most chances, not the one who finishes them.", fmt: pct0, higher: false, per: "tackle chances" },
	adotAgainst: { label: "Depth of passes at him", short: "Depth against", path: "depth-of-passes-against", what: "How far downfield the passes thrown at him travel on average. It shows whether he is tested deep or underneath, which is a role, not a grade.", box: "Not in the box score.", fmt: yds1, higher: null, per: "targets", lean: ["is thrown at underneath", "is tested deep"] },
}

const KICK: Record<string, StatInfo> = {
	fgOe: { label: "Field goals over expected", short: "FG over exp.", path: "field-goals-over-expected", what: "His field goal percentage compared with what the distances he kicked from predict. +10 means he makes 10 more of every 100 kicks than an average kicker from those same spots.", box: "Field goal percentage rewards the kicker whose coach only sends him out from 30 yards.", fmt: (v) => `${signed(v, 1)} pts`, higher: true, per: "tries" },
	fgPct: { label: "Field goal percentage", short: "FG %", path: "field-goal-percentage", what: "Field goals made over tries. It is the box score number, shown for comparison; it depends heavily on where he is asked to kick from.", box: "This is the box score number.", fmt: pct0, higher: true, per: "tries", counts: false },
	xpPct: { label: "Extra point percentage", short: "XP %", path: "extra-point-percentage", what: "Extra points made over tries. Nearly everyone makes nearly all of them, so it is shown but not counted in his overall grade.", box: "This is the box score number.", fmt: pct0, higher: true, per: "tries", counts: false },
	koEpa: { label: "EPA per kickoff", short: "Kickoff EPA", path: "epa-per-kickoff", what: `${EPA} Measured from the kicking team's side, so a higher number means his kickoffs leave the opponent with a worse start.`, box: "Touchbacks are counted, but not what the kick was worth.", fmt: (v) => signed(v, 2), higher: true, per: "kickoffs" },
	fgDist: { label: "Average try distance", short: "Distance", path: "average-try-distance", what: "The average length of his field goal tries. It shows how far his coaches trust him, which is a role, not a grade.", box: "Not in the box score.", fmt: yds1, higher: null, per: "tries", lean: ["kicks from close in", "is trusted from long range"] },
	longRate: { label: "Tries from 50+", short: "50+ tries", path: "tries-from-50", what: "The share of his field goal tries from 50 yards or more.", box: "Not in the box score.", fmt: pct0, higher: null, per: "tries", lean: ["rarely kicks from long range", "is sent out from 50+ often"], part: "from 50+ yards" },
	koTb: { label: "Kickoff touchbacks", short: "Touchbacks", path: "kickoff-touchbacks", what: "The share of his kickoffs that are touchbacks.", box: "Counted, but without saying what the alternative was worth.", fmt: pct0, higher: null, per: "kickoffs", lean: ["kicks to the field", "kicks it out of the end zone"], part: "touchbacks" },
}

const PUNT: Record<string, StatInfo> = {
	epaPunt: { label: "EPA per punt", short: "EPA/punt", path: "epa-per-punt", what: `${EPA} From the punting team's side: a punt that pins the offense deep adds points, a short punt gives them up.`, box: "Punting average ignores the return, the touchback and where the punt was kicked from.", fmt: (v) => signed(v, 2), higher: true, per: "punts" },
	net: { label: "Net yards per punt", short: "Net yds", path: "net-yards-per-punt", what: "Punt distance minus the return, with 20 yards taken off for a touchback.", box: "Gross average counts yards the returner takes back.", fmt: yds1, higher: true, per: "punts" },
	in20: { label: "Punts inside the 20", short: "Inside 20", path: "punts-inside-the-20", what: "The share of his punts that land inside the 20-yard line.", box: "Counted, but not against how many punts were close enough to try.", fmt: pct0, higher: true, per: "punts" },
	tbRate: { label: "Touchbacks", short: "Touchbacks", path: "punt-touchbacks", what: "The share of his punts that are touchbacks, which waste the distance. Fewer is better.", box: "Counted, but not against attempts.", fmt: pct0, higher: false, per: "punts" },
	gross: { label: "Gross punt average", short: "Gross", path: "gross-punt-average", what: "Average punt distance before the return. It is the box score number, shown beside net yards for comparison.", box: "This is the box score number.", fmt: yds1, higher: null, per: "punts", lean: ["kicks shorter", "kicks longer"] },
	fcRate: { label: "Fair catches", short: "Fair catch", path: "fair-catches", what: "The share of his punts that are fair caught, a sign of directional kicking and hang time.", box: "Not in the box score.", fmt: pct0, higher: null, per: "punts", lean: ["lets returners run", "forces fair catches"], part: "fair caught" },
}

const PRET: Record<string, StatInfo> = {
	epaRet: { label: "EPA per punt fielded", short: "EPA/punt", path: "epa-per-punt-fielded", what: `${EPA} From his team's side, for every punt he fields, fair catches included.`, box: "Return average ignores fair catches and the starting field position.", fmt: (v) => signed(v, 2), higher: true, per: "punts" },
	retAvg: { label: "Yards per return", short: "Yds/return", path: "yards-per-return", what: "Average yards when he returns the punt (fair catches excluded).", box: "This is the box score number.", fmt: yds1, higher: true, per: "returns" },
	fcRate: { label: "Fair catch rate", short: "Fair catch", path: "fair-catch-rate", what: "How often he fair catches instead of returning, a choice about risk.", box: "Not in the box score.", fmt: pct0, higher: null, per: "punts", lean: ["returns almost everything", "fair catches often"], part: "fair caught" },
}

const KRET: Record<string, StatInfo> = {
	epaRet: { label: "EPA per return", short: "EPA/return", path: "epa-per-return", what: `${EPA} From his team's side, for each kickoff he returns.`, box: "Return average ignores the starting field position the team would have had anyway.", fmt: (v) => signed(v, 2), higher: true, per: "returns" },
	retAvg: { label: "Yards per return", short: "Yds/return", path: "yards-per-return", what: "Average yards per kickoff return.", box: "This is the box score number.", fmt: yds1, higher: true, per: "returns" },
}

const OL: Record<string, StatInfo> = {
	runSucc: { label: "Line run success", short: "Line runs", path: "line-run-success", what: "How often the team's designed runs gain enough to keep the offense on schedule, in the games he started. It is the line, the backs and the scheme together, and the five linemen who start together share it.", box: "Team rushing yards ignore the down and the distance.", fmt: pct0, higher: true, per: "runs", unit: true, counts: false },
	sackRate: { label: "Sacks allowed by his line", short: "Line sack rate", path: "line-sack-rate", what: "Sacks as a share of the team's dropbacks in the games he started. It is the line and the quarterback together, and every lineman who starts beside him shares it. Fewer is better.", box: "No sack is charged to a single lineman in the box score.", fmt: pct1, higher: false, per: "dropbacks", unit: true, counts: false },
	penRate: { label: "Penalties per 1,000 snaps", short: "Penalties/1,000", path: "penalties-per-1000-snaps", what: "Accepted penalties called on him (holding, false starts and the rest) for every 1,000 snaps he plays. Fewer is better.", box: "A season total is bigger for the lineman who simply played more snaps.", fmt: (v) => v.toFixed(1), higher: false, per: "snaps" },
	holdRate: { label: "Holding per 1,000 snaps", short: "Holding/1,000", path: "holding-per-1000-snaps", what: "Offensive holding penalties for every 1,000 snaps. It is part of the penalty rate, shown on its own because holding is the penalty that blocking causes. Fewer is better.", box: "A season total is bigger for the lineman who simply played more snaps.", fmt: (v) => v.toFixed(1), higher: false, per: "snaps", counts: false },
	fsRate: { label: "False starts per 1,000 snaps", short: "False starts/1,000", path: "false-starts-per-1000-snaps", what: "False starts for every 1,000 snaps: a lapse in focus rather than in blocking. Fewer is better.", box: "A season total is bigger for the lineman who simply played more snaps.", fmt: (v) => v.toFixed(1), higher: false, per: "snaps", counts: false },
	snapShare: { label: "Share of snaps when he plays", short: "Snap share", path: "share-of-snaps", what: "The share of the offense's snaps he is on the field for in the games he plays. It says whether he is a full-time starter or a part of a rotation.", box: "Not in the box score.", fmt: pct0, higher: null, per: "snaps", lean: ["rotates in and out", "plays nearly every snap"] },
}

/** The stat catalogs, one per kind of job. build_players.py keeps the same keys, in the same groups. */
export const STAT_SETS = { QB, RB, OL, REC, EDGE, LB, DB, KICK, PUNT, PRET, KRET }
export const STAT: Record<PlayerGroup, Record<string, StatInfo>> = {
	qb: QB, rb: RB, wr: REC, te: REC, ol: OL, edge: EDGE, idl: EDGE, lb: LB, cb: DB, saf: DB, k: KICK, p: PUNT, pr: PRET, kr: KRET,
}
/** The stat a card, a leaderboard and the progression chart open on. Mirrors HEADLINE in build_players.py. */
export const HEADLINE: Record<PlayerGroup, string> = { qb: "epaDb", rb: "epaRush", wr: "epaTgt", te: "epaTgt", ol: "runSucc", edge: "pressRate", idl: "pressRate", lb: "missedPct", cb: "yardsTgt", saf: "yardsTgt", k: "fgOe", p: "epaPunt", pr: "epaRet", kr: "epaRet" }

/** `bad`: a total where more is worse (missed tackles, interceptions thrown, penalties). It still ranks most-first on its board, but it never earns a badge. */
export type BoxInfo = { label: string; short: string; path: string; fmt?: (v: number) => string; bad?: true }
const int = (v: number) => String(Math.round(v))
const DEF_BOX: Record<string, BoxInfo> = {
	tackles: { label: "Tackles", short: "Tkl", path: "tackles" },
	solo: { label: "Solo tackles", short: "Solo", path: "solo-tackles" },
	ast: { label: "Assisted tackles", short: "Ast", path: "assisted-tackles" },
	tfl: { label: "Tackles for loss", short: "TFL", path: "tackles-for-loss" },
	sacks: { label: "Sacks", short: "Sacks", path: "sacks", fmt: (v) => String(Math.round(v * 2) / 2) },
	press: { label: "Pressures", short: "Press", path: "pressures" },
	pbu: { label: "Passes defended", short: "PBU", path: "passes-defended" },
	ints: { label: "Interceptions", short: "Int", path: "interceptions" },
	missed: { label: "Missed tackles", short: "Missed", path: "missed-tackle-total", bad: true },
}
/** The box score, kept beside the advanced numbers so a reader can sort by either. Mirrors BOX in build_players.py. */
export const BOX: Record<PlayerGroup, Record<string, BoxInfo>> = {
	qb: { att: { label: "Pass attempts", short: "Att", path: "pass-attempts" }, cmp: { label: "Completions", short: "Cmp", path: "completions" }, yds: { label: "Passing yards", short: "Yds", path: "passing-yards" }, td: { label: "Passing touchdowns", short: "TD", path: "passing-touchdowns" }, int: { label: "Interceptions thrown", short: "Int", path: "interceptions-thrown", bad: true }, sacks: { label: "Times sacked", short: "Sacked", path: "times-sacked", bad: true } },
	rb: { car: { label: "Carries", short: "Car", path: "carries" }, yds: { label: "Rushing yards", short: "Yds", path: "rushing-yards" }, td: { label: "Rushing touchdowns", short: "TD", path: "rushing-touchdowns" } },
	wr: { tgt: { label: "Targets", short: "Tgt", path: "targets" }, rec: { label: "Receptions", short: "Rec", path: "receptions" }, yds: { label: "Receiving yards", short: "Yds", path: "receiving-yards" }, td: { label: "Receiving touchdowns", short: "TD", path: "receiving-touchdowns" } },
	te: { tgt: { label: "Targets", short: "Tgt", path: "targets" }, rec: { label: "Receptions", short: "Rec", path: "receptions" }, yds: { label: "Receiving yards", short: "Yds", path: "receiving-yards" }, td: { label: "Receiving touchdowns", short: "TD", path: "receiving-touchdowns" } },
	ol: { snaps: { label: "Offensive snaps", short: "Snaps", path: "offensive-snaps" }, gs: { label: "Games started", short: "GS", path: "games-started" }, pen: { label: "Penalties", short: "Pen", path: "penalties", bad: true }, hold: { label: "Holding penalties", short: "Hold", path: "holding-penalties", bad: true }, fs: { label: "False starts", short: "FS", path: "false-starts", bad: true } },
	edge: DEF_BOX, idl: DEF_BOX, lb: DEF_BOX, cb: DEF_BOX, saf: DEF_BOX,
	k: { fga: { label: "Field goal tries", short: "FGA", path: "field-goal-tries" }, fgm: { label: "Field goals made", short: "FGM", path: "field-goals-made" }, xpa: { label: "Extra point tries", short: "XPA", path: "extra-point-tries" }, xpm: { label: "Extra points made", short: "XPM", path: "extra-points-made" } },
	p: { punts: { label: "Punts", short: "Punts", path: "punts" }, in20: { label: "Punts inside the 20", short: "In 20", path: "punts-inside-20-total" } },
	pr: { rets: { label: "Punts fielded", short: "Fielded", path: "punts-fielded" }, yds: { label: "Return yards", short: "Yds", path: "return-yards" } },
	kr: { rets: { label: "Returns", short: "Ret", path: "returns" }, yds: { label: "Return yards", short: "Yds", path: "return-yards" } },
}

export function statInfo(group: PlayerGroup, key: string): StatInfo | null {
	return STAT[group]?.[key] ?? null
}

export function formatStat(group: PlayerGroup, key: string, v: number | null | undefined): string {
	if (v === null || v === undefined || Number.isNaN(v)) return "–"
	return statInfo(group, key)?.fmt(v) ?? String(v)
}

export function formatBox(group: PlayerGroup, key: string, v: number | null | undefined): string {
	if (v === null || v === undefined || Number.isNaN(v)) return "–"
	const f = BOX[group]?.[key]?.fmt ?? int
	return f(v)
}

/** "1 penalties" reads as a typo: the last word of a plural label goes singular when the count is one. */
export function countWord(n: number, label: string): string {
	if (n !== 1) return label
	return label.replace(/(\w+)$/, (w) => (/ies$/i.test(w) ? w.replace(/ies$/i, "y") : /(ss|us)$/i.test(w) ? w : /s$/i.test(w) ? w.slice(0, -1) : w))
}

export const isGraded = (group: PlayerGroup, key: string) => statInfo(group, key)?.higher !== null && statInfo(group, key) !== null
export const isCore = (group: PlayerGroup, key: string) => isGraded(group, key) && statInfo(group, key)?.counts !== false

// ---------------------------------------------------------------------------------------------- one board per stat

export type Board = { group: PlayerGroup; path: string; label: string; kind: "stat" | "box"; key: string }

/** Every leaderboard: one per graded or style stat and one per box-score total, each with its own url. */
export function boards(group: PlayerGroup): Board[] {
	const stats = Object.entries(STAT[group]).map(([key, s]) => ({ group, path: s.path, label: s.label, kind: "stat" as const, key }))
	const box = Object.entries(BOX[group]).map(([key, b]) => ({ group, path: b.path, label: b.label, kind: "box" as const, key }))
	return [...stats, ...box]
}

export function boardFor(group: PlayerGroup, path: string): Board | null {
	return boards(group).find((b) => b.path === path) ?? null
}

export function groupOf(value: string): PlayerGroup | null {
	return (GROUP_ORDER as string[]).includes(value) ? (value as PlayerGroup) : null
}

// ---------------------------------------------------------------------------------------------- context: where a number sits

/**
 * The percentile a reader sees: whole numbers from 1 to 99. The best player in the league has beaten everyone else, but "100th
 * percentile" reads as a glitch, so the top reads 99 and the bottom 1 (the way baseball's leaderboards print it).
 */
export function shownPct(p: number): number {
	return Math.min(99, Math.max(1, Math.round(p)))
}

/** Percentile (100 is best) from a rank among `n` players. */
export function pctFromRank(r: number, n: number): number {
	return n > 1 ? ((n - r) / (n - 1)) * 100 : 50
}

/** "7th of 40". */
export function rankPhrase(r: number, n: number): string {
	return `${ordinal(r)} of ${n}`
}

/** "Top 18%" for the better half and "Bottom 22%" for the worse half. */
export function topPhrase(r: number, n: number): string {
	const top = Math.max(1, Math.ceil((r / n) * 100))
	if (r <= n / 2) return `Top ${top}%`
	return `Bottom ${Math.max(1, Math.ceil(((n - r + 1) / n) * 100))}%`
}

export type Tier = "elite" | "great" | "good" | "typical" | "below" | "poor" | "worst"

export function tierOf(pct: number): Tier {
	if (pct >= 90) return "elite"
	if (pct >= 75) return "great"
	if (pct >= 60) return "good"
	if (pct > 40) return "typical"
	if (pct > 25) return "below"
	if (pct > 10) return "poor"
	return "worst"
}

export const TIER_WORD: Record<Tier, string> = {
	elite: "Elite",
	great: "Well above typical",
	good: "Above typical",
	typical: "Typical",
	below: "Below typical",
	poor: "Well below typical",
	worst: "Among the weakest",
}

/** A scouting-scale grade in words, so "62" reads without a legend. */
export function gradeWord(g: number | null | undefined): string {
	if (g === null || g === undefined || Number.isNaN(g)) return "not enough yet"
	if (g >= 70) return "elite"
	if (g >= 60) return "well above average"
	if (g >= 55) return "above average"
	if (g > 45) return "about average"
	if (g > 40) return "below average"
	if (g > 30) return "well below average"
	return "among the worst"
}

export function yardOf(data: PlayersData, group: PlayerGroup, key: string): Yard | null {
	return data.yard[group]?.[key] ?? null
}

/** Where a value falls among the league's players, 0 to 100 by value (not by goodness), read off the yardstick. */
export function valuePct(v: number, y: Yard): number {
	const marks: [number, number][] = [[0, y.q[0] - 1.5 * y.sd], [10, y.q[0]], [25, y.q[1]], [50, y.q[2]], [75, y.q[3]], [90, y.q[4]], [100, y.q[4] + 1.5 * y.sd]]
	if (v <= marks[0][1]) return 0
	for (let i = 1; i < marks.length; i++) {
		const [p0, v0] = marks[i - 1]
		const [p1, v1] = marks[i]
		if (v <= v1) return v1 === v0 ? p1 : p0 + ((v - v0) / (v1 - v0)) * (p1 - p0)
	}
	return 100
}

/** Where a value sits on a strip that always runs worse to better: 0 at the 10th-best player's value, 1 at the 90th. Beyond the ends it keeps going. */
export function yardPos(v: number, y: Yard, higher: boolean | null): number {
	const lo = y.q[0]
	const hi = y.q[4]
	const span = hi - lo || 1
	const t = (v - lo) / span
	return higher === false ? 1 - t : t
}

/** How much to trust a value: its standard error against how far apart the league's players are. */
export type Sureness = "firm" | "growing" | "thin"
export function sureness(se: number | null | undefined, y: Yard | null): Sureness {
	if (se === null || se === undefined || !y || !y.sd) return "growing"
	const r = se / y.sd
	return r < 0.35 ? "firm" : r < 0.7 ? "growing" : "thin"
}
export const SURE_WORD: Record<Sureness, string> = {
	firm: "Solid sample",
	growing: "Sample still growing",
	thin: "Small sample: could move a lot",
}

/**
 * How much of what separates players on a stat is real so far. Early in a season, a rate over a handful of plays (missed tackles,
 * drops, field goal percentage) is mostly luck, and ranking players on it says little. "luck" stats are shown, and still ranked, but
 * are never called elite or poor, never earn a badge, and never drive a read.
 */
export type Signal = "luck" | "partial" | "real"
export function signalOf(y: Yard | null | undefined): Signal {
	if (!y || y.rel === undefined) return "partial"
	return y.rel < 0.15 ? "luck" : y.rel < 0.45 ? "partial" : "real"
}
/**
 * The same call for one player's own number. When his earlier seasons are part of it, what counts is how much of the league's spread in
 * true level that number now pins down, never less than what the whole league's spread says: a quarterback with four years behind him
 * has a settled EPA per dropback in week 5 even though the league as a whole does not yet.
 */
export function signalFor(y: Yard | null | undefined, s: Slice): Signal {
	if (s.hn && s.rl !== undefined && y && y.rel !== undefined) return signalOf({ ...y, rel: Math.max(y.rel, s.rl) })
	return signalOf(y)
}
export const SIGNAL_WORD: Record<Signal, string> = {
	luck: "Mostly luck so far",
	partial: "Partly signal, partly luck",
	real: "A real signal",
}
export const SIGNAL_HELP: Record<Signal, string> = {
	luck: "At this point in the season the differences between players on this stat are mostly chance: on this few plays, a good number and a bad one look alike. It firms up as games are played.",
	partial: "Some of the differences between players on this stat are real and some are still chance.",
	real: "Most of the differences between players on this stat are real, not chance.",
}

/** Said wherever a line-level number is shown, so nobody reads a unit's result as one man's. */
export const UNIT_NOTE = "This is his whole line's number: every lineman who starts beside him shares it, so it says how the unit is doing more than how he is."

export type StatContext = {
	info: StatInfo
	key: string
	value: number
	n: number
	rank: number | null
	of: number | null
	pct: number | null
	tier: Tier | null
	grade: number | null
	/** The 90% range his true level likely sits in, as values. */
	range: [number, number] | null
	sure: Sureness
	/** How much of the spread between players on this stat is real rather than luck. */
	signal: Signal
	yard: Yard | null
	/** For a style stat, where he sits from "least" to "most" of the league, 0 to 100. */
	stylePct: number | null
	/** The plays from his earlier seasons that are part of this grade (0 when none are). */
	history: number
}

/** The 90% range for his true level, kept inside what the stat can be: a rate cannot be below 0% or above 100%, a count per play cannot be negative. */
function boundedRange(info: StatInfo, y: Yard | null, v: number, se: number): [number, number] {
	let lo = v - 1.645 * se
	let hi = v + 1.645 * se
	if (info.fmt === pct0 || info.fmt === pct1) {
		lo = Math.max(0, lo)
		hi = Math.min(1, hi)
	} else if (y && y.q[0] >= 0 && v >= 0) lo = Math.max(0, lo)
	return [lo, hi]
}

export function contextOf(data: PlayersData, p: PlayerRow, s: PlayerStat): StatContext | null {
	const info = statInfo(p.group, s.k)
	if (!info) return null
	const y = yardOf(data, p.group, s.k)
	const r = s.season.r ?? null
	const of = info.higher === null ? null : (y?.n ?? null)
	const pct = r !== null && of !== null ? pctFromRank(r, of) : null
	const sl = s.season
	const se = sl.se ?? null
	// With his earlier seasons in the grade, the number to trust is the stabilized one and its own, smaller, margin.
	const withHistory = Boolean(sl.hn && sl.a !== undefined && sl.a !== null && sl.pe !== undefined)
	const signal = info.higher === null ? "partial" : signalFor(y, sl)
	return {
		info,
		key: s.k,
		value: sl.v,
		n: sl.n,
		rank: r,
		of,
		pct,
		tier: pct === null || signal === "luck" ? null : tierOf(pct),
		grade: sl.g ?? null,
		range: withHistory ? boundedRange(info, y, sl.a as number, sl.pe as number) : se === null ? null : boundedRange(info, y, sl.v, se),
		sure: sureness(withHistory ? (sl.pe as number) : se, y),
		signal,
		yard: y,
		stylePct: info.higher === null && y ? valuePct(sl.v, y) : null,
		history: sl.hn ?? 0,
	}
}

/** One plain sentence placing a number: rank, tier, and what typical and elite look like. */
export function contextLine(data: PlayersData, p: PlayerRow, s: PlayerStat): string {
	const c = contextOf(data, p, s)
	if (!c) return ""
	const peers = GROUP_META[p.group].peers
	if (c.rank !== null && c.of !== null && c.pct !== null && c.tier) {
		const mid = c.yard ? `A typical one is ${formatStat(p.group, s.k, c.yard.q[2])}.` : ""
		return `${rankPhrase(c.rank, c.of)} among ${peers} (${topPhrase(c.rank, c.of).toLowerCase()}). ${mid}`.trim()
	}
	if (c.stylePct !== null) return styleLine(data, p, s)
	return ""
}

/** "tries" to "try", "targets" to "target". */
export const singular = (word: string) => (/ies$/.test(word) ? word.replace(/ies$/, "y") : word.replace(/s$/, ""))

/** "about 1 in 4" for a share under a third, "about 6 in 10" above it, so a percentage becomes something a fan can picture. */
export function oneIn(v: number): string {
	if (!(v > 0)) return "none"
	if (v >= 0.95) return "nearly all"
	if (v < 0.34) return `about 1 in ${Math.max(2, Math.round(1 / v))}`
	return `about ${Math.round(v * 10)} in 10`
}

/** "12 tries, 1 of them from 50+ yards": the plain count behind a share, or "" when the stat is not a share. */
export function shareCount(info: StatInfo, v: number, n: number): string {
	if (!info.part || (info.fmt !== pct0 && info.fmt !== pct1) || !(n > 0)) return ""
	const total = Math.round(n)
	const k = Math.min(total, Math.round(v * total))
	const per = total === 1 ? singular(info.per) : info.per
	return `${total} ${per}, ${k} of them ${info.part}`
}

/**
 * For a style stat: the count behind the number, how he compares with the league, and what a typical player looks like. None of it
 * judges: a style is not a grade.
 */
export function styleLine(data: PlayersData, p: PlayerRow, s: PlayerStat): string {
	const c = contextOf(data, p, s)
	const lean = c?.info.lean
	if (!c || c.stylePct === null || !lean) return ""
	const single = GROUP_META[p.group].single.toLowerCase()
	const pctStat = c.info.fmt === pct0 || c.info.fmt === pct1
	const typical = c.yard ? formatStat(p.group, s.k, c.yard.q[2]) : ""
	const odds = pctStat && c.yard ? ` (${oneIn(c.yard.q[2])})` : ""
	const count = shareCount(c.info, c.value, c.n)
	const lead = count ? `${cap(count)}. ` : ""
	let verdict: string
	if (c.stylePct >= 85) verdict = `${cap(lean[1])}. His number is higher than almost any other ${single}'s.`
	else if (c.stylePct >= 65) verdict = `${cap(lean[1])}. His number is higher than most ${GROUP_META[p.group].peers}'.`
	else if (c.stylePct <= 15) verdict = `${cap(lean[0])}. His number is lower than almost any other ${single}'s.`
	else if (c.stylePct <= 35) verdict = `${cap(lean[0])}. His number is lower than most ${GROUP_META[p.group].peers}'.`
	else verdict = `Right in line with the typical ${single}.`
	return `${lead}${verdict} The typical ${single} is at ${typical}${odds}.`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** A label in the middle of a sentence: lower case, except an acronym like "EPA" or "YAC". */
export const lc = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1))

// ---------------------------------------------------------------------------------------------- overall grade

/** The mean grade over the stats that count, in one slice: where he sits among his peers in that stretch. */
export function overall(p: PlayerRow, slice: "season" | "form" | "earlier" = "season"): number | null {
	if (!hasOverall(p.group)) return null
	const gs = p.stats.filter((s) => isCore(p.group, s.k) && typeof s[slice]?.g === "number").map((s) => s[slice]!.g as number)
	if (!gs.length) return null
	return gs.reduce((a, b) => a + b, 0) / gs.length
}

/**
 * A job gets an overall grade only when at least two stats that belong to the man himself make it up. An offensive lineman has one
 * (penalties): the public data has no block won or lost, and his line's run success and sack rate are shared by the five who start
 * together, so averaging them in would grade the unit and call it him. Linemen get a record and their line's numbers instead.
 */
export function hasOverall(group: PlayerGroup): boolean {
	return Object.keys(STAT[group] ?? {}).filter((k) => isCore(group, k)).length >= 2
}

export type LineRecord = {
	/** What he did himself: games, starts, snaps, penalties. */
	mine: { label: string; value: string; note?: string }[]
	/** What his whole line did while he started: shared by the five who start together. */
	line: { k: string; label: string; value: string; typical: string | null }[]
}

/**
 * The profile of a player with no overall grade (an offensive lineman): his own record, then his line's numbers, each said to be the
 * line's. Null for jobs that do get a grade.
 */
export function lineRecord(data: PlayersData, p: PlayerRow): LineRecord | null {
	if (hasOverall(p.group)) return null
	const b = p.box
	const mine: LineRecord["mine"] = []
	const teamGames = p.snaps.season?.[2] ?? null
	if (b.gs !== undefined) mine.push({ label: "Starts", value: String(Math.round(b.gs)), note: teamGames ? `of ${teamGames} team ${teamGames === 1 ? "game" : "games"}` : undefined })
	if (b.snaps !== undefined) mine.push({ label: "Snaps", value: Math.round(b.snaps).toLocaleString("en-US"), note: statOf(p, "snapShare") ? `${snapText(statOf(p, "snapShare")!.season.v)} when he plays` : undefined })
	const pen = statOf(p, "penRate")
	if (b.pen !== undefined) mine.push({ label: "Penalties", value: String(Math.round(b.pen)), note: pen ? `${formatStat(p.group, "penRate", pen.season.v)} per 1,000 snaps` : undefined })
	const line: LineRecord["line"] = []
	for (const k of ["runSucc", "sackRate"]) {
		const st = statOf(p, k)
		const info = statInfo(p.group, k)
		if (!st || !info) continue
		const y = yardOf(data, p.group, k)
		line.push({ k, label: info.label, value: formatStat(p.group, k, st.season.v), typical: y ? formatStat(p.group, k, y.q[2]) : null })
	}
	return { mine, line }
}

/**
 * True when fewer than two of the stats behind his grade have settled (not mostly luck, not a thin sample). His grade and rank are
 * still shown, but as an early read: calling him elite or poor on numbers that are mostly chance would contradict the stats under it.
 */
export function isEarly(data: PlayersData, p: PlayerRow): boolean {
	let solid = 0
	for (const s of p.stats) {
		if (!isCore(p.group, s.k)) continue
		const c = contextOf(data, p, s)
		if (c && c.signal !== "luck" && c.sure !== "thin") solid += 1
	}
	return solid < 2
}

const stretchCache = new WeakMap<PlayersData, number>()

/**
 * The number a reader sees as "Overall", 1 to 99 (50 is average). It is the scouting grade stretched around 50 so the league's top 1%
 * lands near 80. The raw grade is an average of z-scores pulled toward the mean early in a season, so the very best quarterback can sit
 * in the mid-50s, and read as a grade out of 100 that looks average. The stretch is read off the season's own spread, so it loosens by
 * itself as grades spread out over the year. Unlike a rank percentile it keeps the size of the gaps: two players a grade point apart are
 * a few points apart, not a dozen places apart. His place at the position ("39th of 40") is shown beside it.
 */
export function gradeScore(data: PlayersData, p: PlayerRow): number | null {
	return stretchGrade(data, overall(p))
}

/** The same 1 to 99 stretch for any scouting grade, so a grade over a different stretch of games (recent form) reads on the same scale. */
export function stretchGrade(data: PlayersData, o: number | null): number | null {
	if (o === null) return null
	let k = stretchCache.get(data)
	if (k === undefined) {
		const all = data.players.map((x) => overall(x)).filter((x): x is number => x !== null).sort((a, b) => a - b)
		const top = all.length ? all[Math.min(all.length - 1, Math.floor(all.length * 0.99))] : 50
		k = 30 / Math.max(3, top - 50)
		stretchCache.set(data, k)
	}
	return shownPct(50 + (o - 50) * k)
}

const overallCache = new WeakMap<PlayersData, Map<PlayerGroup, Map<string, number>>>()

/** His rank among his group by overall grade this season (1 is best), and how many are ranked. */
export function overallRank(data: PlayersData, p: PlayerRow): { rank: number; of: number } | null {
	let by = overallCache.get(data)
	if (!by) overallCache.set(data, (by = new Map()))
	let ranks = by.get(p.group)
	if (!ranks) {
		const list = data.players.filter((x) => x.group === p.group).map((x) => ({ id: x.id, o: overall(x) })).filter((x): x is { id: string; o: number } => x.o !== null)
		list.sort((a, b) => b.o - a.o)
		ranks = new Map(list.map((x, i) => [x.id, i + 1]))
		by.set(p.group, ranks)
	}
	const r = ranks.get(p.id)
	return r ? { rank: r, of: ranks.size } : null
}

// ---------------------------------------------------------------------------------------------- movers

/** Below this, a change is noise; a faller or riser is at least this many grade points. */
export const MOVE_MIN = 3

export type MoverTier = "hot" | "cold" | "steady"

export function moverTier(p: PlayerRow): MoverTier {
	const s = p.mover?.score
	if (s === undefined) return "steady"
	return s >= MOVE_MIN ? "hot" : s <= -MOVE_MIN ? "cold" : "steady"
}

/** How sure the change is: the change in the main stats against the noise a handful of plays makes. */
export type Confidence = "clear" | "leaning" | "noise"
export function confidenceOf(z: number | null | undefined): Confidence {
	if (z === null || z === undefined) return "noise"
	const a = Math.abs(z)
	return a >= 1.5 ? "clear" : a >= 0.75 ? "leaning" : "noise"
}
export const CONFIDENCE_WORD: Record<Confidence, string> = {
	clear: "A clear change",
	leaning: "Leaning that way",
	noise: "Within the noise",
}
export const CONFIDENCE_HELP: Record<Confidence, string> = {
	clear: "The change is bigger than what a few plays would produce by chance.",
	leaning: "The change points one way, but a few plays could still explain it.",
	noise: "A few plays could easily explain this. Worth watching, not worth believing yet.",
}

export function players(data: PlayersData, group?: PlayerGroup): PlayerRow[] {
	return data.players.filter((p) => !group || p.group === group)
}

export function statOf(p: PlayerRow, key: string): PlayerStat | null {
	return p.stats.find((s) => s.k === key) ?? null
}

/** The stat that moved a player the most, if he has a mover score. */
export function driverOf(p: PlayerRow): PlayerStat | null {
	return p.mover ? statOf(p, p.mover.driver) : null
}

const DEFENSIVE_WINDOW: PlayerGroup[] = ["edge", "idl", "lb", "cb", "saf"]

export function windowWeeks(data: PlayersData, group: PlayerGroup): number[] {
	return DEFENSIVE_WINDOW.includes(group) ? data.defFormWeeks : data.formWeeks
}

/** "Last 2 games" or "Last game", for the window a player's recent form covers. */
export function formName(data: PlayersData, group: PlayerGroup): string {
	return windowWeeks(data, group).length === 1 ? "Last game" : `Last ${windowWeeks(data, group).length} games`
}

/**
 * The recent window for one player. The window is the team's last games, so a man who sat out one of them has fewer games behind it
 * than the label "Last 2 games" says: "Last 2 games (played 1)".
 */
export function formNameFor(data: PlayersData, p: PlayerRow): string {
	const base = formName(data, p.group)
	const f = p.snaps?.form
	if (!f || f[2] <= f[1]) return base
	return f[1] === 0 ? `${base} (none played)` : `${base} (played ${f[1]})`
}

/** The week range the recent window covers, e.g. "Weeks 4 and 5". */
export function formWeeks(data: PlayersData, group: PlayerGroup): string {
	const weeks = windowWeeks(data, group)
	if (!weeks.length) return ""
	if (weeks.length === 1) return `Week ${weeks[0]}`
	return `Weeks ${weeks.slice(0, -1).join(", ")} and ${weeks[weeks.length - 1]}`
}

/**
 * One plain sentence on why a player moved: the stat that changed the most, now against before.
 * "EPA per target is +0.42 over the last 2 games (13 targets), against +0.12 before that."
 */
export function describeMove(data: PlayersData, p: PlayerRow): string {
	const d = driverOf(p)
	const info = d ? statInfo(p.group, d.k) : null
	if (!d || !info || !d.form || !d.earlier) return ""
	const f = formatStat(p.group, d.k, d.form.v)
	const e = formatStat(p.group, d.k, d.earlier.v)
	const f2 = p.snaps?.form
	const played = f2 && f2[2] > f2[1] ? `, ${f2[1] === 0 ? "none" : f2[1] === 1 ? "only one" : `${f2[1]}`} of which he played` : ""
	const recent = `${formName(data, p.group).toLowerCase()}${played}`
	// A rate built on a handful of events is one or two plays, so say how many.
	const events = COUNTED_EVENTS[d.k] && p.group === "ol" ? Math.round((d.form.v * d.form.n) / 1000) : null
	const eventText = events === null ? "" : `, ${events} ${events === 1 ? COUNTED_EVENTS[d.k][0] : COUNTED_EVENTS[d.k][1]}`
	return `${info.label} is ${f} over the ${recent} (${Math.round(d.form.n)} ${info.per}${eventText}), against ${e} before that.`
}

const COUNTED_EVENTS: Record<string, [string, string]> = { penRate: ["penalty", "penalties"], holdRate: ["holding penalty", "holding penalties"], fsRate: ["false start", "false starts"] }

/** "Mixed" when the stats disagree on which way he moved, so a reader is not told a flat story about a split picture. */
export function isMixed(p: PlayerRow): boolean {
	return Boolean(p.mover && p.mover.stats >= 3 && p.mover.agree / p.mover.stats < 0.75)
}

/** "+4.2" for a grade change, with a real minus sign. */
export function moveText(score: number): string {
	return signed(score, 1)
}

export type MoverOpts = { team?: string; group?: PlayerGroup; side?: Side; limit?: number; byConfidence?: boolean }

/**
 * The players moving up and down the most, biggest first. Players with no mover score (too little recent volume) are left out.
 * Around the league the order is by how sure the change is, so a thin sample cannot top the list on size alone.
 */
export function risersFallers(data: PlayersData, opts: MoverOpts = {}): { risers: PlayerRow[]; fallers: PlayerRow[] } {
	const { team, group, side, limit = 4, byConfidence = false } = opts
	const scored = data.players.filter((p) => p.mover && (!team || p.team === team) && (!group || p.group === group) && (!side || GROUP_META[p.group].side === side))
	const key = (p: PlayerRow) => (byConfidence ? (p.mover!.z ?? 0) : p.mover!.score)
	const risers = scored.filter((p) => moverTier(p) === "hot").sort((a, b) => key(b) - key(a) || b.mover!.score - a.mover!.score || a.name.localeCompare(b.name))
	const fallers = scored.filter((p) => moverTier(p) === "cold").sort((a, b) => key(a) - key(b) || a.mover!.score - b.mover!.score || a.name.localeCompare(b.name))
	return { risers: risers.slice(0, limit), fallers: fallers.slice(0, limit) }
}

// ---------------------------------------------------------------------------------------------- standouts

export type Standout = { player: PlayerRow; stat: PlayerStat; ctx: StatContext }

/**
 * The stats that make a player stand out over the whole season: best and worst among his peers. A stat only counts when the sample is
 * not thin, so a hot week cannot make a card.
 */
export function standouts(data: PlayersData, opts: { team?: string; top?: number; hi?: number; lo?: number; minSure?: Sureness } = {}): { best: Standout[]; worst: Standout[] } {
	const { team, top = 6, hi = 85, lo = 15, minSure = "growing" } = opts
	const ok = (s: Sureness) => (minSure === "firm" ? s === "firm" : s !== "thin")
	const all: Standout[] = []
	for (const p of data.players) {
		if (team && p.team !== team) continue
		for (const s of p.stats) {
			const info = statInfo(p.group, s.k)
			// Drop rate and the like are mostly zeros, which makes everyone with none a "best in the league".
			if (!info || info.higher === null || info.counts === false) continue
			const ctx = contextOf(data, p, s)
			if (!ctx || ctx.pct === null || !ok(ctx.sure) || ctx.signal === "luck") continue
			all.push({ player: p, stat: s, ctx })
		}
	}
	const best = all.filter((x) => x.ctx.pct! >= hi).sort((a, b) => b.ctx.pct! - a.ctx.pct! || (b.ctx.grade ?? 0) - (a.ctx.grade ?? 0) || a.player.name.localeCompare(b.player.name))
	const worst = all.filter((x) => x.ctx.pct! <= lo).sort((a, b) => a.ctx.pct! - b.ctx.pct! || (a.ctx.grade ?? 0) - (b.ctx.grade ?? 0) || a.player.name.localeCompare(b.player.name))
	return { best: best.slice(0, top), worst: worst.slice(0, top) }
}

// ---------------------------------------------------------------------------------------------- playing time

/** The share of the team's snaps, as "78%". */
export function snapText(v: number | null | undefined): string {
	return v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`
}

/** "about 8 of every 10 plays" for a snap share, so a percentage means something on the field. */
export function snapsOutOf10(v: number): string {
	const n = Math.round(v * 10)
	return n >= 10 ? "nearly every play" : n <= 0 ? "almost no plays" : `about ${n} of every 10 plays`
}

/** His share of the team's snaps in the games he played, ignoring the games he missed. */
export function activeShare(line: SnapLine): number | null {
	if (!line || !line[1]) return null
	return (line[0] * line[2]) / line[1]
}

/** A change in snap share worth saying out loud: his role grew or shrank by at least this much between earlier and form. */
export const ROLE_MOVE = 0.15

export type RoleKind = "back" | "out" | "bigger" | "smaller"
export type Role = {
	kind: RoleKind
	headline: string
	/** One sentence a reader can follow without knowing what a snap share is. */
	detail: string
	/** The numbers behind it, for the per-game strip. */
	before: number | null
	now: number | null
}

const games = (n: number) => `${n} ${n === 1 ? "game" : "games"}`

/**
 * What changed about his playing time, in words, separating "he missed games" from "he plays less". A snap share that averages in
 * games he never played would call a player back from injury a part-timer who just became a starter.
 */
export function roleOf(p: PlayerRow): Role | null {
	const { form, earlier } = p.snaps
	if (!form || !earlier || !form[2] || !earlier[2]) return null
	const [, fp, fc] = form
	const [, ep, ec] = earlier
	const af = activeShare(form)
	const ae = activeShare(earlier)
	if (fp === 0 && ep > 0) {
		return {
			kind: "out",
			headline: "Not playing lately",
			detail: `He played in ${ep} of his team's first ${ec} ${ec === 1 ? "game" : "games"}, then did not play in the last ${games(fc)}.`,
			before: ae,
			now: 0,
		}
	}
	if (ec - ep >= 1 && fp === fc && af !== null) {
		const missed = ec - ep
		return {
			kind: "back",
			headline: "Back in the lineup",
			detail: `He missed ${games(missed)} earlier, then played ${fc === 1 ? "his most recent game" : `all of the last ${fc} games`}, on the field for ${snapsOutOf10(af)} when he plays.`,
			before: ae,
			now: af,
		}
	}
	if (af !== null && ae !== null && af - ae >= ROLE_MOVE) {
		return { kind: "bigger", headline: "Role is growing", detail: `When he plays he is on the field for ${snapsOutOf10(af)} lately, up from ${snapsOutOf10(ae)} before.`, before: ae, now: af }
	}
	if (af !== null && ae !== null && ae - af >= ROLE_MOVE) {
		return { kind: "smaller", headline: "Role is shrinking", detail: `When he plays he is on the field for ${snapsOutOf10(af)} lately, down from ${snapsOutOf10(ae)} before.`, before: ae, now: af }
	}
	return null
}

export function roleMovers(data: PlayersData, opts: { team?: string; limit?: number } = {}): { player: PlayerRow; role: Role }[] {
	const out: { player: PlayerRow; role: Role }[] = []
	for (const p of data.players) {
		if (opts.team && p.team !== opts.team) continue
		if (GROUP_META[p.group].side === "special") continue
		const role = roleOf(p)
		if (!role) continue
		// A player who was never more than a handful of snaps is not a story.
		if (Math.max(role.before ?? 0, role.now ?? 0) < 0.3) continue
		out.push({ player: p, role })
	}
	const weight = (r: Role) => Math.abs((r.now ?? 0) - (r.before ?? 0)) + (r.kind === "back" || r.kind === "out" ? 0.2 : 0)
	out.sort((a, b) => weight(b.role) - weight(a.role) || a.player.name.localeCompare(b.player.name))
	return out.slice(0, opts.limit ?? 8)
}

// ---------------------------------------------------------------------------------------------- the trail

export function trailOf(log: PlayerLog | undefined, key: string): LogPoint[] {
	return log?.g[key] ?? []
}

/** Season-to-date percentile after the first and the latest week he has one, as a sentence about direction. */
export function trailLine(points: LogPoint[]): string {
	return arcLine(points.filter((p) => p[3] !== null).map((p) => ({ w: p[0], pct: p[3]! })))
}

export type ArcPoint = { w: number; pct: number }

/**
 * Where he has stood among his peers after each week of the season, averaged over the stats that make up his grade, so one stat's
 * hot or cold week does not stand for him. Each point is season-to-date (100 is the best at his job), which means the line moves
 * slowly and a rise is a player passing others over many games, not one good Sunday. This is the season-long picture of growth or slide.
 */
export function arcOf(p: PlayerRow, log: PlayerLog | undefined): ArcPoint[] {
	const byWeek = new Map<number, number[]>()
	for (const s of p.stats) {
		if (!isCore(p.group, s.k)) continue
		for (const t of trailOf(log, s.k)) if (t[3] !== null) byWeek.set(t[0], [...(byWeek.get(t[0]) ?? []), t[3]])
	}
	return Array.from(byWeek.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([w, v]) => ({ w, pct: v.reduce((x, y) => x + y, 0) / v.length }))
}

/** How far his standing moved from the first week he had one to the latest, in percentile points. */
export function arcChange(points: ArcPoint[]): { first: ArcPoint; last: ArcPoint; delta: number; weeks: number } | null {
	if (points.length < 2) return null
	const first = points[0]
	const last = points[points.length - 1]
	return { first, last, delta: shownPct(last.pct) - shownPct(first.pct), weeks: points.length }
}

/** The arc as a sentence: climbing, slipping or holding, with the percentile at each end. */
export function arcLine(points: ArcPoint[], subject = "Season rank"): string {
	const c = arcChange(points)
	if (!c) return ""
	const a = shownPct(c.first.pct)
	const b = shownPct(c.last.pct)
	if (Math.abs(c.delta) < 8) return `${subject} ${subject === "Season rank" ? "holding" : "held"} near the ${ordinal(b)} percentile since Wk ${c.first.w}.`
	return `${subject} ${c.delta > 0 ? "climbed" : "slipped"}: ${ordinal(a)} to ${ordinal(b)} percentile since Wk ${c.first.w}.`
}

export function opponentFor(data: PlayersData, team: string, week: number, log?: PlayerLog): string {
	const t = log?.t?.[String(week)] ?? team
	return data.opp[t]?.[String(week)] ?? ""
}

// ---------------------------------------------------------------------------------------------- the read

/** What the read can also draw on when it is handed the player's game-by-game log. */
export type ReadExtra = { log?: PlayerLog }

/** The box-score caveat for a stat, as a sentence, or nothing when the caveat is just "it is not there". */
const boxGap = (box: string) => (box.length > 40 && !/^(not in|this is|counted)/i.test(box) ? ` Where the box score falls short: ${lc(box)}` : "")

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`)

/**
 * A few short paragraphs on a player, written from his numbers and always with the numbers in them: the box-score line, what he does
 * best and worst against the typical player at his job, how steady he has been game to game, which way the season is going, and what
 * is still too early to call. A stat that is mostly luck so far is named as such and never drives a verdict.
 */
export function scoutingRead(data: PlayersData, p: PlayerRow, extra: ReadExtra = {}): string[] {
	const out: string[] = []
	const first = p.name.split(" ")[0]
	const meta = GROUP_META[p.group]
	const peers = meta.peers
	const single = meta.single.toLowerCase()
	const all = p.stats.map((s) => ({ s, c: contextOf(data, p, s) })).filter((x): x is { s: PlayerStat; c: StatContext } => Boolean(x.c && x.c.pct !== null && x.c.rank !== null && x.c.of !== null && x.c.info.counts !== false))
	const solid = all.filter((x) => x.c.signal !== "luck" && x.c.sure !== "thin")
	const luck = all.filter((x) => x.c.signal === "luck")
	const typical = (x: { s: PlayerStat; c: StatContext }) => (x.c.yard ? `the typical ${single} is ${formatStat(p.group, x.s.k, x.c.yard.q[2])}` : "")
	const cite = (x: { s: PlayerStat; c: StatContext }) => `${lc(x.c.info.label)} is ${formatStat(p.group, x.s.k, x.c.value)} on ${Math.round(x.c.n)} ${x.c.info.per}, ${rankPhrase(x.c.rank!, x.c.of!)} among ${peers}${typical(x) ? ` (${typical(x)})` : ""}`

	// 1. The headline: the grade, and the box score behind it.
	const o = overall(p)
	const rk = overallRank(data, p)
	const box = Object.keys(BOX[p.group])
		.filter((k) => (p.box[k] ?? 0) > 0)
		.slice(0, 3)
		.map((k) => `${formatBox(p.group, k, p.box[k])} ${countWord(p.box[k], lc(BOX[p.group][k].label))}`)
	const games = `${p.games} ${p.games === 1 ? "game" : "games"}`
	if (o !== null && rk && solid.length) {
		out.push(`${first} grades ${gradeWord(o)} among ${peers}: ${rankPhrase(rk.rank, rk.of)} on the average of ${solid.length} settled advanced ${solid.length === 1 ? "stat" : "stats"} over ${games}.${box.length ? ` The box score reads ${list(box)}.` : ""}`)
	} else if (o !== null) {
		out.push(`${first} has played ${games}${box.length ? ` for ${list(box)}` : ""}, but every advanced number is still mostly luck at this point, so his grade of ${Math.round(o)} is a placeholder rather than a verdict.`)
	} else if (!hasOverall(p.group)) {
		// A job with no individual grade (an offensive lineman) gets the record, said plainly, instead of a verdict.
		out.push(`${first} has played ${games}${box.length ? `: ${list(box)}` : ""}. There is no overall grade for ${peers}, because the public data has no block won or lost for one man and his line's numbers belong to all five who start beside him.`)
	}

	// 2. What he does best, with the evidence; 3. what holds him back.
	const byPct = solid.slice().sort((a, b) => b.c.pct! - a.c.pct!)
	const top = byPct.filter((x) => x.c.pct! >= 65).slice(0, 2)
	const low = byPct.filter((x) => x.c.pct! <= 35).slice(-1)
	if (top.length) {
		out.push(`His strength: ${cite(top[0])}.${top[1] ? ` It backs up ${lc(top[1].c.info.label)}, ${formatStat(p.group, top[1].s.k, top[1].c.value)}, ${rankPhrase(top[1].c.rank!, top[1].c.of!)}.` : ""}${boxGap(top[0].c.info.box)}`.replace(/\.\.$/, "."))
	} else if (byPct[0]) {
		out.push(`His highest-ranked settled number is only ${byPct[0].c.pct! >= 50 ? "a little above" : "below"} the middle: ${cite(byPct[0])}. Nothing he does stands out from the ${peers} yet.`)
	}
	if (low.length && low[0] !== top[0]) out.push(`What holds him back: ${cite(low[0])}.`)

	// 4. Game to game, when the log is at hand.
	const key = HEADLINE[p.group]
	const info = statInfo(p.group, key)
	const pts = extra.log?.g[key] ?? []
	if (info && info.higher !== null && !info.unit && pts.length >= 3) {
		const ex = extremeGames(extra.log, key, info.higher, 3)
		const y = yardOf(data, p.group, key)
		const opp = ex ? opponentFor(data, p.team, ex.best.week, extra.log) : ""
		const line: string[] = []
		if (ex) line.push(`Game to game on ${lc(info.label)}: best ${formatStat(p.group, key, ex.best.value)} in Week ${ex.best.week}${opp ? ` against ${opp}` : ""}, worst ${formatStat(p.group, key, ex.worst.value)} in Week ${ex.worst.week}.`)
		if (y) {
			const played = pts.filter((t) => t[2] > 0)
			const beat = played.filter((t) => (info.higher ? t[1] > y.q[2] : t[1] < y.q[2])).length
			if (played.length >= 3) line.push(`He beat the typical ${single}'s ${lc(info.label)} in ${beat} of ${played.length} games.`)
		}
		if (line.length) out.push(line.join(" "))
	}

	// 5. Which way the season is going: the whole arc first, then the recent stretch.
	// Said as "average place", because it is a percentile averaged over his graded stats, not the 1 to 99 Overall above it.
	const arc = o === null ? "" : arcLine(arcOf(p, extra.log), "His average place across his graded stats")
	if (arc) out.push(arc)
	if (p.mover && moverTier(p) !== "steady") {
		const conf = confidenceOf(p.mover.z)
		const dir = p.mover.score > 0 ? "better" : "worse"
		const d = describeMove(data, p)
		// Only a clear change is called "playing better or worse"; a leaning one is said as a lean, and one inside the noise is not a claim.
		const lead = conf === "clear" ? `Lately he is playing ${dir}.` : conf === "leaning" ? `Lately his numbers lean ${dir === "better" ? "up" : "down"}.` : "The recent stretch says nothing reliable yet."
		out.push(`${lead} ${d} ${CONFIDENCE_HELP[conf]}`.trim())
	}

	// 6. Playing time.
	const role = roleOf(p)
	if (role) out.push(`${role.headline}: ${role.detail}`)
	else {
		const share = meta.side === "special" ? null : activeShare(p.snaps.season)
		if (share !== null && share > 0) out.push(`When he plays he is on the field for ${snapsOutOf10(share)}.`)
	}

	// 7. What it is too early to say.
	if (luck.length) {
		out.push(`Too early to call: ${list(luck.slice(0, 3).map((x) => lc(x.c.info.label)))}. After ${data.week} ${data.week === 1 ? "game" : "games"} the gaps between ${peers} on ${luck.length === 1 ? "that stat are" : "those stats are"} still mostly chance, so we show ${luck.length === 1 ? "it" : "them"} without ranking.`)
	}
	return out
}

// ---------------------------------------------------------------------------------------------- comparing

export type Edge = "a" | "b" | "even"
export type CompareRow = { key: string; info: StatInfo; a: PlayerStat; b: PlayerStat; edge: Edge; strength: "clear" | "slight" | "toss-up" }

/** The graded stats two players share, with who is ahead on each and whether the gap is bigger than the noise. */
export function compareRows(a: PlayerRow, b: PlayerRow): CompareRow[] {
	if (a.group !== b.group) return []
	const out: CompareRow[] = []
	for (const sa of a.stats) {
		const info = statInfo(a.group, sa.k)
		const sb = statOf(b, sa.k)
		if (!info || !sb) continue
		const z = (() => {
			const se = Math.hypot(sa.season.se ?? 0, sb.season.se ?? 0)
			return se > 0 ? Math.abs(sa.season.v - sb.season.v) / se : Infinity
		})()
		const better = info.higher === null ? 0 : (sa.season.v - sb.season.v) * (info.higher ? 1 : -1)
		const edge: Edge = info.higher === null || better === 0 ? "even" : better > 0 ? "a" : "b"
		const strength = z >= 1.5 ? "clear" : z >= 0.75 ? "slight" : "toss-up"
		out.push({ key: sa.k, info, a: sa, b: sb, edge: strength === "toss-up" ? "even" : edge, strength })
	}
	return out
}

// ---------------------------------------------------------------------------------------------- leaderboards

export type LeaderRow = { player: PlayerRow; value: number; rank: number; volume: number | null; grade: number | null; delta: number | null; z: number | null }

/** A board's rows, best first. A stat board is ordered by his rank; a box-score board by the total, most first. */
export function leaders(data: PlayersData, board: Board, opts: { team?: string } = {}): LeaderRow[] {
	const rows: LeaderRow[] = []
	for (const p of data.players) {
		if (p.group !== board.group) continue
		if (board.kind === "box") {
			const v = p.box[board.key]
			if (v === undefined) continue
			rows.push({ player: p, value: v, rank: 0, volume: null, grade: null, delta: null, z: null })
		} else {
			const s = statOf(p, board.key)
			if (!s) continue
			rows.push({ player: p, value: s.season.v, rank: 0, volume: s.season.n, grade: s.season.g ?? null, delta: s.delta ?? null, z: s.z ?? null })
		}
	}
	const higher = board.kind === "box" ? true : statInfo(board.group, board.key)?.higher
	const ranked = board.kind === "stat" && higher !== null && higher !== undefined && rows.every((r) => statOf(r.player, board.key)?.season.r != null)
	if (ranked) {
		// A graded stat is ordered by his rank, which is made on the value stabilized for how few plays are behind it, not on the
		// raw number alone: that is what keeps nine players with a 0% on a handful of plays from all being "first".
		const rk = (r: LeaderRow) => statOf(r.player, board.key)!.season.r!
		rows.sort((a, b) => rk(a) - rk(b) || a.player.name.localeCompare(b.player.name))
		rows.forEach((r) => (r.rank = rk(r)))
	} else {
		rows.sort((a, b) => (higher === false ? a.value - b.value : b.value - a.value) || a.player.name.localeCompare(b.player.name))
		// The rank is among everyone, before any filter, so a team's list still says "3rd in the league".
		let last = 0
		rows.forEach((r, i) => {
			r.rank = i > 0 && r.value === rows[i - 1].value ? last : i + 1
			last = r.rank
		})
	}
	return opts.team ? rows.filter((r) => r.player.team === opts.team) : rows
}

// ---------------------------------------------------------------------------------------------- finding people

export type SearchEntry = { slug: string; name: string; team: string; pos: string; group: PlayerGroup; espn?: number; shot?: string }

/** One entry per person, with his main role, for the search box. */
export function searchIndex(data: PlayersData): SearchEntry[] {
	const seen = new Map<string, SearchEntry>()
	for (const p of data.players) {
		const have = seen.get(p.slug)
		// A receiver who also returns punts is a receiver first.
		if (!have || GROUP_ORDER.indexOf(p.group) < GROUP_ORDER.indexOf(have.group)) seen.set(p.slug, { slug: p.slug, name: p.name, team: p.team, pos: p.pos, group: p.group, espn: p.espn, shot: p.shot })
	}
	return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function search(index: SearchEntry[], query: string, limit = 8): SearchEntry[] {
	const q = query.trim().toLowerCase()
	if (!q) return []
	const score = (e: SearchEntry) => {
		const n = e.name.toLowerCase()
		if (n === q) return 0
		if (n.startsWith(q)) return 1
		if (n.split(" ").some((w) => w.startsWith(q))) return 2
		if (n.includes(q)) return 3
		if (e.team.toLowerCase() === q) return 4
		return 9
	}
	return index
		.map((e) => ({ e, s: score(e) }))
		.filter((x) => x.s < 9)
		.sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
		.slice(0, limit)
		.map((x) => x.e)
}

export function rowsFor(data: PlayersData, slug: string): PlayerRow[] {
	return data.players.filter((p) => p.slug === slug).sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
}

export function profileSlugs(data: PlayersData): string[] {
	return Array.from(new Set(data.players.map((p) => p.slug)))
}

// ---------------------------------------------------------------------------------------------- the box score in context

const boxCache = new WeakMap<PlayersData, Map<string, Map<string, number>>>()

/** Where a box-score total ranks among his group (1 is the most), so even a count carries its context. Ties share the better place. */
export function boxRank(data: PlayersData, p: PlayerRow, key: string): { rank: number; of: number } | null {
	let by = boxCache.get(data)
	if (!by) boxCache.set(data, (by = new Map()))
	const id = `${p.group}:${key}`
	let ranks = by.get(id)
	if (!ranks) {
		const list = data.players.filter((x) => x.group === p.group && x.box[key] !== undefined).sort((a, b) => b.box[key] - a.box[key])
		ranks = new Map()
		list.forEach((x, i) => ranks!.set(x.id, i > 0 && x.box[key] === list[i - 1].box[key] ? ranks!.get(list[i - 1].id)! : i + 1))
		by.set(id, ranks)
	}
	const r = ranks.get(p.id)
	return r ? { rank: r, of: ranks.size } : null
}

// ---------------------------------------------------------------------------------------------- who he is: photo, logo, bio

/** ESPN's three-letter codes for the teams whose code is not simply ours in lower case. */
const ESPN_TEAM: Record<string, string> = { WAS: "wsh" }

export const logoUrl = (team: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${ESPN_TEAM[team] ?? team.toLowerCase()}.png`
export const headshotUrl = (espn: number) => `https://a.espncdn.com/i/headshots/nfl/players/full/${espn}.png`
export const shotUrl = (id: string) => `https://static.www.nfl.com/image/upload/f_auto,q_auto/league/${id}`

/** "6'3\"" from inches. */
export function heightText(inches: number | undefined): string | null {
	return inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : null
}

/** Whole years old on a given day. */
export function ageOn(born: string | undefined, today: Date): number | null {
	const m = born ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(born) : null
	if (!m) return null
	let age = today.getUTCFullYear() - Number(m[1])
	if (today.getUTCMonth() + 1 < Number(m[2]) || (today.getUTCMonth() + 1 === Number(m[2]) && today.getUTCDate() < Number(m[3]))) age--
	return age
}

/** "3rd NFL season" or "Rookie", from years of experience (a rookie has none). */
export function seasonWord(exp: number | undefined): string | null {
	if (exp === undefined) return null
	return exp <= 0 ? "Rookie" : `${ordinal(exp + 1)} NFL season`
}

export type Fact = { label: string; value: string }

/** The facts beside a headshot, only those the roster file has. */
export function bioFacts(bio: PlayerBio | undefined, today: Date): Fact[] {
	if (!bio) return []
	const out: Fact[] = []
	const age = ageOn(bio.born, today)
	if (age !== null) out.push({ label: "Age", value: String(age) })
	const h = heightText(bio.ht)
	if (h) out.push({ label: "Height", value: h })
	if (bio.wt) out.push({ label: "Weight", value: `${bio.wt} lbs` })
	if (bio.college) out.push({ label: "College", value: bio.college })
	if (bio.draft) out.push({ label: "Drafted", value: `${bio.draft[2] ? `${bio.draft[2]}, ` : ""}No. ${bio.draft[1]} overall (${bio.draft[0]})` })
	else if (bio.exp !== undefined) out.push({ label: "Drafted", value: "Not drafted" })
	const w = seasonWord(bio.exp)
	if (w) out.push({ label: "Experience", value: w })
	return out
}

/** Initials for a headshot that did not load. */
export function initialsOf(name: string): string {
	const parts = name.replace(/[^A-Za-z .'-]/g, "").split(/\s+/).filter(Boolean)
	return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase()
}

// ---------------------------------------------------------------------------------------------- does it show up in winning?

/**
 * One sentence tying a stat to winning, from every game league-wide at his job. It is about teams, not about him: a team that gets this
 * from its player wins more, which is not the same as saying he caused it.
 */
export function winSentence(split: WinSplit | undefined, single: string, label: string): string | null {
	if (!split || split.n < 30) return null
	const [lo, , hi] = split.t
	const pct = (x: number) => `${Math.round(x * 100)}%`
	if (hi - lo < 0.12) return `Across ${split.n} games league-wide, a good or bad game on ${lc(label)} from ${/^[aeiou]/i.test(single) ? "an" : "a"} ${single.toLowerCase()} has not lined up much with his team winning (${pct(hi)} wins in the best third, ${pct(lo)} in the worst).`
	return `Across ${split.n} games league-wide, teams won ${pct(hi)} of the time when their ${single.toLowerCase()} was in the best third on ${lc(label)}, and ${pct(lo)} when he was in the worst third. That is a link, not proof he caused it: a team that is winning plays differently, so the link can run the other way.`
}

// ---------------------------------------------------------------------------------------------- the game log

export type LogRow = { week: number; opp: string; result: string | null; won: boolean | null; cells: Record<string, number | null>; snap: number | null }

/** One row per game he has numbers in: opponent, how it ended for his team, the box score and the advanced stats of that game. */
export function gameLog(data: PlayersData, row: PlayerRow, log: PlayerLog | undefined, res: PlayerLogs["res"]): LogRow[] {
	if (!log) return []
	const weeks = new Set<number>()
	for (const pts of Object.values(log.g)) for (const p of pts) weeks.add(p[0])
	for (const pts of Object.values(log.b ?? {})) for (const p of pts) weeks.add(p[0])
	return Array.from(weeks)
		.sort((a, b) => a - b)
		.map((week) => {
			const team = log.t?.[String(week)] ?? row.team
			const r = res[team]?.[String(week)]
			const cells: Record<string, number | null> = {}
			for (const [k, pts] of Object.entries(log.b ?? {})) cells[`b:${k}`] = pts.find((p) => p[0] === week)?.[1] ?? null
			for (const [k, pts] of Object.entries(log.g)) cells[`s:${k}`] = pts.find((p) => p[0] === week)?.[1] ?? null
			const snap = log.s?.find((x) => x[0] === week)?.[1] ?? null
			return {
				week,
				opp: opponentFor(data, row.team, week, log),
				result: r ? `${r[0] > r[1] ? "W" : r[0] < r[1] ? "L" : "T"} ${r[0]}–${r[1]}` : null,
				won: r ? (r[0] === r[1] ? null : r[0] > r[1]) : null,
				cells,
				snap,
			}
		})
}

// ---------------------------------------------------------------------------------------------- the percentile profile

export type Bar = { k: string; label: string; pct: number; value: string; rank: string; sure: Sureness; signal: Signal; unit?: true }

/** Every graded stat as a bar from worst (0) to best (100) among the players at his job, best first. */
export function percentileBars(data: PlayersData, p: PlayerRow): Bar[] {
	const out: Bar[] = []
	for (const s of p.stats) {
		const c = contextOf(data, p, s)
		if (!c || c.pct === null || c.rank === null || c.of === null) continue
		out.push({ k: s.k, label: c.info.label, pct: c.pct, value: formatStat(p.group, s.k, c.value), rank: rankPhrase(c.rank, c.of), sure: c.sure, signal: c.signal, ...(c.info.unit ? { unit: true as const } : {}) })
	}
	return out.sort((a, b) => b.pct - a.pct)
}

// ---------------------------------------------------------------------------------------------- the league-best list

export type Badge = { text: string; rank: number; kind: "stat" | "box"; key: string; path: string }

const nth = (r: number) => (r === 1 ? "Best" : `Top ${r}`)

/**
 * Where he is among the best in the league, as short badges: "Best in receiving yards", "Top 3 in EPA per target". Only the top few
 * places count, so a badge always means something. Box-score totals and advanced stats both count, and a rank is the whole league's
 * rank at his position, never one inside a team.
 */
export function badgesFor(data: PlayersData, p: PlayerRow, top = 5, limit = 6): Badge[] {
	const out: Badge[] = []
	for (const s of p.stats) {
		const info = statInfo(p.group, s.k)
		if (!info || info.higher === null || info.counts === false || s.season.r === undefined || s.season.r === null || s.season.r > top || signalFor(yardOf(data, p.group, s.k), s.season) === "luck") continue
		// A stat where fewer is better ranks lowest-first, so "Best in missed tackle rate" must say it is the lowest, not the highest.
		const text = info.higher === false ? (s.season.r === 1 ? `Lowest ${lc(info.label)}` : `${ordinal(s.season.r)} lowest ${lc(info.label)}`) : `${nth(s.season.r)} in ${lc(info.label)}`
		out.push({ text, rank: s.season.r, kind: "stat", key: s.k, path: info.path })
	}
	for (const k of Object.keys(BOX[p.group])) {
		if (p.box[k] === undefined || !(p.box[k] > 0) || BOX[p.group][k].bad) continue
		const r = boxRank(data, p, k)
		if (!r || r.rank > top) continue
		out.push({ text: `${nth(r.rank)} in ${lc(BOX[p.group][k].label)}`, rank: r.rank, kind: "box", key: k, path: BOX[p.group][k].path })
	}
	return out.sort((a, b) => a.rank - b.rank || Number(a.kind === "box") - Number(b.kind === "box")).slice(0, limit)
}

// ---------------------------------------------------------------------------------------------- style fingerprint

export type Trait = { k: string; label: string; pct: number; text: string }

/**
 * What stands out about how he plays, from the style stats only (depth of target, play-action, screens...): the ones where he is far from
 * the middle of his position, each as a short plain phrase. Style is never good or bad, so nothing here is graded.
 */
export function fingerprint(data: PlayersData, p: PlayerRow, limit = 4): Trait[] {
	const out: Trait[] = []
	for (const s of p.stats) {
		const c = contextOf(data, p, s)
		if (!c || c.stylePct === null || !c.info.lean || c.sure === "thin") continue
		const hi = c.stylePct >= 80
		const lo = c.stylePct <= 20
		if (!hi && !lo) continue
		out.push({ k: s.k, label: c.info.label, pct: c.stylePct, text: cap(hi ? c.info.lean[1] : c.info.lean[0]) })
	}
	return out.sort((a, b) => Math.abs(b.pct - 50) - Math.abs(a.pct - 50)).slice(0, limit)
}

// ---------------------------------------------------------------------------------------------- the ladder

export type Rung = { slug: string; name: string; team: string; rank: number; value: number; /** The plays behind the value (a stat on a few plays is pulled toward the league before it is ranked). */ volume: number | null; me: boolean }

/**
 * True when the rungs are not in the order of the numbers shown. A graded stat is ranked on a value pulled toward the league for how few
 * plays are behind it, so a 32% on 98 runs can sit below a 31% on 200. That is deliberate, and the ladder says so when it happens.
 */
export function ladderOutOfOrder(rungs: Rung[], higher: boolean | null | undefined): boolean {
	if (higher === null || higher === undefined) return false
	for (let i = 1; i < rungs.length; i++) {
		const before = rungs[i - 1].value
		const now = rungs[i].value
		if (higher ? now > before : now < before) return true
	}
	return false
}

/** The players just above and below him on a board, with the gaps, so "3rd" becomes "0.08 behind the leader". */
export function ladder(data: PlayersData, p: PlayerRow, key: string, span = 2): { rungs: Rung[]; board: Board } | null {
	const board = boards(p.group).find((b) => b.kind === "stat" && b.key === key)
	if (!board) return null
	const rows = leaders(data, board)
	const i = rows.findIndex((r) => r.player.id === p.id)
	if (i < 0) return null
	const from = Math.max(0, Math.min(i - span, rows.length - (span * 2 + 1)))
	const rungs = rows.slice(from, from + span * 2 + 1).map((r) => ({ slug: r.player.slug, name: r.player.name, team: r.player.team, rank: r.rank, value: r.value, volume: r.volume, me: r.player.id === p.id }))
	return { rungs, board }
}

// ---------------------------------------------------------------------------------------------- build and age against his position

export type BuildLine = { label: string; value: string; yard: Yard; v: number; pct: number; word: string }

/** Height, weight and age against everyone else at his position who has a bio on file. */
export function buildVsPeers(p: PlayerRow, bio: PlayerBio | undefined, peers: (PlayerBio | undefined)[], today: Date): BuildLine[] {
	if (!bio) return []
	const age = (b?: PlayerBio) => ageOn(b?.born, today)
	const specs: { label: string; get: (b?: PlayerBio) => number | null | undefined; fmt: (v: number) => string; words: [string, string] }[] = [
		{ label: "Height", get: (b) => b?.ht, fmt: (v) => heightText(Math.round(v)) ?? "", words: ["shorter", "taller"] },
		{ label: "Weight", get: (b) => b?.wt, fmt: (v) => `${Math.round(v)} lbs`, words: ["lighter", "heavier"] },
		{ label: "Age", get: age, fmt: (v) => String(Math.round(v)), words: ["younger", "older"] },
	]
	const out: BuildLine[] = []
	for (const s of specs) {
		const mine = s.get(bio)
		const all = peers.map(s.get).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b)
		if (mine === null || mine === undefined || all.length < 8) continue
		const q = (f: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(f * (all.length - 1))))]
		const mean = all.reduce((a, b) => a + b, 0) / all.length
		const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length)
		const below = all.filter((x) => x < mine).length
		const same = all.filter((x) => x === mine).length
		const pct = ((below + same / 2) / all.length) * 100
		const word = pct >= 50 ? `${s.words[1]} than ${shownPct(pct)}% of ${GROUP_META[p.group].peers}` : `${s.words[0]} than ${shownPct(100 - pct)}% of ${GROUP_META[p.group].peers}`
		out.push({ label: s.label, value: s.fmt(mine), yard: { n: all.length, mean, sd, q: [q(0.1), q(0.25), q(0.5), q(0.75), q(0.9)] }, v: mine, pct, word })
	}
	return out
}

// ---------------------------------------------------------------------------------------------- best and worst game

export type GamePick = { week: number; value: number; volume: number }

const DEF_GROUPS: PlayerGroup[] = ["edge", "idl", "lb", "cb", "saf"]
const COUNTED: Record<string, { kind: "per100" | "share"; one: string; many: string }> = {
	missedPct: { kind: "share", one: "missed tackle", many: "missed tackles" },
	tackleRate: { kind: "per100", one: "tackle", many: "tackles" },
	tflRate: { kind: "per100", one: "tackle for loss", many: "tackles for loss" },
	pressRate: { kind: "per100", one: "pressure", many: "pressures" },
	sackRate: { kind: "per100", one: "sack", many: "sacks" },
}

/**
 * Plain words for one game's number on a defender's rate, so "3.6" cannot be read as 3.6 tackles: the unit beside it ("per 100 snaps",
 * "missed") and the whole numbers behind it ("2 tackles for loss in 56 snaps"). Null for a stat that needs neither.
 */
export function gameDetail(group: PlayerGroup, key: string, value: number, volume: number): { unit: string; detail: string } | null {
	const c = COUNTED[key]
	if (!c || !DEF_GROUPS.includes(group)) return null
	if (c.kind === "per100") {
		const raw = (value * volume) / 100
		const n = key === "sackRate" ? Math.round(raw * 2) / 2 : Math.round(raw)
		return { unit: "per 100 snaps", detail: `${n} ${n === 1 ? c.one : c.many} in ${volume} ${volume === 1 ? "snap" : "snaps"}` }
	}
	const n = Math.round(value * volume)
	return { unit: "of his tackle chances missed", detail: `${n} ${n === 1 ? c.one : c.many} on ${volume} tackle ${volume === 1 ? "chance" : "chances"}` }
}

/** His best and worst game on a stat among games with enough plays to mean something, by what the stat counts as better. */
export function extremeGames(log: PlayerLog | undefined, key: string, higher: boolean | null, minVolume: number): { best: GamePick; worst: GamePick } | null {
	if (higher === null) return null
	const games = (log?.g[key] ?? []).filter((p) => p[2] >= minVolume).map((p) => ({ week: p[0], value: p[1], volume: p[2] }))
	if (games.length < 3) return null
	const sorted = games.slice().sort((a, b) => (higher ? b.value - a.value : a.value - b.value))
	return { best: sorted[0], worst: sorted[sorted.length - 1] }
}
