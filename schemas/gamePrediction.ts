import {defineField, defineType} from 'sanity'
import {TEAM_NAMES} from '../lib/nfl'

/**
 * One document per game Hunter picks. Enter the pick before kickoff; after the
 * final, fill in the two actual scores and the site grades it automatically
 * (winner right/wrong + how far off the margin was). The two reader-vote
 * counters are written by /api/prediction-vote and are read-only here.
 */
export default defineType({
	name: 'gamePrediction',
	title: 'Game Prediction',
	type: 'document',
	fieldsets: [
		{
			name: 'result',
			title: 'Result (fill in after the final)',
			options: {collapsible: true, collapsed: false},
		},
		{
			name: 'readers',
			title: 'Reader picks (written by the site)',
			options: {collapsible: true, collapsed: true},
		},
	],
	fields: [
		defineField({
			name: 'season',
			title: 'Season',
			type: 'number',
			initialValue: 2026,
			validation: (Rule) => Rule.required().integer(),
		}),
		defineField({
			name: 'week',
			title: 'Week',
			type: 'number',
			validation: (Rule) => Rule.required().integer().min(1).max(22),
		}),
		defineField({
			name: 'awayTeam',
			title: 'Away team',
			type: 'string',
			options: {list: TEAM_NAMES},
			validation: (Rule) => Rule.required(),
		}),
		defineField({
			name: 'homeTeam',
			title: 'Home team',
			type: 'string',
			options: {list: TEAM_NAMES},
			validation: (Rule) =>
				Rule.required().custom((value, context) => {
					const away = (context.document as {awayTeam?: string} | undefined)?.awayTeam
					return value && away && value === away ? 'Home and away team must be different' : true
				}),
		}),
		defineField({
			name: 'kickoff',
			title: 'Kickoff',
			type: 'datetime',
			description: 'Reader picks lock at kickoff, so get this right.',
			validation: (Rule) => Rule.required(),
		}),
		defineField({
			name: 'predictedAwayScore',
			title: 'Your predicted score: away',
			type: 'number',
			validation: (Rule) => Rule.required().integer().min(0),
		}),
		defineField({
			name: 'predictedHomeScore',
			title: 'Your predicted score: home',
			type: 'number',
			description: 'The higher score is your pick to win. Ties are not allowed.',
			validation: (Rule) =>
				Rule.required()
					.integer()
					.min(0)
					.custom((value, context) => {
						const away = (context.document as {predictedAwayScore?: number} | undefined)?.predictedAwayScore
						return typeof value === 'number' && typeof away === 'number' && value === away
							? 'Pick a winner: predicted scores cannot be tied'
							: true
					}),
		}),
		defineField({
			name: 'writeup',
			title: 'One-line reasoning',
			description: 'Optional. Shown on the pick card (keep it under ~280 characters).',
			type: 'text',
			rows: 3,
			validation: (Rule) => Rule.max(280),
		}),
		defineField({
			name: 'gameReport',
			title: 'Linked game report',
			description: 'Optional. Adds a "Read the recap" link to the card once the report is up.',
			type: 'reference',
			to: [{type: 'gameReport'}],
		}),
		defineField({
			name: 'actualAwayScore',
			title: 'Final score: away',
			type: 'number',
			fieldset: 'result',
			validation: (Rule) => Rule.integer().min(0),
		}),
		defineField({
			name: 'actualHomeScore',
			title: 'Final score: home',
			type: 'number',
			fieldset: 'result',
			description: 'Enter BOTH final scores to grade the pick.',
			validation: (Rule) =>
				Rule.integer()
					.min(0)
					.custom((value, context) => {
						const away = (context.document as {actualAwayScore?: number} | undefined)?.actualAwayScore
						const haveHome = typeof value === 'number'
						const haveAway = typeof away === 'number'
						return haveHome !== haveAway ? 'Enter both final scores (or neither)' : true
					}),
		}),
		defineField({
			name: 'readerVotesAway',
			title: 'Reader votes: away',
			type: 'number',
			fieldset: 'readers',
			initialValue: 0,
			readOnly: true,
		}),
		defineField({
			name: 'readerVotesHome',
			title: 'Reader votes: home',
			type: 'number',
			fieldset: 'readers',
			initialValue: 0,
			readOnly: true,
		}),
	],
	orderings: [
		{title: 'Kickoff, newest first', name: 'kickoffDesc', by: [{field: 'kickoff', direction: 'desc'}]},
		{title: 'Week, then kickoff', name: 'weekAsc', by: [{field: 'week', direction: 'asc'}, {field: 'kickoff', direction: 'asc'}]},
	],
	preview: {
		select: {
			week: 'week',
			away: 'awayTeam',
			home: 'homeTeam',
			pa: 'predictedAwayScore',
			ph: 'predictedHomeScore',
			aa: 'actualAwayScore',
			ah: 'actualHomeScore',
		},
		prepare({week, away, home, pa, ph, aa, ah}) {
			const pick = typeof pa === 'number' && typeof ph === 'number' ? `Pick ${pa}-${ph}` : 'No pick yet'
			let final = ' · not final'
			if (typeof aa === 'number' && typeof ah === 'number') {
				const hit = (ph > pa) === (ah > aa) && ah !== aa
				final = ` · Final ${aa}-${ah} ${ah === aa ? '(push)' : hit ? '✓ hit' : '✗ miss'}`
			}
			return {
				title: `Week ${week ?? '?'}: ${away ?? '?'} @ ${home ?? '?'}`,
				subtitle: pick + final,
			}
		},
	},
})
