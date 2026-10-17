-- League 2.0, migration 0002: the scoring policy the League has always used, frozen as Classic v1.
-- These are the exact rules in lib/league.ts. A test compares them to the live scoring on 40,000 scorelines.

insert into league_scoring_policies (id, family, version, kind, label, rules, effective_from, frozen_at) values
	('btb-classic-v1', 'btb-classic', 1, 'score-pick', 'Beat the Blogger Classic',
	 '{"winner":10,"margin":[{"max":0,"pts":10},{"max":3,"pts":6},{"max":7,"pts":3}],"exactScore":5}',
	 '1970-01-01T00:00:00Z', '2026-09-01T00:00:00Z');

insert into league_scoring_policies (id, family, version, kind, label, rules, effective_from, frozen_at) values
	('nfl-winner-v1', 'nfl-winner', 1, 'winner', 'NFL game winners', '{"correct":1}', '1970-01-01T00:00:00Z', null),
	('nfl-confidence-v1', 'nfl-confidence', 1, 'confidence', 'Confidence picks', '{"perRank":1}', '1970-01-01T00:00:00Z', null),
	('nfl-upset-v1', 'nfl-upset', 1, 'upset', 'Upset challenge', '{"base":1,"perTier":1,"tierBoundaries":[0.65,0.8]}', '1970-01-01T00:00:00Z', null);
