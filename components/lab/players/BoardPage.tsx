import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import TeamLink from "@/components/lab/players/TeamLink"
import TrackView from "@/components/lab/players/TrackView"
import LeaderTable, { type BoxCol, type LeaderRowSlim } from "@/components/lab/players/LeaderTable"
import { BoardIndex } from "@/components/lab/players/Sections"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import ViewTabs from "@/components/lab/v2/ViewTabs"
import { getPlayers } from "@/lib/lab/data"
import { isV2 } from "@/lib/lab/v2/types"
import { observedKey } from "@/lib/lab/v2/kit"
import {
  BOX,
  type Board,
  GROUP_META,
  GROUP_ORDER,
  type PlayerGroup,
  boards,
  formatStat,
  formatBox,
  leaders,
  statInfo,
  STAT,
  SIGNAL_HELP,
  SIGNAL_WORD,
  signalOf,
  UNIT_NOTE,
} from "@/lib/lab/playersKit"
import { boardHref } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"
const SITE_URL = "https://www.raidersrundown.com"
/** One leaderboard: the definition, the table, and a way to every other board. */
export default function BoardPage({ group, board }: { group: PlayerGroup; board: Board }) {
  const data = getPlayers()
  const meta = GROUP_META[group]
  const info = board.kind === "stat" ? statInfo(group, board.key) : null
  const rows = leaders(data, board)
  const yard = board.kind === "stat" ? (data.yard[group]?.[board.key] ?? null) : null
  const signal = info && info.higher !== null ? signalOf(yard) : null
  const slim: LeaderRowSlim[] = rows.map((r) => ({
    slug: r.player.slug,
    name: r.player.name,
    team: r.player.team,
    pos: r.player.pos,
    espn: r.player.espn,
    shot: r.player.shot,
    v: r.value,
    rank: r.rank,
    n: r.volume,
    d: r.delta,
    z: r.z,
    box: r.player.box,
  }))
  const boxCols: BoxCol[] = Object.entries(BOX[group]).map(([key, b]) => ({ key, short: b.short, label: b.label }))
  const teams = Array.from(new Set(rows.map((r) => r.player.team))).sort()
  const url = `${SITE_URL}/lab/players/leaders/${group}/${board.path}`
  const first = rows[0]
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
      { "@type": "ListItem", position: 2, name: "Players", item: `${SITE_URL}/lab/players` },
      { "@type": "ListItem", position: 3, name: meta.title, item: `${SITE_URL}/lab/players/leaders/${group}` },
      { "@type": "ListItem", position: 4, name: board.label, item: url },
    ],
  }
  const siblings = boards(group)
  return (
    <div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <header className="relative isolate overflow-hidden border-b border-lab-line bg-lab-page">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 85% 10%, color-mix(in srgb, var(--lab-ink) 8%, transparent), transparent 52%)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-4 top-4 font-serif text-[clamp(12rem,30vw,28rem)] font-black leading-none text-lab-ink opacity-[0.025]">01</div>
        <div className="container relative pb-8 pt-8 sm:pb-11 sm:pt-11">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-lab-muted">
            <Link href="/lab/players" className="transition-colors hover:text-lab-ink">Player Lab</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/lab/players/leaders/${group}`} className="transition-colors hover:text-lab-ink">{meta.title}</Link>
            <span aria-hidden="true">/</span>
            <span className="text-lab-ink">{board.label}</span>
          </nav>
          <div className="mt-8 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:gap-14">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.19em] text-lab-muted">{meta.title} / Leaderboard</p>
              <h1 className="m-0 mt-3 max-w-4xl font-serif text-[clamp(2.6rem,5.5vw,5rem)] font-bold leading-[1.01] tracking-[-0.035em] text-lab-ink [text-wrap:balance]">
                {board.label}<span className="block text-lab-soft">{meta.title.toLowerCase()} ranked.</span>
              </h1>
              <p className="m-0 mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
                {info ? info.what : `${board.label} so far this season. A box-score total, shown beside the advanced numbers so you can see who piles up counts and who makes them count.`}
              </p>
              {info ? (
                <details className="group mt-5 max-w-2xl rounded-xl border border-lab-line bg-lab-surface/80 px-4 py-3 text-sm text-lab-soft">
                  <summary className="cursor-pointer font-semibold text-lab-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink">Why the box score misses it <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">→</span></summary>
                  <p className="m-0 mt-3 leading-relaxed">{info.box}</p>
                </details>
              ) : null}
            </div>
            <aside className="relative min-w-0 overflow-hidden rounded-2xl border border-lab-line-strong bg-lab-surface/95 p-5 shadow-[0_20px_65px_rgba(0,0,0,0.10)] sm:p-6" aria-label="Leaderboard snapshot">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-lab-ink" />
              {first && !(board.kind === "box" && BOX[group][board.key]?.bad) && !info?.unit && signal !== "luck" ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-lab-muted">
                    <span>Top of the board</span><span className="font-mono">NO. 01</span>
                  </div>
                  <Link href={`/lab/players/${first.player.slug}`} className="group mt-4 block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink">
                    <p className="m-0 font-serif text-2xl font-bold leading-tight text-lab-ink transition-colors group-hover:text-lab-soft sm:text-3xl">{first.player.name}</p>
                    <p className="m-0 mt-1 text-xs font-semibold uppercase tracking-wider text-lab-muted">{first.player.team} · {meta.single}</p>
                  </Link>
                  <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-lab-line pt-4">
                    <span className="font-mono text-3xl font-bold tabular-nums text-lab-ink sm:text-4xl">{board.kind === "stat" ? formatStat(group, board.key, first.value) : formatBox(group, board.key, first.value)}</span>
                    <span className="max-w-32 text-right text-[11px] leading-snug text-lab-muted">{board.label}</span>
                  </div>
                  <p className="m-0 mt-3 text-xs text-lab-soft">Sample: {first.volume} {info?.per ?? "plays"}. Read smaller samples with care.</p>
                  {yard && info ? <p className="m-0 mt-2 text-xs text-lab-soft">Typical {meta.single.toLowerCase()}: <span className="font-semibold text-lab-ink">{formatStat(group, board.key, yard.q[2])}</span></p> : null}
                  <Link href={`/lab/players/${first.player.slug}`} className="mt-5 inline-flex min-h-10 items-center text-xs font-semibold text-lab-ink underline decoration-lab-line-strong underline-offset-4 hover:decoration-current">Explore player profile →</Link>
                </>
              ) : (
                <>
                  <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-lab-muted">The field</p>
                  <p className="m-0 mt-4 font-mono text-5xl font-bold leading-none tabular-nums text-lab-ink">{slim.length}</p>
                  <p className="m-0 mt-2 text-sm text-lab-soft">Players listed on this board</p>
                  <p className="m-0 mt-5 border-t border-lab-line pt-4 text-xs leading-relaxed text-lab-muted">{info?.unit ? "This is a shared unit measure, not an individual performance grade." : signal === "luck" ? "Too early for an elite/poor verdict: sample sizes still matter." : "Explore the table for the full ranking and player context."}</p>
                </>
              )}
            </aside>
          </div>
          {isV2(data) ? (
            <div className="mt-8 border-t border-lab-line pt-6" aria-label="Choose ranking perspective">
              <p className="m-0 mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-lab-muted">Three distinct answers</p>
              <ViewTabs data={data} group={group} current="season" seasonHref={boardHref(group, statInfo(group, observedKey(data, group))?.path ?? board.path)} />
            </div>
          ) : null}
          {info?.unit ? (
            <p className="m-0 mt-6 max-w-4xl rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="unit-note"><span className="font-semibold text-lab-ink">A line stat, not one man's. </span>{UNIT_NOTE} Linemen who start together are tied here and ordered by snaps played.</p>
          ) : null}
          {signal && signal !== "real" ? (
            <p className="m-0 mt-4 max-w-4xl rounded-xl border border-dashed border-lab-line-strong bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="signal-note"><span className="font-semibold text-lab-ink">{SIGNAL_WORD[signal]}. </span>{SIGNAL_HELP[signal]}{signal === "luck" ? " Players are still ordered below, but nobody is called elite or poor on it yet." : ""}</p>
          ) : null}
          <p className="m-0 mt-5 max-w-4xl text-xs leading-relaxed text-lab-muted">
            {info ? `Players need at least ${meta.need} to qualify. ` : ""}
            {info?.higher === false ? "Lower is better. " : ""}
            {board.kind === "box" && BOX[group][board.key]?.bad ? "More is worse on this box-score total; first place means the most, not the best. " : ""}
            The full table below provides the position context.
          </p>
          <TrackView event="board_view" props={{ group, board: board.path }} />
          <UpdatedStamp at={data.generatedAt} kind="grades" className="mt-4" />
        </div>
      </header>
      <section className="container py-10 sm:py-12" aria-label="Leaderboard and metric navigation">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-lab-muted">Complete leaderboard</p>
            <h2 id="board-standings" className="m-0 mt-2 font-serif text-3xl font-bold tracking-tight text-lab-ink sm:text-4xl">The full field.</h2>
            <p className="m-0 mt-2 text-sm text-lab-soft">{slim.length} players · {board.label} · {meta.title}</p>
          </div>
          <Link href="/lab/players/compare" className="inline-flex min-h-11 items-center rounded-lg border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-ink transition-colors hover:border-lab-ink">Compare players <span aria-hidden="true" className="ml-2">→</span></Link>
        </div>
        <details className="group mt-6 rounded-xl border border-lab-line bg-lab-surface/70 px-4 py-3 sm:px-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-lab-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink [&::-webkit-details-marker]:hidden">
            <span>Change metric <span className="ml-2 text-xs font-normal text-lab-muted">Currently: {board.label}</span></span>
            <span aria-hidden="true" className="text-lab-soft transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-4 border-t border-lab-line pt-4">
            <p className="m-0 mb-3 text-[11px] leading-relaxed text-lab-muted">Solid buttons show advanced measures. Dashed buttons show box-score totals.</p>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {siblings.map((b) => (
            <li key={b.path + b.kind}>
              <TeamLink
                href={boardHref(group, b.path)}
                aria-current={b.path === board.path && b.kind === board.kind ? "page" : undefined}
                className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${b.path === board.path && b.kind === board.kind ? "border-lab-ink bg-lab-ink text-lab-page" : b.kind === "box" ? "border-dashed border-lab-line-strong text-lab-muted hover:border-lab-ink hover:text-lab-ink" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
              >
                {b.label}
              </TeamLink>
            </li>
          ))}
        </ul>
          </div>
        </details>
        <div className="mt-6" aria-labelledby="board-standings">
          {slim.length ? (
            <LeaderTable
              group={group}
              statKey={board.key}
              kind={board.kind}
              yard={yard}
              rows={slim}
              boxCols={boxCols}
              higher={info ? info.higher : true}
              teams={teams}
              defaultTeam=""
              valueLabel={info ? info.short : (BOX[group][board.key]?.short ?? board.label)}
              perLabel={info ? info.per.replace(/^\w/, (c) => c.toUpperCase()) : "Plays"}
              lean={info?.lean}
            />
          ) : (
            <p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">Nobody qualifies yet. This fills in as the season goes on.</p>
          )}
        </div>
        <details className="mt-8 max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
          <summary className="cursor-pointer text-sm font-semibold text-lab-ink">How to read this table</summary>
          <ul className="mb-2 mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted">
            <li>
              {isV2(data)
                ? `The number on the left is the league rank among ${meta.peers} with enough plays, from this season's plays only and in the order of the number shown, even when the list is filtered to one team. Nothing here is adjusted for how many plays are behind a number or for earlier seasons: the projection board does that, and says so.`
                : `The number on the left is the league rank among ${meta.peers}, even when the list is filtered to one team. On a graded stat the rank allows for how many plays are behind each number: a player with a few plays has his number pulled toward the middle, so he cannot jump ahead of a player who did the same over many more.`}
            </li>
            <li>“Against the league” draws each player on the same strip: the ends are the 10th-best and 90th-best player, the shaded stretch is the middle half, and the tick is the median. Right is always better.</li>
            <li>“Lately” is the change in grade between a player's last {data.formGames} games and the games before them. The tag says whether the change is bigger than what a few plays could cause.</li>
            <li>Tick “Show the box score” to put the traditional totals next to the advanced number and sort by either.</li>
          </ul>
        </details>
        <div className="mt-10">
          <h2 className="m-0 mb-4 font-serif text-2xl font-bold">Other leaderboards</h2>
          <BoardIndex data={data} current={{ group, path: board.path }} />
        </div>
        <p className="m-0 mt-8 text-xs text-lab-muted">
          {GROUP_ORDER.length} positions · {Object.keys(STAT[group]).length} advanced stats here · <Link href="/lab/players/compare" className="underline">Compare two players</Link>
        </p>
      </section>
      <section className="border-t border-lab-line">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-8">
          <Link href="/lab/players" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
            ← All players
          </Link>
          <UnitsCredit />
        </div>
      </section>
      <MoreFromLab current="/lab/players" weeks={labWeeks()} />
    </div>
  )
}
