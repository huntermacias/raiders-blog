-- League 2.0, migration 0004: links between the League and sign-in accounts, handle reservations, and admins.

-- A player may be attached to one account. Deleting the account never deletes the player's history.
alter table league_players
	add constraint league_players_user_fk foreign key (user_id) references "user" (id) on delete set null;

-- A short hold on a handle while a new account waits for its email to be verified. It stops two people claiming the
-- same handle at once, and it expires so an abandoned sign-up cannot sit on a handle.
create table league_handle_reservations (
	handle_lower text primary key,
	email_lower  text not null,
	user_id      text,
	expires_at   timestamptz not null
);

-- People allowed into the admin area. Being listed here is one of two locks; the other is the LEAGUE_ADMIN_EMAILS
-- allow-list in the environment (see lib/league2/services/admin.ts). Add rows by hand with SQL: there is no screen for it.
create table league_admins (
	user_id  text primary key references "user" (id) on delete cascade,
	added_by text not null,
	added_at timestamptz not null default now()
);

create index league_players_disabled on league_players (disabled_at) where disabled_at is not null;
