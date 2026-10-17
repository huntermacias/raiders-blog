-- League 2.0, migration 0005: bookkeeping for the bridge from Sanity and ESPN into Postgres.
-- One row per sync job. A job claims its row with an atomic update, so only one request runs it at a time.

create table league_sync_state (
	key    text primary key,
	ran_at timestamptz not null default 'epoch',
	detail jsonb
);

insert into league_sync_state (key) values ('btb'), ('nfl') on conflict do nothing;
