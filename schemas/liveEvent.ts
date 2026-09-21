import {defineField, defineType, defineArrayMember} from 'sanity'

// Standalone live-blog threads -- game day, the draft, roster cuts, free
// agency, anything Hunter wants to post quick timestamped updates to while
// it's happening. Deliberately not required to reference a gameReport (it
// can, optionally) so this isn't limited to game days.
export default defineType({
	name: 'liveEvent',
	title: 'Live Event',
	type: 'document',
	fields: [
		defineField({
			name: 'title',
			title: 'Title',
			type: 'string',
			description: 'e.g. "Live: Raiders vs Chargers" or "Live: 2027 NFL Draft, Round 1"',
		}),
		defineField({
			name: 'slug',
			title: 'Slug',
			type: 'slug',
			options: {source: 'title', maxLength: 96},
		}),
		defineField({
			name: 'status',
			title: 'Status',
			type: 'string',
			options: {list: ['upcoming', 'live', 'final'], layout: 'radio'},
			initialValue: 'upcoming',
		}),
		defineField({
			name: 'relatedGame',
			title: 'Related game report (optional)',
			type: 'reference',
			to: {type: 'gameReport'},
		}),
		defineField({
			name: 'startedAt',
			title: 'Started at',
			type: 'datetime',
		}),
		defineField({
			name: 'updates',
			title: 'Updates',
			description: 'Quick timestamped posts. Normally added from the quick-post page (/live-post), but you can add/edit/delete them here too.',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'liveUpdate',
					fields: [
						defineField({name: 'body', title: 'Update', type: 'text', rows: 3}),
						defineField({
							name: 'embedUrl',
							title: 'Attached link (optional)',
							description: 'An X (Twitter) post or a YouTube link -- rendered as an embed under the update, same as game report video embeds',
							type: 'url',
						}),
						defineField({name: 'postedAt', title: 'Posted at', type: 'datetime'}),
					],
					preview: {
						select: {title: 'body', subtitle: 'postedAt'},
					},
				}),
			],
		}),
	],
	orderings: [
		{
			title: 'Started, newest first',
			name: 'startedDesc',
			by: [{field: 'startedAt', direction: 'desc'}],
		},
	],
	preview: {
		select: {title: 'title', status: 'status', updates: 'updates'},
		prepare({title, status, updates}) {
			const count = updates?.length ?? 0
			return {
				title,
				subtitle: `${status ?? 'upcoming'} · ${count} update${count === 1 ? '' : 's'}`,
			}
		},
	},
})
