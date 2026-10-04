import {defineField, defineType} from 'sanity'

/**
 * One reader's score pick for one game. Written by /api/league/pick with a
 * dotted id (private in Sanity). Read-only: it exists so the site can grade the
 * league, not to be edited by hand.
 */
export default defineType({
	name: 'leaguePick',
	title: 'League Pick',
	type: 'document',
	readOnly: true,
	fields: [
		defineField({name: 'season', title: 'Season', type: 'number'}),
		defineField({name: 'week', title: 'Week', type: 'number'}),
		defineField({name: 'player', title: 'Player (lower-case handle)', type: 'string'}),
		defineField({name: 'predictionId', title: 'Game prediction id', type: 'string'}),
		defineField({name: 'awayScore', title: 'Away score', type: 'number'}),
		defineField({name: 'homeScore', title: 'Home score', type: 'number'}),
		defineField({name: 'pickedAt', title: 'Picked at', type: 'datetime'}),
	],
	preview: {
		select: {player: 'player', week: 'week', away: 'awayScore', home: 'homeScore'},
		prepare({player, week, away, home}) {
			return {title: `${player ?? '?'}: ${away}-${home}`, subtitle: `Week ${week ?? '?'}`}
		},
	},
})
