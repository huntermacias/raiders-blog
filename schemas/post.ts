import {defineField, defineType} from 'sanity'

import {postTypeOptions} from '../lib/storyType'

export default defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name:'description',
      description: 'Enter a short snippet for the blog',
      title: 'Description', 
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: {type: 'author'},
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      description:
        'Shown at the top of the post at its own shape: a 4:5 graphic stays 4:5 and a 16:9 photo stays 16:9, nothing is trimmed. To show only part of it on the page, use Crop below; otherwise the whole picture shows. The hotspot sets the focus for the small cards on the homepage.',
      options: {
        hotspot: true,
      },
      fields: [
        defineField({
          name: 'alt',
          title: 'Description (for screen readers)',
          type: 'string',
        }),
        defineField({
          name: 'caption',
          title: 'Caption (optional)',
          type: 'string',
          description: 'Shown under the picture on the post.',
        }),
      ],
    }),
    defineField({
      name: 'shareImage',
      title: 'Share card photo (optional)',
      type: 'image',
      description:
        'The photo used on the X / link-preview card, which is always a wide 1.91:1 shape. Leave empty to use the main image. Set the hotspot to choose what stays in frame. This never changes the picture on the post itself.',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'storyType',
      title: 'Story type',
      type: 'string',
      description:
        'What kind of story this is. It sets the label on the card and the page, which "More" list it belongs to, and the extra boxes on the page (the game for a preview, the top of the rankings for power rankings). Categories below are just topic tags.',
      options: {
        list: postTypeOptions(),
        layout: 'dropdown',
      },
      validation: (rule) => rule.required().error('Pick what kind of story this is.'),
    }),
    defineField({
      name: 'week',
      title: 'Week (optional)',
      type: 'number',
      description:
        'For a preview, power ranking or any story about one week of the season. Leave empty and the site reads it from the title ("Week 8 Preview", "Power Rankings After Week 8"). A power ranking is the week that was just played.',
      validation: (rule) => rule.integer().min(1).max(22),
    }),
    defineField({
      name: 'facts',
      title: 'At a glance (optional)',
      type: 'array',
      description:
        'A small box of key facts shown at the top of the story, e.g. Player / Duke Shelley, Contract / 1 year, $1.3M, Status / Signed. Good for free agency, trades and profiles.',
      of: [
        {
          type: 'object',
          name: 'fact',
          fields: [
            defineField({name: 'label', title: 'Label', type: 'string', validation: (rule) => rule.required().max(24)}),
            defineField({name: 'value', title: 'Value', type: 'string', validation: (rule) => rule.required().max(80)}),
          ],
          preview: {
            select: {title: 'label', subtitle: 'value'},
          },
        },
      ],
      validation: (rule) => rule.max(8),
    }),
    defineField({
      name: 'categories',
      title: 'Topics (categories)',
      type: 'array',
      of: [{type: 'reference', to: {type: 'category'}}],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
  ],

  preview: {
    select: {
      title: 'title',
      author: 'author.name',
      media: 'mainImage',
    },
    prepare(selection) {
      const {author} = selection
      return {...selection, subtitle: author && `by ${author}`}
    },
  },
})
