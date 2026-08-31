import {defineField, defineType} from 'sanity'

export default defineType ({
	name: "comment", 
	type: "document", 
	title: "Comment", 
	fields: [
		defineField({
			name: "name", 
			type: "string",
		}),
		
		defineField({
			title: "Approved", 
			name: "approved", 
			type: "boolean", 
			description: "Comments won't show on the site without approval",
		}),
		defineField({
			name: "email", 
			type: "string",
		}),
		defineField({
			name: "comment", 
			type: "text",
		}),
		defineField({
			name: "post", 
			type: "reference", 
			// Kept the field name "post" for backward compatibility with
			// existing comment documents -- it now also accepts game reports
			// so both content types share one comment system.
			to: [{ type: "post" }, { type: "gameReport" }],
		}),
	],
});