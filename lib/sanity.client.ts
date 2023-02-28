import { createClient } from "next-sanity"

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
export const token = process.env.NEXT_SANITY_TOKEN;
const apiVersion = '2022-11-15';

export const client = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: false, 
	token,
});
