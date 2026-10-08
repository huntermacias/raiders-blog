import Credit from "./Credit"

/** The credit for pages built on the position-group tables, which draw on more than play-by-play. */
export default function UnitsCredit({ children }: { children?: React.ReactNode }) {
	return (
		<Credit>
			{children}
			Also FTN charting, Pro Football Reference advanced stats, snap counts and injury reports, all through nflverse.{" "}
		</Credit>
	)
}
