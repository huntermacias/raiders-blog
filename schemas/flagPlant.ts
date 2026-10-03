import {defineField, defineType} from 'sanity'

/**
 * A "flag plant": one bold, specific call (e.g. "Hezekiah Masses gets
 * interception No. 4") that goes on the record before the game and is graded
 * after. Create it when you publish the call; set Result once it can be
 * judged. Leave Result empty while the call is still open.
 */
export default defineType({
	name: 'flagPlant',
	title: 'Flag Plant',
	type: 'document',
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
			name: 'text',
			title: 'The call',
			description: 'One specific, gradable sentence. e.g. "Hezekiah Masses gets interception No. 4".',
			type: 'string',
			validation: (Rule) => Rule.required().max(120),
		}),
		defineField({
			name: 'detail',
			title: 'Why',
			description: 'Optional. One or two sentences of reasoning.',
			type: 'text',
			rows: 2,
			validation: (Rule) => Rule.max(240),
		}),
		defineField({
			name: 'post',
			title: 'Where you planted it',
			description: 'Optional. The post that makes the call.',
			type: 'reference',
			to: [{type: 'post'}],
		}),
		defineField({
			name: 'result',
			title: 'Result',
			description: 'Leave empty while the call is open.',
			type: 'string',
			options: {
				list: [
					{title: 'Hit', value: 'hit'},
					{title: 'Missed', value: 'miss'},
				],
				layout: 'radio',
				direction: 'horizontal',
			},
		}),
		defineField({
			name: 'resultNote',
			title: 'What happened',
			description: 'Optional. A short note shown once it is graded.',
			type: 'string',
			validation: (Rule) => Rule.max(160),
		}),
	],
	orderings: [
		{title: 'Week, newest first', name: 'weekDesc', by: [{field: 'week', direction: 'desc'}]},
	],
	preview: {
		select: {title: 'text', week: 'week', result: 'result'},
		prepare({title, week, result}) {
			const status = result === 'hit' ? '✓ Hit' : result === 'miss' ? '✗ Missed' : 'Open'
			return {title, subtitle: `Week ${week ?? '?'} · ${status}`}
		},
	},
})
