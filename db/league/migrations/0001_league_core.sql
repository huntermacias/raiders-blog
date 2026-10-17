-- League 2.0, migration 0001: the core tables.
--
-- Forward-only and additive: nothing here touches the Sanity data. Run it against a new database; it creates
-- tables only. Every table is created with the constraints that keep the competition honest: one handle per
-- person, one entry per player per game, grades that are never edited, an audit log that is never rewritten.

create extension if not exists pgcrypto;

-- Players -------------------------------------------------------------------------------------------------------

create table league_players (
	id               uuid primary key default gen_random_uuid(),
	-- The sign-in account (Better Auth user id). Null until a legacy player claims their record.
	user_id          text unique,
	handle           text not null check (handle ~ '^[A-Za-z0-9_]{3,16}$'),
	handle_lower     text generated always as (lower(handle)) stored,
	-- The lower-case handle in the old Sanity league, kept so history can always be traced back.
	legacy_handle_lower text unique,
	joined_at        timestamptz not null default now(),
	favorite_team    text check (favorite_team is null or favorite_team ~ '^[A-Z]{2,4}$'),
	avatar_url       text,
	show_profile     boolean not null default true,
	show_history     boolean not null default true,
	disabled_at      timestamptz,
	disabled_reason  text,
	created_at       timestamptz not null default now(),
	constraint league_players_handle_unique unique (handle_lower),
	constraint league_players_disabled_has_reason check ((disabled_at is null) = (disabled_reason is null))
);

-- Legacy (handle + recovery key) identities --------------------------------------------------------------------
-- The key hash is kept, never deleted, so a claim can be rolled back. While state is unclaimed or claiming the
-- recovery key still signs in; once claimed or retired it does not.

create table league_legacy_identities (
	handle_lower   text primary key,
	player_id      uuid not null unique references league_players (id),
	key_hash       text not null,
	state          text not null default 'unclaimed' check (state in ('unclaimed', 'claiming', 'claimed', 'retired')),
	token_hash     text,
	-- The new account a pending claim is tied to. Only that account can finish the claim.
	pending_user_id text,
	expires_at     timestamptz,
	claimed_by     text,
	claimed_at     timestamptz,
	source_doc_id  text not null unique,
	imported_at    timestamptz not null default now(),
	constraint legacy_token_iff_claiming check ((state = 'claiming') = (token_hash is not null)),
	constraint legacy_owner_iff_claimed check ((state in ('claimed', 'retired')) = (claimed_by is not null)),
	constraint legacy_pending_only_while_claiming check (pending_user_id is null or state = 'claiming')
);

-- Scoring policies ----------------------------------------------------------------------------------------------

create table league_scoring_policies (
	id             text primary key,
	family         text not null,
	version        integer not null check (version >= 1),
	kind           text not null check (kind in ('score-pick', 'winner', 'confidence', 'upset')),
	label          text not null,
	rules          jsonb not null,
	effective_from timestamptz not null,
	frozen_at      timestamptz,
	constraint policy_id_matches check (id = family || '-v' || version),
	constraint policy_unique_version unique (family, version)
);

create function league_policy_guard() returns trigger language plpgsql as $$
begin
	if tg_op = 'DELETE' then
		raise exception 'scoring policies are never deleted';
	end if;
	if old.frozen_at is not null and (
		new.rules is distinct from old.rules or new.effective_from is distinct from old.effective_from
		or new.kind is distinct from old.kind or new.family is distinct from old.family
		or new.version is distinct from old.version or new.frozen_at is distinct from old.frozen_at) then
		raise exception 'policy % is frozen; publish a new version instead', old.id;
	end if;
	return new;
end $$;

create trigger league_policy_guard before update or delete on league_scoring_policies
	for each row execute function league_policy_guard();

-- Competitions --------------------------------------------------------------------------------------------------

create table league_competitions (
	id            text primary key,
	season        integer not null,
	kind          text not null check (kind in ('btb', 'weekly-winners', 'confidence', 'upset', 'bonus', 'season-long', 'playoff-bracket')),
	name          text not null,
	policy_family text not null,
	config        jsonb not null default '{}'::jsonb,
	opens_at      timestamptz,
	closes_at     timestamptz,
	enabled       boolean not null default false,
	-- Once rules are frozen the competition's policy and config are public and fixed for the season.
	frozen_at     timestamptz,
	created_at    timestamptz not null default now()
);

-- Events (games and questions) ----------------------------------------------------------------------------------

create table league_events (
	id                   uuid primary key default gen_random_uuid(),
	kind                 text not null default 'game' check (kind in ('game', 'question')),
	season               integer not null,
	week                 integer not null check (week between 1 and 22),
	-- Links to the sources of truth. The Sanity id keeps legacy picks attached to their game.
	legacy_prediction_id text unique,
	nfl_game_id          text unique,
	away_team            text,
	home_team            text,
	prompt               text,
	options              jsonb,
	kickoff              timestamptz not null,
	-- Null means "lock at kickoff". An admin may move it for a postponement.
	lock_at              timestamptz,
	state                text not null default 'scheduled' check (state in ('scheduled', 'postponed', 'in_progress', 'final', 'cancelled')),
	away_score           integer check (away_score is null or away_score between 0 and 99),
	home_score           integer check (home_score is null or home_score between 0 and 99),
	updated_at           timestamptz not null default now(),
	constraint final_has_score check (state <> 'final' or (kind = 'question') or (away_score is not null and home_score is not null)),
	constraint game_has_teams check (kind <> 'game' or (away_team is not null and home_team is not null and away_team <> home_team))
);
create index league_events_season_week on league_events (season, week);

