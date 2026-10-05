/** The data credit every Lab page carries. */
export default function Credit({ children }: { children?: React.ReactNode }) {
	return (
		<p className="m-0 max-w-xl text-xs leading-relaxed text-lab-muted">
			Data: <a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse</a> play-by-play, CC BY 4.0. {children}Calculations and charts by Raiders Rundown.
		</p>
	)
}
