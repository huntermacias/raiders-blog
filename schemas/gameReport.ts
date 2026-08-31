import {defineField, defineType, defineArrayMember} from 'sanity'

export default defineType({
	name: 'gameReport',
	title: 'Game Report',
	type: 'document',
	fields: [
		defineField({
			name: 'title',
			title: 'Title',
			type: 'string',
			description: 'e.g. "Raiders Hold Off Broncos in Week 4 Thriller"',
		}),
		defineField({
			name: 'slug',
			title: 'Slug',
			type: 'slug',
			options: {source: 'title', maxLength: 96},
		}),
		defineField({
			name: 'description',
			title: 'Description',
			description: 'Short snippet for the card view',
			type: 'string',
		}),
		defineField({
			name: 'opponent',
			title: 'Opponent',
			type: 'string',
		}),
		defineField({
			name: 'gameDate',
			title: 'Game date',
			type: 'datetime',
		}),
		defineField({
			name: 'homeAway',
			title: 'Home or away',
			type: 'string',
			options: {list: ['home', 'away'], layout: 'radio'},
		}),
		defineField({
			name: 'raidersScore',
			title: 'Raiders score',
			type: 'number',
		}),
		defineField({
			name: 'opponentScore',
			title: 'Opponent score',
			type: 'number',
		}),
		defineField({
			name: 'mainImage',
			title: 'Main image',
			type: 'image',
			options: {hotspot: true},
		}),
		defineField({
			name: 'author',
			title: 'Author',
			type: 'reference',
			to: {type: 'author'},
		}),
		defineField({
			name: 'categories',
			title: 'Categories',
			type: 'array',
			of: [{type: 'reference', to: {type: 'category'}}],
		}),
		defineField({
			name: 'teamStats',
			title: 'Team stats',
			description: 'Head-to-head team stat lines, e.g. "Total Yards" / 412 / 358',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'teamStatRow',
					fields: [
						defineField({name: 'stat', title: 'Stat name', type: 'string'}),
						defineField({name: 'raiders', title: 'Raiders', type: 'string'}),
						defineField({name: 'opponent', title: 'Opponent', type: 'string'}),
					],
					preview: {
						select: {title: 'stat', raiders: 'raiders', opponent: 'opponent'},
						prepare({title, raiders, opponent}) {
							return {title, subtitle: `${raiders ?? '-'} vs ${opponent ?? '-'}`}
						},
					},
				}),
			],
		}),
		defineField({
			name: 'quarterScores',
			title: 'Quarter-by-quarter score',
			description: 'Optional. Add one row per quarter (and OT if needed) for a live-feel scoreboard.',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'quarterScoreRow',
					fields: [
						defineField({
							name: 'quarter',
							title: 'Quarter',
							type: 'string',
							options: {list: ['Q1', 'Q2', 'Q3', 'Q4', 'OT']},
						}),
						defineField({name: 'raiders', title: 'Raiders', type: 'number'}),
						defineField({name: 'opponent', title: 'Opponent', type: 'number'}),
					],
					preview: {
						select: {title: 'quarter', raiders: 'raiders', opponent: 'opponent'},
						prepare({title, raiders, opponent}) {
							return {title, subtitle: `${raiders ?? '-'} - ${opponent ?? '-'}`}
						},
					},
				}),
			],
		}),
		defineField({
			name: 'playerStats',
			title: 'Player stats',
			description: 'One row per player per category (e.g. Passing / Geno Smith / "18-27, 245 YDS, 2 TD")',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'playerStatRow',
					fields: [
						defineField({
							name: 'category',
							title: 'Category',
							type: 'string',
							options: {list: ['Passing', 'Rushing', 'Receiving', 'Defense', 'Special Teams']},
						}),
						defineField({name: 'player', title: 'Player', type: 'string'}),
						defineField({name: 'line', title: 'Stat line', type: 'string'}),
						defineField({
							name: 'standout',
							title: 'Standout performer',
							description: 'Feature this player in the "Game Leaders" highlight cards at the top of the box score',
							type: 'boolean',
							initialValue: false,
						}),
					],
					preview: {
						select: {title: 'player', subtitle: 'line', category: 'category', standout: 'standout'},
						prepare({title, subtitle, category, standout}) {
							return {title: `${standout ? '⭐ ' : ''}${title} (${category})`, subtitle}
						},
					},
				}),
			],
		}),
		defineField({
			name: 'videoEmbeds',
			title: 'Video / social embeds',
			description: 'Paste a YouTube or X (Twitter) post URL',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'videoEmbed',
					fields: [
						defineField({name: 'url', title: 'URL', type: 'url'}),
						defineField({name: 'caption', title: 'Caption', type: 'string'}),
					],
					preview: {
						select: {title: 'caption', subtitle: 'url'},
					},
				}),
			],
		}),
		defineField({
			name: 'keyMoments',
			title: 'Key moments timeline',
			description: 'Optional. Scoring plays and turning points, in order, for a drive-by-drive feel.',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'keyMoment',
					fields: [
						defineField({
							name: 'quarter',
							title: 'Quarter',
							type: 'string',
							options: {list: ['Q1', 'Q2', 'Q3', 'Q4', 'OT']},
						}),
						defineField({name: 'time', title: 'Clock (optional)', type: 'string', description: 'e.g. "4:12"'}),
						defineField({name: 'description', title: 'What happened', type: 'string'}),
					],
					preview: {
						select: {title: 'description', quarter: 'quarter', time: 'time'},
						prepare({title, quarter, time}) {
							return {title, subtitle: [quarter, time].filter(Boolean).join(' · ')}
						},
					},
				}),
			],
		}),
		defineField({
			name: 'body',
			title: 'Recap / analysis',
			type: 'blockContent',
		}),
		defineField({
			name: 'pollQuestion',
			title: 'Poll question',
			description: 'e.g. "Bounce-back win or one-off?"',
			type: 'string',
		}),
		defineField({
			name: 'pollOptionA',
			title: 'Poll option A',
			type: 'string',
		}),
		defineField({
			name: 'pollOptionB',
			title: 'Poll option B',
			type: 'string',
		}),
		defineField({
			name: 'pollVotesA',
			title: 'Poll votes (A)',
			type: 'number',
			initialValue: 0,
			readOnly: true,
		}),
		defineField({
			name: 'pollVotesB',
			title: 'Poll votes (B)',
			type: 'number',
			initialValue: 0,
			readOnly: true,
		}),
		defineField({
			name: 'potmCandidates',
			title: 'Player of the game candidates',
			type: 'array',
			of: [
				defineArrayMember({
					type: 'object',
					name: 'potmCandidate',
					fields: [
						defineField({name: 'name', title: 'Player name', type: 'string'}),
						defineField({name: 'image', title: 'Photo', type: 'image', options: {hotspot: true}}),
						defineField({
							name: 'votes',
							title: 'Votes',
							type: 'number',
							initialValue: 0,
							readOnly: true,
						}),
					],
					preview: {
						select: {title: 'name', votes: 'votes', media: 'image'},
						prepare({title, votes, media}) {
							return {title, subtitle: `${votes ?? 0} votes`, media}
						},
					},
				}),
			],
		}),
		defineField({
			name: 'reactions',
			title: 'Reactions',
			type: 'object',
			readOnly: true,
			fields: [
				defineField({name: 'fire', title: 'Fire', type: 'number', initialValue: 0}),
				defineField({name: 'thumbsDown', title: 'Thumbs down', type: 'number', initialValue: 0}),
				defineField({name: 'angry', title: 'Angry', type: 'number', initialValue: 0}),
			],
		}),
	],

	preview: {
		select: {
			title: 'title',
			opponent: 'opponent',
			media: 'mainImage',
			raidersScore: 'raidersScore',
			opponentScore: 'opponentScore',
		},
		prepare({title, opponent, media, raidersScore, opponentScore}) {
			return {
				title,
				subtitle:
					raidersScore != null && opponentScore != null
						? `vs ${opponent} — ${raidersScore}-${opponentScore}`
						: `vs ${opponent}`,
				media,
			}
		},
	},
})