create table league_result_snapshots (
	id           bigserial primary key,
	event_id     uuid not null references league_events (id),
	source       text not null,
	away_score   integer,
	home_score   integer,
	hash         text not null,
	retrieved_at timestamptz not null default now(),
	raw          jsonb
);
create index league_result_snapshots_event on league_result_snapshots (event_id, retrieved_at desc);

-- Entries -------------------------------------------------------------------------------------------------------

create table league_entries (
	id                 uuid primary key default gen_random_uuid(),
	competition_id     text not null references league_competitions (id),
	player_id          uuid not null references league_players (id),
	event_id           uuid not null references league_events (id),
	payload            jsonb not null,
	first_submitted_at timestamptz not null,
	submitted_at       timestamptz not null,
	-- One entry per player per game per competition. The API upserts into this.
	constraint league_entries_unique unique (competition_id, player_id, event_id)
);
create index league_entries_event on league_entries (event_id);
create index league_entries_player on league_entries (player_id);

create table league_entry_revisions (
	entry_id uuid not null references league_entries (id),
	n        integer not null check (n >= 1),
	payload  jsonb not null,
	at       timestamptz not null,
	primary key (entry_id, n)
);

-- Grades: append-only ---------------------------------------------------------------------------------------------

create table league_grades (
	key          text primary key,
	entry_id     uuid not null references league_entries (id),
	event_id     uuid not null references league_events (id),
	player_id    uuid not null references league_players (id),
	policy_id    text not null references league_scoring_policies (id),
	result_hash  text not null,
	points       integer not null,
	correct      boolean not null,
	margin_error integer,
	exact        boolean not null default false,
	voided       boolean not null default false,
	graded_at    timestamptz not null,
	supersedes   text references league_grades (key),
	-- A grade can be superseded by at most one later grade.
	constraint league_grades_one_successor unique (supersedes)
);
create index league_grades_entry on league_grades (entry_id);
create index league_grades_player on league_grades (player_id);
create index league_grades_event on league_grades (event_id);

-- The grade that counts for each entry: the one nothing supersedes.
create view league_current_grades as
	select g.* from league_grades g
	where not exists (select 1 from league_grades n where n.supersedes = g.key);

-- The blogger's own pick -----------------------------------------------------------------------------------------

create table league_blogger_picks (
	event_id   uuid primary key references league_events (id),
	away       integer not null check (away between 0 and 99),
	home       integer not null check (home between 0 and 99 and home <> away),
	entered_at timestamptz not null,
	constraint blogger_no_tie check (away <> home)
);

create table league_blogger_pick_revisions (
	event_id   uuid not null references league_blogger_picks (event_id),
	n          integer not null check (n >= 1),
	away       integer not null,
	home       integer not null,
	at         timestamptz not null,
	reason     text,
	after_lock boolean not null default false,
	imported   boolean not null default false,
	actor      text,
	primary key (event_id, n),
	constraint after_lock_needs_reason check (not after_lock or length(btrim(coalesce(reason, ''))) >= 10)
);

-- Audit, support, notifications, rate limits ----------------------------------------------------------------------

create table league_audit_log (
	id         bigserial primary key,
	at         timestamptz not null default now(),
	actor      text not null check (actor <> ''),
	actor_role text not null check (actor_role in ('admin', 'player', 'system')),
	action     text not null,
	subject    text not null,
	before     jsonb,
	after      jsonb,
	reason     text
);
create index league_audit_subject on league_audit_log (subject, at desc);

create table league_support_cases (
	id          uuid primary key default gen_random_uuid(),
	player_id   uuid references league_players (id),
	kind        text not null check (kind in ('lost_access', 'duplicate_account', 'handle_dispute', 'other')),
	status      text not null default 'open' check (status in ('open', 'needs_evidence', 'resolved', 'declined')),
	opened_by   text,
	evidence    jsonb not null default '[]'::jsonb,
	notes       text,
	reviewer    text,
	created_at  timestamptz not null default now(),
	resolved_at timestamptz
);

create table league_notification_prefs (
	player_id       uuid primary key references league_players (id),
	email_deadlines boolean not null default false,
	email_results   boolean not null default false,
	email_weekly    boolean not null default false,
	updated_at      timestamptz not null default now()
);

create table league_rate_limits (
	key      text primary key,
	count    integer not null,
	reset_at timestamptz not null
);

-- Append-only guards ----------------------------------------------------------------------------------------------

create function league_append_only() returns trigger language plpgsql as $$
begin
	raise exception '% is append-only', tg_table_name;
end $$;

create trigger league_audit_append_only before update or delete on league_audit_log
	for each row execute function league_append_only();
create trigger league_grades_append_only before update or delete on league_grades
	for each row execute function league_append_only();
create trigger league_entry_revisions_append_only before update or delete on league_entry_revisions
	for each row execute function league_append_only();
create trigger league_blogger_revisions_append_only before update or delete on league_blogger_pick_revisions
	for each row execute function league_append_only();
