import type { Flag } from "../../lib/lab/flagsKit"

// A flag to build tests from: the Raiders, offensive holding on a pass play, 3rd and 5 at their own 38. Each call gets its own id.
let n = 0
export function flag(over: Partial<Flag> = {}): Flag {
	n++
	return {
		id: `2026_01_AAA_BBB-${100 + n}`,
		w: 1,
		g: "2026_01_AAA_BBB",
		d: "2026-09-10",
		t: "LV",
		o: "KC",
		hm: 1,
		q: 2,
		tm: "08:12",
		dn: 3,
		yd: 5,
		fp: "LV 38",
		yl: 38,
		mg: 3,
		ty: "Offensive Holding",
		yds: 10,
		au: 0,
		np: 1,
		u: "offense",
		pl: "pass",
		c: 1.2,
		wp: -3,
		tg: [],
		ck: "player",
		pid: "00-1",
		pn: "A.Player",
		ds: "PENALTY on LV-1-A.Player, Offensive Holding, 10 yards",
		...over,
	}
}

