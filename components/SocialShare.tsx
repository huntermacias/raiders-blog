'use client'
import {
	FacebookShareButton,
	FacebookIcon,
	TwitterShareButton,
	TwitterIcon,
	RedditShareButton,
	RedditIcon,
	LinkedinShareButton,
	LinkedinIcon,
  } from 'next-share';


function SocialShare({customurl}: any) {
  return (
	<div className='space-x-2'>
		<TwitterShareButton url={customurl}>
			<TwitterIcon size={28} round />
		</TwitterShareButton>
		<FacebookShareButton url={customurl} >
			<FacebookIcon size={28} round />
		</FacebookShareButton>
		<RedditShareButton url={customurl} >
			<RedditIcon size={28} round />
		</RedditShareButton>
		<LinkedinShareButton url={customurl} >
			<LinkedinIcon size={28} round />
		</LinkedinShareButton>
	

	</div>
  )
}

export default SocialShare