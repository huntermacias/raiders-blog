import {defineArrayMember, defineField, defineType} from 'sanity'
import {TEAMS, TEAM_NAMES} from '../lib/nfl'

/**
 * One document per season holding win-total picks for all 32 teams. A brand
 * new document is pre-filled with every team (initialValue below), so the
 * workflow is: set each team's predicted wins once in the preseason, then
 * update wins/losses/ties and "Through week" as the season plays out.
 */
export default defineType({
	name: 'seasonPredictions',
	title: 'Season Predictions (all 32 teams)',
	type: 'document',
	initialValue: () => ({
		season: 2026,
		throughWeek: 0,
		isFinal: false,
		teams: TEAMS.map((t) => ({
			_type: 'teamPrediction',
			_key: t.abbr.toLowerCase(),
			team: t.name,
			playoffs: false,
			divisionWinner: false,
			wins: 0,
			losses: 0,
			ties: 0,
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
			name: 'throughWeek',
			title: 'Records are through week',
			description: 'Update this each week when you update the records below.',
			type: 'number',
			validation: (Rule) => Rule.integer().min(0).max(22),
		}),
		defineField({
			name: 'isFinal',
			title: 'Regular season is over',
			description: 'Flip on after Week 18 to grade every pick as a final hit / close / miss.',
			type: 'boolean',
			initialValue: false,
		}),
		defineField({
			name: 'teams',
			title: 'Teams',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'teamPrediction',
					fields: [
						defineField({
							name: 'team',
							title: 'Team',
							type: 'string',
							options: {list: TEAM_NAMES},
							validation: (Rule) => Rule.required(),
						}),
						defineField({
							name: 'predictedWins',
							title: 'Your predicted wins (0 to 17)',
							type: 'number',
							validation: (Rule) => Rule.integer().min(0).max(17),
						}),
						defineField({name: 'playoffs', title: 'Makes the playoffs?', type: 'boolean', initialValue: false}),
						defineField({name: 'divisionWinner', title: 'Wins the division?', type: 'boolean', initialValue: false}),
						defineField({
							name: 'note',
							title: 'One-line reasoning',
							type: 'string',
							validation: (Rule) => Rule.max(160),
						}),
						defineField({name: 'wins', title: 'Actual wins so far', type: 'number', initialValue: 0, validation: (Rule) => Rule.integer().min(0).max(17)}),
						defineField({name: 'losses', title: 'Actual losses so far', type: 'number', initialValue: 0, validation: (Rule) => Rule.integer().min(0).max(17)}),
						defineField({name: 'ties', title: 'Actual ties so far', type: 'number', initialValue: 0, validation: (Rule) => Rule.integer().min(0).max(17)}),
					],
					preview: {
						select: {team: 'team', pw: 'predictedWins', w: 'wins', l: 'losses'},
						prepare({team, pw, w, l}) {
							const pick = typeof pw === 'number' ? `Pick ${pw}-${17 - pw}` : 'No pick yet'
							return {title: team ?? 'Team', subtitle: `${pick} · Now ${w ?? 0}-${l ?? 0}`}
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
					return true
				}),
		}),
	],
	preview: {
		select: {season: 'season', week: 'throughWeek'},
		prepare({season, week}) {
			return {title: `${season ?? '?'} season predictions`, subtitle: `Records through week ${week ?? 0}`}
		},
	},
})
