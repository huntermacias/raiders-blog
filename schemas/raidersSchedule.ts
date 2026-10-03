import {defineArrayMember, defineField, defineType} from 'sanity'
import {RAIDERS, TEAM_NAMES} from '../lib/nfl'

/**
 * The Raiders' regular-season schedule, one document per season. A new
 * document comes with 18 week rows; fill in the opponent, home/away and
 * kickoff for each, and tick "Bye week" on the open week (clear its
 * opponent). The /schedule page joins these rows with your picks, previews
 * and recaps by week number, so the result and links appear on their own.
 */
export default defineType({
	name: 'raidersSchedule',
	title: 'Raiders Schedule',
	type: 'document',
	initialValue: () => ({
		season: 2026,
		games: Array.from({length: 18}, (_, i) => ({
			_type: 'scheduleGame',
			_key: `wk${i + 1}`,
			week: i + 1,
			bye: false,
			homeAway: 'home',
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
			name: 'games',
			title: 'Weeks',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'scheduleGame',
					fields: [
						defineField({
							name: 'week',
							title: 'Week',
							type: 'number',
							validation: (Rule) => Rule.required().integer().min(1).max(22),
						}),
						defineField({name: 'bye', title: 'Bye week', type: 'boolean', initialValue: false}),
						defineField({
							name: 'opponent',
							title: 'Opponent',
							type: 'string',
							hidden: ({parent}) => Boolean(parent?.bye),
							options: {list: TEAM_NAMES.filter((n) => n !== RAIDERS)},
						}),
						defineField({
							name: 'homeAway',
							title: 'Home or away',
							type: 'string',
							initialValue: 'home',
							hidden: ({parent}) => Boolean(parent?.bye),
							options: {
								layout: 'radio',
								list: [
									{title: 'Home', value: 'home'},
									{title: 'Away', value: 'away'},
								],
							},
						}),
						defineField({
							name: 'kickoff',
							title: 'Kickoff',
							description: 'Date and time (Studio shows your local time; the site shows Pacific).',
							type: 'datetime',
							hidden: ({parent}) => Boolean(parent?.bye),
						}),
						defineField({
							name: 'network',
							title: 'TV / streaming',
							description: 'Optional, e.g. CBS, FOX, Prime Video.',
							type: 'string',
							hidden: ({parent}) => Boolean(parent?.bye),
							validation: (Rule) => Rule.max(30),
						}),
					],
					preview: {
						select: {week: 'week', bye: 'bye', opp: 'opponent', ha: 'homeAway'},
						prepare({week, bye, opp, ha}) {
							const title = bye ? 'Bye week' : opp ? `${ha === 'away' ? 'at' : 'vs'} ${opp}` : 'Opponent not set'
							return {title: `Week ${week ?? '?'}: ${title}`}
						},
					},
				}),
			],
			validation: (Rule) =>
				Rule.custom((games: Array<{week?: number}> | undefined) => {
					if (!games) return true
					const seen = new Set<number>()
					for (const g of games) {
						if (typeof g.week !== 'number') continue
						if (seen.has(g.week)) return `Week ${g.week} appears more than once`
						seen.add(g.week)
					}
					return true
				}),
		}),
	],
	preview: {
		select: {season: 'season'},
		prepare({season}) {
			return {title: `${season ?? '?'} Raiders schedule`}
		},
	},
})
