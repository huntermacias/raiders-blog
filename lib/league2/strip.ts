// What the little "your picks" strip on public pages needs, and nothing more. Types only: the browser imports this file too.

export type StripNext = { kind: "join" | "pick" | "all_set" | "waiting"; title: string; detail: string; lockAt: string | null }
export type StripRank = { rank: number; of: number; points: number }

export type Strip =
	| { signedIn: false }
	| { signedIn: true; handle: string | null; favoriteTeam: string | null; next: StripNext | null; rank: StripRank | null }
