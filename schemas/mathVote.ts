import {defineField, defineType} from 'sanity'

/**
 * Reader votes on one game where the blogger and the math pick different teams. Written by /api/math-vote
 * (one document per game, a hyphenated id so it stays publicly readable). Read-only: the tallies are a
 * reader poll, not something to edit by hand.
 */
export default defineType({
	name: 'mathVote',
	title: 'Blogger vs. Math Vote',
	type: 'document',
	readOnly: true,
	fields: [
		defineField({name: 'season', title: 'Season', type: 'number'}),
		defineField({name: 'week', title: 'Week', type: 'number'}),
		defineField({name: 'away', title: 'Away team', type: 'string'}),
		defineField({name: 'home', title: 'Home team', type: 'string'}),
		defineField({name: 'blogger', title: 'Votes for the blogger', type: 'number'}),
		defineField({name: 'math', title: 'Votes for the math', type: 'number'}),
	],
	preview: {
		select: {week: 'week', away: 'away', home: 'home', blogger: 'blogger', math: 'math'},
		prepare({week, away, home, blogger, math}) {
			return {title: `${away ?? '?'} @ ${home ?? '?'}`, subtitle: `Week ${week ?? '?'}: blogger ${blogger ?? 0}, math ${math ?? 0}`}
		},
	},
})
