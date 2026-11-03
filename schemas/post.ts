import {defineField, defineType} from 'sanity'

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
      name: 'categories',
      title: 'Categories',
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
