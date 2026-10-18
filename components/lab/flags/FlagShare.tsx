"use client"

import ShareCard from "@/components/lab/ShareCard"
import { FLAGS_SHARE_PATH, type FlagsView, flagsQuery } from "@/lib/lab/flagsShare"

/** A Share button for one view of the penalty flags: the card for it, wide and tall, and the link that reopens the same view. */
export default function FlagShare({ view, name, file, text, alt, stamp, label, className = "" }: { view: FlagsView; name: string; file: string; text: string; alt: string; stamp: number; label?: string; className?: string }) {
	return <ShareCard target={{ type: "flags", query: flagsQuery(view), sharePath: FLAGS_SHARE_PATH, name, file, campaign: "flags_share" }} stamp={stamp} text={text} alt={alt} label={label} className={className} />
}
