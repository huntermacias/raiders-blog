import {defineField, defineType} from 'sanity'

/**
 * A reader in the Beat the Blogger league. Created by /api/league/join with a
 * dotted id (leaguePlayer.<handle>), which Sanity keeps private even though the
 * dataset is public. The only thing to do here is flip "Banned" to remove
 * someone from the boards. Publish after changing it.
 */
export default defineType({
	name: 'leaguePlayer',
	title: 'League Player',
	type: 'document',
	fields: [
		defineField({name: 'handle', title: 'Handle', type: 'string', readOnly: true}),
		defineField({name: 'handleLower', title: 'Handle (lower case)', type: 'string', readOnly: true}),
		defineField({
			name: 'banned',
			title: 'Banned',
			type: 'boolean',
			description: 'Hides this player from every board and blocks their picks. Publish to apply.',
			initialValue: false,
		}),
		defineField({name: 'signupSource', title: 'Came from (utm_source)', type: 'string', readOnly: true}),
		defineField({name: 'signupMedium', title: 'Medium (utm_medium)', type: 'string', readOnly: true}),
		defineField({name: 'signupCampaign', title: 'Campaign (utm_campaign)', type: 'string', readOnly: true}),
		defineField({name: 'signupContent', title: 'Content (utm_content)', type: 'string', readOnly: true}),
		defineField({name: 'keyHash', title: 'Key hash', type: 'string', readOnly: true, hidden: true}),
	],
	preview: {
		select: {title: 'handle', banned: 'banned', campaign: 'signupCampaign'},
		prepare({title, banned, campaign}) {
			return {title: title ?? '(no handle)', subtitle: banned ? 'Banned' : campaign ? `Active · ${campaign}` : 'Active'}
		},
	},
})
