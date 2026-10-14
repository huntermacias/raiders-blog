import type { Metadata } from "next"
import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import PlayerCard from "@/components/lab/players/PlayerCard"
import PlayerSearch from "@/components/lab/players/PlayerSearch"
import { BoardIndex, GroupLeaderCard, HowToRead, RoleCard } from "@/components/lab/players/Sections"
import SeasonArcs, { arcRows } from "@/components/lab/players/SeasonArcs"
import StatTile from "@/components/lab/players/StatTile"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { teamNick } from "@/lib/lab/playerView"
import { SIT_BOARDS, sitBoardHref } from "@/lib/lab/situationsKit"
import GroupTabs from "@/components/lab/players/GroupTabs"
import { V2Cards, V2HowItWorks } from "@/components/lab/v2/V2Explainer"
import { isV2Site } from "@/lib/lab/labMethod"
import { GROUP_META, GROUP_ORDER, HEADLINE, MOVE_MIN, SIDES, overall, players, profileSlugs, risersFallers, roleMovers, searchIndex, standouts } from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"
// Built from the JSON in the repo, so it is static: it changes when a data refresh (every few hours on game days) is deployed.
const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/players`
const TITLE = "NFL player stats in context: every player ranked, tracked and compared | Raiders Rundown"
const DESCRIPTION = "Every qualifying NFL player ranked against the players who do his job, with the advanced numbers the box score hides, how each one has changed through the season, and how sure we are of it."
export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    openGraph: { type: "website", title: "NFL player stats in context | Raiders Rundown", description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
    twitter: { card: "summary_large_image", title: "NFL player stats in context | Raiders Rundown", description: DESCRIPTION, images: [`${SITE_URL}/og-default-v2.png`] },
  }
}
function Section({ id, title, blurb, children, tint = false }: { id: string; title: string; blurb?: React.ReactNode; children: React.ReactNode; tint?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-28 border-t border-lab-line ${tint ? "bg-lab-tint" : ""}`} aria-labelledby={`${id}-heading`}>
      <div className="container py-12 sm:py-16">
        <div className="mb-7 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
          <div>
            <span aria-hidden="true" className="mb-4 block h-1 w-10 rounded-full bg-lab-ink" />
            <h2 id={`${id}-heading`} className="m-0 max-w-xl font-serif text-3xl font-bold leading-[1.08] tracking-tight text-lab-ink sm:text-4xl">
              {title}
            </h2>
          </div>
          {blurb ? <div className="max-w-2xl text-sm leading-relaxed text-lab-soft sm:pt-5 sm:text-[15px]">{blurb}</div> : null}
        </div>
        {children}
      </div>
    </section>
  )
}

