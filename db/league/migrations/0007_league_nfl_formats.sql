-- League 2.0, migration 0007: what the confidence and upset formats need.
--
-- Additive only. The upset challenge needs to know, for each NFL game, which side was the underdog and how big an upset
-- it would be, and that answer must not move once players have picked. So when a week opens, the site's own ratings
-- are turned into one line per game and stored here. A line is never edited or deleted: a rating that changes later
-- cannot move a pick that was already made.

create table league_upset_lines (
	event_id             uuid primary key references league_events (id),
	underdog             text not null check (underdog in ('away', 'home')),
	favourite_win_chance numeric(6, 5) not null check (favourite_win_chance > 0.5 and favourite_win_chance < 1),
	home_rating          numeric(8, 2) not null,
	away_rating          numeric(8, 2) not null,
	captured_at          timestamptz not null default now()
);

create function league_upset_line_guard() returns trigger language plpgsql as $$
begin
	raise exception 'upset lines are never changed once set';
end $$;

create trigger league_upset_line_guard before update or delete on league_upset_lines
	for each row execute function league_upset_line_guard();
