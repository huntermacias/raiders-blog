import {defineArrayMember, defineField, defineType} from 'sanity'
import {TEAMS, TEAM_NAMES} from '../lib/nfl'

/**
 * One document per week holding your power rankings for all 32 teams. A new
 * document comes pre-filled with every team; drag the rows into your order
 * (top row = No. 1). Movement arrows and the rank-history sparklines on
 * /rankings are worked out from the earlier weeks, so you never enter them.
 */
export default defineType({
	name: 'powerRankings',
	title: 'Power Rankings (all 32 teams)',
	type: 'document',
	initialValue: () => ({
		season: 2026,
		teams: TEAMS.map((t) => ({
			_type: 'rankedTeam',
			_key: t.abbr.toLowerCase(),
			team: t.name,
		})),
	}),
	fields: [
		defineField({
			name: 'season',
			title: 'Season',
			type: 'number',
			validation: (Rule) => Rule.required().integer(),
		}),
		defineField({
			name: 'week',
			title: 'Week',
			type: 'number',
			validation: (Rule) => Rule.required().integer().min(1).max(22),
		}),
		defineField({
			name: 'headline',
			title: 'The week in one line',
			description: 'Optional. Shows under the page title, e.g. "Raiders jump four spots after beating the Chargers".',
			type: 'string',
			validation: (Rule) => Rule.max(140),
		}),
		defineField({
			name: 'post',
			title: 'Write-up',
			description: 'Optional. The post with the full rankings article; the page links to it.',
			type: 'reference',
			to: [{type: 'post'}],
		}),
		defineField({
			name: 'teams',
			title: 'Rankings (drag to reorder, top = No. 1)',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'rankedTeam',
					fields: [
						defineField({
							name: 'team',
							title: 'Team',
							type: 'string',
							options: {list: TEAM_NAMES},
							validation: (Rule) => Rule.required(),
						}),
						defineField({
							name: 'note',
							title: 'One-line blurb',
							type: 'string',
							validation: (Rule) => Rule.max(160),
						}),
					],
					preview: {
						select: {team: 'team', note: 'note'},
						prepare({team, note}) {
							return {title: team ?? 'Team', subtitle: note}
						},
					},
				}),
			],
			validation: (Rule) =>
				Rule.custom((teams: Array<{team?: string}> | undefined) => {
					if (!teams) return true
					const seen = new Set<string>()
					for (const t of teams) {
						if (!t.team) continue
						if (seen.has(t.team)) return `${t.team} is listed more than once`
						seen.add(t.team)
					}
					if (teams.length !== 32) return `Rank all 32 teams (currently ${teams.length})`
					return true
				}),
		}),
	],
	orderings: [
		{title: 'Week, newest first', name: 'weekDesc', by: [{field: 'season', direction: 'desc'}, {field: 'week', direction: 'desc'}]},
	],
	preview: {
		select: {season: 'season', week: 'week', first: 'teams.0.team'},
		prepare({season, week, first}) {
			return {title: `${season ?? '?'} power rankings, week ${week ?? '?'}`, subtitle: first ? `No. 1: ${first}` : undefined}
		},
	},
})