export default function PlayersPage() {
  const data = getPlayers()
  const logs = getPlayerLogs().logs
  const has = data.players.length > 0
  const us = data.team
  const mine = risersFallers(data, { team: us, limit: 3 })
  const around = risersFallers(data, { limit: 3, byConfidence: true })
  const { best, worst } = standouts(data, { team: us, top: 3, hi: 80, lo: 20 })
  const raidersRoles = roleMovers(data, { team: us, limit: 4 })
  const leagueRoles = roleMovers(data, { limit: 6 }).filter((r) => r.player.team !== us)
  const roster = players(data).filter((p) => p.team === us)
  const lagging = data.defWeek > 0 && data.defWeek < data.week
  const example = (() => {
    const p = roster.find((x) => x.group === "te" || x.group === "wr") ?? roster[0]
    return p ? { player: p, key: HEADLINE[p.group] } : undefined
  })()
  const logOf = (p: { slug: string; group: (typeof GROUP_ORDER)[number] }) => logs[p.slug]?.[p.group]
  const arcs = arcRows(roster, logOf)
  return (
    <div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
      <header className="relative isolate overflow-hidden border-b border-lab-line bg-lab-page">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(ellipse at 84% 20%, color-mix(in srgb, var(--lab-ink) 7%, transparent), transparent 48%), linear-gradient(110deg, transparent 40%, color-mix(in srgb, var(--lab-ink) 3%, transparent))" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-8 select-none font-serif text-[clamp(10rem,29vw,28rem)] font-black leading-none text-lab-ink opacity-[0.025]">32</div>
        <div className="container relative pb-10 pt-8 sm:pb-14 sm:pt-12">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-lab-muted">
            <p className="m-0"><Link href="/lab" className="transition-colors hover:text-lab-ink">The Lab</Link> <span aria-hidden="true" className="mx-2">/</span> Player intelligence</p>
            <span>{data.season} season</span>
          </div>
          <div className="mt-9 grid items-center gap-9 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:gap-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-lab-line-strong bg-lab-surface/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-lab-soft">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Every position. Every Sunday.
              </div>
              <h1 className="m-0 mt-5 max-w-3xl font-serif text-[clamp(2.9rem,6.2vw,5.8rem)] font-bold leading-[0.97] tracking-[-0.045em] text-lab-ink [text-wrap:balance]">
                Know the player.<br /><span className="text-lab-soft">Not just the stat.</span>
              </h1>
              <p className="m-0 mt-6 max-w-xl text-base leading-relaxed text-lab-soft sm:text-lg">
                Advanced NFL statistics with context: who is performing, who is trending, and how much evidence stands behind the numbers. Explore any player or start with a position.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-5 border-t border-lab-line pt-5">
                <div><p className="m-0 font-mono text-2xl font-bold tabular-nums text-lab-ink">{profileSlugs(data).length.toLocaleString("en-US")}</p><p className="m-0 mt-1 text-[11px] uppercase tracking-[0.12em] text-lab-muted">Player profiles</p></div>
                <div aria-hidden="true" className="h-9 w-px bg-lab-line" />
                <div><p className="m-0 font-mono text-2xl font-bold tabular-nums text-lab-ink">{GROUP_ORDER.length}</p><p className="m-0 mt-1 text-[11px] uppercase tracking-[0.12em] text-lab-muted">Position groups</p></div>
                <div aria-hidden="true" className="h-9 w-px bg-lab-line" />
                <div><p className="m-0 font-mono text-2xl font-bold tabular-nums text-lab-ink">{data.week}</p><p className="m-0 mt-1 text-[11px] uppercase tracking-[0.12em] text-lab-muted">Current week</p></div>
              </div>
            </div>
            <div className="relative min-w-0 overflow-hidden rounded-2xl border border-lab-line-strong bg-lab-surface p-5 shadow-[0_28px_90px_rgba(0,0,0,0.13)] sm:p-7">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-lab-ink" />
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.17em] text-lab-muted">Start exploring</p>
              <h2 className="m-0 mt-2 font-serif text-2xl font-bold text-lab-ink sm:text-3xl">Find your player.</h2>
              <p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">Search the NFL, then compare the season, the player's contribution and the bigger picture.</p>
              <PlayerSearch className="mt-6 w-full" index={searchIndex(data)} placeholder="Search players, e.g. Brock Bowers" autoFocus={false} />
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Link href="#leaders" className="group flex min-h-12 items-center justify-between gap-2 rounded-lg border border-lab-line-strong px-3 py-3 text-sm font-semibold text-lab-ink transition-colors hover:border-lab-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink">
                  League leaders <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <Link href="/lab/players/compare" className="group flex min-h-12 items-center justify-between gap-2 rounded-lg border border-lab-line-strong px-3 py-3 text-sm font-semibold text-lab-ink transition-colors hover:border-lab-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink">
                  Compare players <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>
              <div className="mt-6 border-t border-lab-line pt-5">
                <p className="m-0 mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-lab-muted">Explore by position</p>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {SIDES.flatMap((s) => s.groups).map((g) => (
                    <li key={g}><Link href={`/lab/players/leaders/${g}`} className="inline-flex min-h-9 items-center rounded-full border border-lab-line px-3 py-1 text-xs font-semibold text-lab-soft transition-colors hover:border-lab-ink hover:text-lab-ink">{GROUP_META[g].title}</Link></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-lab-line pt-4">
            <UpdatedStamp at={data.generatedAt} kind="grades" />
            {lagging ? <p className="m-0 text-xs text-lab-muted">Defensive numbers currently through Week {data.defWeek}; charting can trail games by a day or two.</p> : null}
          </div>
        </div>
      </header>
      {has ? (
        <>
        <Section id="leaders" title="The NFL, position by position" blurb={<p className="m-0">Start with the league leaders. Open a board to explore every qualifying player, filter by team, and see the box-score numbers alongside the advanced metrics.</p>} tint>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {GROUP_ORDER.map((g) => (
                <GroupLeaderCard key={g} data={data} group={g} />
              ))}
            </div>
          </Section>
            <div className="border-t border-lab-line bg-lab-surface/60">
            <section className="container py-7 sm:py-9" aria-label="Understanding the player cards">
              <HowToRead data={data} example={example} />
            </section>
          </div>
          <Section
            id="raiders-moving"
            title="Raiders on the move: the season so far"
            blurb={
              <p className="m-0">
                How each Raider's season has gone. The cards compare his last {data.formGames} games with the games before them, against everyone at his position, in grade points ({MOVE_MIN} is a real move and 10 is a full standard deviation), and a stat that is still mostly luck counts for less. Under the cards, every Raider's standing is traced week by week. Each card says how sure the change is, because after a few games a stat can swing on a handful of plays.
                </p>
            }
          >
            {mine.risers.length || mine.fallers.length ? (
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <h3 className="m-0 mb-3 font-serif text-xl font-bold text-emerald-700 dark:text-emerald-400">
                    <span aria-hidden="true">▲ </span>Playing better
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {mine.risers.map((p) => (
                      <PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
                    ))}
                  </div>
                  {!mine.risers.length ? <p className="m-0 text-sm text-lab-soft">Nobody has moved up by {MOVE_MIN} grade points or more yet.</p> : null}
                </div>
                <div>
                  <h3 className="m-0 mb-3 font-serif text-xl font-bold text-rose-700 dark:text-rose-400">
                    <span aria-hidden="true">▼ </span>Slipping
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {mine.fallers.map((p) => (
                      <PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
                    ))}
                  </div>
                  {!mine.fallers.length ? <p className="m-0 text-sm text-lab-soft">Nobody has moved down by {MOVE_MIN} grade points or more yet.</p> : null}
                </div>
              </div>
            ) : (
              <p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm leading-relaxed text-lab-soft">No Raider has moved by {MOVE_MIN} grade points or more with enough plays behind it. That is normal after a steady stretch.</p>
            )}
              {arcs.length ? (
                <>
                  <h3 className="m-0 mb-1 mt-10 font-serif text-xl font-bold">The whole roster, week by week</h3>
                  <p className="m-0 mb-4 max-w-3xl text-sm leading-relaxed text-lab-soft">Where each Raider has stood among the players at his position after every game, averaged over the stats that make up his grade. A line that climbs means he has passed more and more of them; it moves slowly on purpose, so one big Sunday does not fool it.</p>
                  <SeasonArcs data={data} rows={arcs} />
                </>
              ) : null}
            <p className="m-0 mt-6 max-w-3xl text-xs leading-relaxed text-lab-muted">
              Small samples move fast. After {data.week} {data.week === 1 ? "game" : "games"}, treat a move as a reason to watch, not a verdict. “A clear change” means the move is bigger than what a few plays would produce by chance.
            </p>
          </Section>
          {best.length || worst.length ? (
            <Section id="box-score-hides" title="What the box score hides" blurb={<p className="m-0">The Raiders' most telling numbers, each set against every player at the position, with what the box score would have shown instead. Only numbers that have settled enough to mean something earn a spot: a stat like missed tackles or drops, where a few plays still decide who is on top, stays off this list until the season firms it up.</p>} tint>
              {best.length ? (
                <>
                  <h3 className="m-0 mb-3 font-serif text-xl font-bold">Where they stand out</h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {best.map((x) => (
                      <StatTile key={x.player.id + x.stat.k} data={data} player={x.player} stat={x.stat} showBox />
                    ))}
                  </div>
                </>
              ) : null}
              {worst.length ? (
                <>
                  <h3 className="m-0 mb-3 mt-10 font-serif text-xl font-bold">Where they struggle</h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {worst.map((x) => (
                      <StatTile key={x.player.id + x.stat.k} data={data} player={x.player} stat={x.stat} showBox />
                    ))}
                  </div>
                </>
              ) : null}
            </Section>
          ) : null}
          {raidersRoles.length || leagueRoles.length ? (
            <Section
              id="playing-time"
              title="Playing time is shifting"
              blurb={<p className="m-0">Snaps often move before the stats do. Each card says what changed in plain words, then shows every game: how much of the team's offensive or defensive snaps he played, and where he missed a game entirely.</p>}
            >
              {raidersRoles.length ? (
                <div className="grid gap-4 md:grid-cols-2" data-testid="role-movers">
                  {raidersRoles.map(({ player, role }) => (
                    <RoleCard key={player.id + player.group} data={data} player={player} role={role} log={logOf(player)} />
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-lab-soft">No Raider's role has changed much lately.</p>
              )}
              {leagueRoles.length ? (
                <>
                  <h3 className="m-0 mb-3 mt-10 font-serif text-xl font-bold">Around the league</h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {leagueRoles.map(({ player, role }) => (
                      <RoleCard key={player.id + player.group} data={data} player={player} role={role} log={logOf(player)} />
                    ))}
                  </div>
                </>
              ) : null}
            </Section>
          ) : null}
          <Section id="roster" title="The Raiders, card by card" blurb={isV2Site() ? <><p className="m-0">Every Raider with enough plays to rank. The big number is his percentile among players at his job on this season's numbers (99 is best of the league). Open a card for the other two answers: what he has contributed so far, and his projection.</p><div className="mt-4"><V2Cards /></div></> : <p className="m-0">Every Raider with enough plays to grade. The big Overall number runs 1 to 99, with 50 average. It is his scouting grade stretched onto that scale, so a quarterback at 80 is in the league's top 1%. The grade itself is the average of his main stats against that position: 50 is average and each 10 points is a standard deviation. His place at the position (39th of 40, say) is shown beside it. Open a card for the whole season.</p>} tint>
            <div className="grid gap-10">
              {SIDES.map((side) => {
                const list = roster.filter((p) => side.groups.includes(p.group)).sort((a, b) => (overall(b) ?? 0) - (overall(a) ?? 0))
                if (!list.length) return null
                return (
                  <div key={side.id}>
                    <h3 className="m-0 mb-3 font-serif text-xl font-bold">{side.title}</h3>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((p) => (
                        <PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
          {around.risers.length || around.fallers.length ? (
            <Section id="league-movers" title="Around the league: the surest movers" blurb={<p className="m-0">The players whose recent change is most convincing, not just largest. A move counts for more when it shows up across several stats and enough plays.</p>}>
              <GroupTabs
                label="Pick a position"
                event="lab_movers_tab"
                tabs={[
                  {
                    id: "all",
                    label: "Everyone",
                    count: around.risers.length + around.fallers.length,
                    panel: (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {[...around.risers, ...around.fallers].map((p) => (
                          <PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
                        ))}
                      </div>
                    ),
                  },
                  ...GROUP_ORDER.map((g) => {
                    const m = risersFallers(data, { group: g, limit: 3, byConfidence: true })
                    return { g, list: [...m.risers, ...m.fallers] }
                  })
                    .filter((x) => x.list.length)
                    .map((x) => ({
                      id: x.g,
                      label: GROUP_META[x.g].title,
                      count: x.list.length,
                      panel: (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {x.list.map((p) => (
                            <PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
                          ))}
                        </div>
                      ),
                    })),
                ]}
              />
            </Section>
          ) : null}
          <Section id="situations" title="Situational football: who delivers when it counts" blurb={<p className="m-0">Success on 3rd down, on 3rd and short, inside the 20. Rank every quarterback, back, receiver and tight end in the spot you pick, and open any player to see every play of every game as a success or a failure.</p>}>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {SIT_BOARDS.map((b) => (
                <li key={b.slug}>
                  <Link href={sitBoardHref(b.slug)} className="block rounded-xl border border-lab-line bg-lab-surface p-4 hover:border-lab-ink">
                    <span className="block font-serif text-lg font-bold text-lab-ink">{b.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-lab-muted">By down, by distance and in the red zone, against the league average.</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
          <Section id="money" title="Pay against play" tint blurb={<p className="m-0">Contracts and cap hits for every NFL team, set beside how each player has played. Compare two players' money on the compare page, or see every position ranked by who is earning more than his contract and who is not.</p>}>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
              <li>
                <Link href="/lab/players/value" className="block rounded-xl border border-lab-line bg-lab-surface p-4 hover:border-lab-ink">
                  <span className="block font-serif text-lg font-bold text-lab-ink">Pay against play board</span>
                  <span className="mt-1 block text-xs leading-relaxed text-lab-muted">Grade rank against pay rank at every position, early reads marked.</span>
                </Link>
              </li>
              <li>
                <Link href="/lab/players/compare" className="block rounded-xl border border-lab-line bg-lab-surface p-4 hover:border-lab-ink">
                  <span className="block font-serif text-lg font-bold text-lab-ink">Compare two players, money included</span>
                  <span className="mt-1 block text-xs leading-relaxed text-lab-muted">Per-year pay, cap hit, guaranteed money and years left, side by side.</span>
                </Link>
              </li>
            </ul>
          </Section>
          <Section id="all-boards" title="Every leaderboard" blurb={<p className="m-0">One page per stat. Solid pills are advanced stats, graded against the league. Dashed pills are box-score totals.</p>}>
            <BoardIndex data={data} />
          </Section>
          <section className="border-t border-lab-line" aria-labelledby="how-it-works">
            <div className="container py-10 sm:py-12">
              <details className="max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
                <summary id="how-it-works" className="cursor-pointer text-sm font-semibold text-lab-ink">
                  {isV2Site() ? "How the three views work" : "How the grades, ranks and movers work"}
                </summary>
                {isV2Site() ? <V2HowItWorks formGames={data.formGames} /> : (<ol className="mb-3 mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted">
                  <li>Every player is compared only with players who do the same job: {GROUP_ORDER.map((g) => GROUP_META[g].title.toLowerCase()).join(", ")}. A defensive tackle is never graded against an edge rusher.</li>
                  <li>To be graded on a stat a player needs enough plays behind it (for example 40 dropbacks for a quarterback or 12 targets for a receiver). Everyone below that is left off, rather than ranked on a few plays.</li>
                  <li>Rank is among the players who qualify. The strip under each number shows the 10th-best to the 90th-best player; the shaded part is the middle half. The thin line beside the dot is the range his true level most likely sits in, which is wide when few plays are behind it.</li>
                  <li>A grade puts the stat on the scouting scale: 50 is the average of the qualifying players and every 10 points is one standard deviation. For a stat where less is better, like drops, the scale is flipped so a higher grade is always better.</li>
                  <li>The Overall number on a card is the scouting grade stretched onto 1 to 99, with 50 average and about 80 the league's top 1%. The raw grade is shown beside it, and his place at the position (such as 39th of 40) sits next to the number. Grades bunch near 50 early in a season, because each stat is pulled toward the league average until more plays are behind it, and because averaging several stats smooths the extremes. The best grade at a position can be in the mid-50s in October, so the stretch is read off the season's own spread and loosens as games are played. Overall can slide a few points week to week as the stretch adjusts, even when his own play has not changed.</li>
                  <li>The same stat is measured three ways: over the whole season, over the team's last {data.formGames} games, and over the games before that. A mover score is the average change in grade between the last two, with the main stat counting double and a thin recent sample counting for less. How sure the change is comes from comparing it with the noise a handful of plays creates.</li>
                  <li>Stats that describe a style, like how deep a quarterback throws or how often a back runs to the edge, are shown against the league but never graded. Stats that are mostly zeros, like drop rate, are shown and graded but not counted in the overall grade.</li>
                  <li>Early in a season a rate over a handful of plays, like missed tackles, drops or field goal percentage, is mostly luck. Each stat carries a measure of how much of the gap between players is real so far. Players are ranked on the number pulled toward the league average by how few plays are behind it, a stat that is mostly luck is marked "too early to rank", and none of those earns a tier, a badge, a standout card or a verdict in a read. They firm up as games are played.</li>
                  <li>Field goals are judged against the make rate of every kick of that distance this season, and EPA means expected points added from the down, distance and field position.</li>
                </ol>)}
                <p className="m-0 text-xs leading-relaxed text-lab-muted">
                  These are not film grades. They come from play-by-play, charting and snap-count data, so they cannot see blocking, route running or assignments. For that reason offensive linemen get no overall grade and no rank on their line's numbers. A lineman's page shows his own record (starts, snaps, penalties) and, labeled as his line's, the run success and sacks allowed of the unit in the games he started, which the five who start together share. Box-score totals use the same games as the rest of the page.
                </p>
              </details>
            </div>
          </section>
        </>
      ) : (
        <section className="container py-14">
          <div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
            <h2 className="m-0 font-serif text-2xl font-bold">Opens after the first games</h2>
            <p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">Player numbers need a few games to mean anything. Check back after the first week of the season is in the data.</p>
          </div>
        </section>
      )}
      <section className="border-t border-lab-line">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-8">
          <Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
            ← The Lab
          </Link>
          <UnitsCredit />
        </div>
      </section>
      <MoreFromLab current="/lab/players" weeks={labWeeks()} />
      <span className="sr-only">Showing {teamNick(us)} first.</span>
    </div>
  )
}
