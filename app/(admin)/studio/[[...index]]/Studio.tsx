'use client'

import {NextStudio} from "next-sanity/studio"
import config from "../../../../sanity.config"

export default function Studio() {
	// Supports the same props as import {Studio} from 'sanity', 'config'
	return <NextStudio config={config} />
}
