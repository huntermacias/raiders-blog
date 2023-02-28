// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'

import { client } from "../../lib/sanity.client";

export default async function createComment(
  req: NextApiRequest,
  res: NextApiResponse
) {
	const { _id, name, email, comment } = JSON.parse(req.body);

	try {
		await client.create({
			_type: 'comment', 
			post: {
				_type: 'reference', 
				_ref: _id
			},
			name, 
			email, 
			comment
		});
	} catch (error) {
		console.log("error: ", error);
		return res.status(500).json({message: `Couldn't submit comment`, error});
	}

	console.log('comment submitted', comment);
  return res.status(200).json({ message: 'Comment Submitted' })
}
