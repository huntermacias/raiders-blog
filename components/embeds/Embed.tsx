import VideoEmbed from "@/components/VideoEmbed"
import { fetchTweet, isXUrl, tweetIdFromUrl } from "@/lib/xTweet"
import TweetCard from "./TweetCard"

// The one place a video or X link in a post turns into something on the page.
// X links become our own card; if X's data can't be fetched (post deleted,
// endpoint down, slow) or the link isn't a post, we fall back to X's own
// widget so the embed is never lost. YouTube links go straight to VideoEmbed.
export default async function Embed({ url, caption }: { url: string; caption?: string }) {
	if (!url) return null
	if (isXUrl(url)) {
		const id = tweetIdFromUrl(url)
		const tweet = id ? await fetchTweet(id) : null
		if (tweet) return <TweetCard tweet={tweet} caption={caption} />
	}
	return <VideoEmbed url={url} caption={caption} />
}
