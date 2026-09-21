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
	// flex-wrap + a smaller fixed icon size (was 28, fixed at every
	// breakpoint) so four round share buttons plus whatever sits next to
	// them (comment count, reactions) don't force this row wider than a
	// phone screen and wrap into a squished, uneven-looking mess.
	<div className='flex flex-wrap items-center gap-2'>
		<TwitterShareButton url={customurl}>
			<TwitterIcon size={24} round />
		</TwitterShareButton>
		<FacebookShareButton url={customurl} >
			<FacebookIcon size={24} round />
		</FacebookShareButton>
		<RedditShareButton url={customurl} >
			<RedditIcon size={24} round />
		</RedditShareButton>
		<LinkedinShareButton url={customurl} >
			<LinkedinIcon size={24} round />
		</LinkedinShareButton>
	

	</div>
  )
}

export default SocialShare
