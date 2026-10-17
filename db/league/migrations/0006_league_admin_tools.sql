-- League 2.0, migration 0006: what the admin tools need.
--
-- Additive only. Two small things:
--  * an entry can be voided by an admin (with a reason), which keeps the pick and its history but removes it from
--    grading and the boards;
--  * an event's result can be pinned after an admin corrects it, so the next sync from Sanity or ESPN does not put the
--    old score back.

alter table league_entries
	add column voided_at     timestamptz,
	add column voided_reason text,
	add column voided_by     text,
	add constraint league_entries_void_complete check ((voided_at is null) = (voided_reason is null) and (voided_at is null) = (voided_by is null));

alter table league_events
	add column result_pinned_at timestamptz,
	add column result_pinned_by text,
	add constraint league_events_pin_complete check ((result_pinned_at is null) = (result_pinned_by is null));
