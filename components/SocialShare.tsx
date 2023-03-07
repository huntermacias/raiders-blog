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


function SocialShare({url}: any) {
  return (
	<div className='space-x-2'>
		<TwitterShareButton url={url} >
			<TwitterIcon size={28} round />
		</TwitterShareButton>
		<FacebookShareButton url={url} >
			<FacebookIcon size={28} round />
		</FacebookShareButton>
		<RedditShareButton url={url} >
			<RedditIcon size={28} round />
		</RedditShareButton>
		<LinkedinShareButton url={url} >
			<LinkedinIcon size={28} round />
		</LinkedinShareButton>
		
	</div>
  )
}

export default SocialShare