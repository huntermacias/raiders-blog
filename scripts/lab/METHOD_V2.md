# Player Lab method v2

Source of truth in code: `method.py` (policy, scale), `build_players.py` (attribution, estimator), `build_method.py` (reference constants), `build_calibration.py` (ranges and pairwise chances).
Evidence, all rebuilt on the quarterback-only EPA definition below: `data/lab/validation.json`, `data/lab/validation-positions.json`, `data/lab/calibration-v2.json`, `data/lab/environment-v2.json`, `data/lab/attribution-audit.json`, `data/lab/v2/comparison.json`.

The site reads this method only when it is built with `NEXT_PUBLIC_LAB_METHOD=v2` (`lib/lab/labMethod.ts`). Unset, nothing about the site changes. The v2 builders are not part of the scheduled data pipeline.

## Three questions, three answers, never one score

Every player page, leaderboard and comparison answers the same three questions in the same order, with separate numbers and separate names.

| Question | Name on the page | What it is | Default? |
|---|---|---|---|
| Who is playing best right now? | **This season** | The job's main stat from this season's plays only, and his rank among players with enough plays. Nothing from earlier seasons is in it. | Yes. Cards, ranks, comparisons and the default leaderboard. |
| Who has added the most so far? | **Contribution so far** | EPA above an average player at his job over every play he had, total and per game. It adds up, so it rewards playing more. Players under the card floor are counted and marked. | No. Its own tab and board. |
| Who is likely to be best going forward? | **Projection** | An estimate of his level once earlier seasons are counted too, always with an 80% range and the share of it that is this season. | No. Its own tab and board, in a dashed frame. |

They disagree on purpose, and the page says why next to the numbers (`whyDiffer` in `lib/lab/v2/kit.ts`). At week 5 only 5 to 15% of a projection is this season's plays. Two cases the pages explain in a sentence:

* Bryce Young is 10th of 40 quarterbacks on EPA per dropback this season and 33rd on the projection. 14% of his projection is this season; his earlier seasons were weaker.
* Puka Nacua (wr) and George Kittle (te) are first on the projection and well down on this season (57th of 94 and 18th of 38). 12% and 5% of their projections are this season; their earlier seasons were far better.

Underneath, the data keeps four layers apart:

| Layer | What it is |
|---|---|
| Observed | The raw rate over the plays he had, and his rank among players with enough volume. |
| Adjusted | The same, with opposition strength taken out, only where the evidence says it matters. |
| Estimate (the grade) | What his level most likely is: his observed rate pulled toward the league, and toward his own earlier seasons, by how little volume is behind it. Always carries an 80% interval. The page calls it a projection. |
| Contribution | EPA above an average player at his job over the plays he had, total and per game. Accumulates for everyone, with or without a grade. |

## What the projection estimates

* **Target:** his level on the measured stat (EPA per dropback for a quarterback, success rate on targets for a receiver, pressure rate for a pass rusher, EPA per kick for a punter or kick returner), relative to the league, for the plays still to come.
* **Horizon:** the plays still to come this season, which is what the calibration scores. It is a level, not a forecast of one game, and it is not validated further out.
* It includes his scheme, teammates and role. It is not a statement about intrinsic talent, and a 10-point gap does not prove a talent gap.
* **Not adjusted:** a new team, a new head coach, an injury, a change of role, age. They are flagged where known (see "What is tested and what is only warned about") and never subtracted.

## What the scale means

* **50** is the average player at his job in the season being graded, weighted by plays (a backup with three snaps does not move it).
* **10 points** is one standard deviation of *true* differences between players on that stat, measured on 2018-2025 player-seasons with at least three times the volume that earns the stat a place on a card (`talentSd`, `build_method.py`). It is not this season's spread, so a point means the same in week 5 and week 18, in 2026 and in 2024.
* Grade = 50 + 10 x (estimate - league average) / talentSd, sign-flipped where lower is better.
* **Range:** the 80% range is 1.2816 x 1.45 x 10 x (the estimate's standard error) / talentSd. The 1.45 is learned, not chosen: see "Calibration".
* The number on a card is **This season**: the percentile among players at his job, 1 to 99, from the observed rank. It is not the projection and is not stretched.

## Earlier seasons

A season k years back enters with variance = its own sampling variance + k x drift (drift measured on 2018-2025). Each earlier season is first moved by the gap between *its own* league average and the current one, so a league-wide change in a stat is not read as the player changing. `cw` on every grade is the share of the estimate that comes from this season's plays; `g0` is the grade from this season alone (pulled toward the league only).

## What is tested and what is only warned about

Both questions were answered on held-out seasons, never on the seasons the model was fitted on.

* **Aging.** Three alternatives to "no aging term" (an experience term, an age term, a second-year bump) were scored on seasons the model had not seen. None improved prediction error: the differences in RMSE against no term were +.0011, -.0010 and -.0003 with 90% intervals that include zero. The 21 second-year player-seasons in the held-out seasons beat their projection by .04 EPA per dropback on average, too few to act on. **No aging or second-year adjustment is applied.**
* **A new team or a new head coach.** Predicting a quarterback from his last season: same team and head coach r = .44 (n = 141); same team, new head coach r = .33 (n = 38); new team r = .17 (n = 39). But the RMSE gap between changed and unchanged settings is +.003 with a 90% interval of -.012 to +.020, so it is not distinguishable from nothing. There is no validated amount to subtract. **The projection is flagged, never adjusted:** "New team: he played for X in 2025. Past results travel poorly when a player changes team, and the projection is not adjusted for it. Lean on this season." (`validate_environment.py`, `data/lab/environment-v2.json`).

## Who gets what (`method.POLICY`)

* **QB** primary EPA per dropback (passes, sacks, scrambles; the quarterback-only EPA, below). Designed runs are kept apart. Success rate, CPOE, sack rate graded alongside, never averaged in. A published chance of beating another quarterback exists for quarterbacks only (see "Pairwise chances").
* **WR / TE** primary success rate on targets. Target share, depth of target and separation are role or description, never graded and never ranked. Separation is measured by Next Gen Stats on targeted plays at the moment the pass arrives; it is not a measure of route running on every play.
* **EDGE / IDL** pressure rate. **P / KR** EPA per kick. **K** kickoff value only.
* **RB** components, no overall grade and no projection board. Rushing EPA and success rate barely repeat (r about .13). The page shows, apart:
  * **Explosive-run rate** and **yards after contact**, each graded on its own. They overlap (a long run usually has yards after contact in it; across two halves of a season, corrected for noise, the two correlate about .65), and the page says so rather than merging them or hiding one.
  * **Rushing yards over expected** (Next Gen Stats) is observed only. It is shown with how many of his carries the tracking data covers (worded "tracking data covers N of his M carries (P%)"), never graded, never in a total, never in the contribution.
  * Rushing and receiving **production, efficiency and contribution** together: carries and EPA per carry, targets and EPA per target, and their sum as contribution. A back's targets in a game in which he had no carry are his (a game with a catch and no carry used to be dropped; it is not now).
* **LB / CB / S / OL / PR** production and context, no grade: the stable numbers describe role, the results do not repeat, and the public data does not say who covered whom or who blocked whom.

## Who owns a play, and what counts where

A dropback is the quarterback's (the passer, or the rusher on a scramble because the league leaves the passer empty). A designed quarterback run is his, but separate. A target is the receiver's. A fumble goes to the owner of the play, except that a receiver's lost fumble after a catch is not charged to the passer. A roster row with no player id never owns a play.

The quarterback's headline is the league's **quarterback-only EPA** (`qb_epa`). Team offense stays on the ordinary play-level **EPA** (`epa`). They differ on a play only where a receiver lost the ball; they are not reconciled, because they answer different questions (what the passer did; what the offense got). The audit (`audit_attribution.py`, `data/lab/attribution-audit.json`) found every definition predicts next season about equally well (r .136 to .146; differences against the old headline include zero), so the choice rests on what the number means.

| Play | QB headline (`qb_epa`) | QB contribution | Receiver's numbers | Team offense (`epa`) |
|---|---|---|---|---|
| Pass, completed or not | yes | yes | yes, as a target | yes |
| Sack | yes | yes | no | yes |
| Scramble | yes, as a dropback | yes | no (never a back's carry) | yes |
| Designed quarterback run | no, kept apart | yes, as designed runs | no | yes |
| Quarterback loses the ball (sack, scramble) | stays with him | yes | no | yes |
| Receiver loses the ball after a catch | **only the pass itself** | only the pass itself | **the whole play** | **the whole play** |
| Interception | yes | yes | yes, as a target | yes |
| Play a penalty wiped out (accepted penalty) | left out | left out | left out | left out |
| No-play, kneel, spike | not counted (no result, or not a pass or run) | not counted | not counted | not counted |
| Two-point try | counted when the league gives it an EPA | same | same | same |

Worked example, ordinary EPA against quarterback-only EPA (Minnesota against New Orleans, week 5, 2026). K. Murray completes a 7-yard pass to M. Price, Price fumbles, and New Orleans returns it 87 yards for a touchdown.

* The play's EPA is **-10.06**. It is the right number for what the Minnesota offense got on the snap, so the team's EPA per play uses it, and so does Price's EPA per target.
* The quarterback-only EPA is **-0.24**: the value of the throw and the catch, before the fumble. That is Murray's number.
* Across a 500-dropback season, -9.82 on one play is -0.0196 EPA per dropback, about 0.18 of a standard deviation of true quarterback talent (0.1065): roughly 1.8 grade points from something the passer did not do. This is why the quarterback headline is not the ordinary EPA.

Where nothing changes (so no reconciliation is needed): L. Jackson sacked and fumbling (Baltimore, week 1) is -6.28 on both; B. Mayfield fumbling on a scramble (Tampa Bay, week 1) is -6.11 on both. The quarterback keeps his own lost balls.

How rare the difference is: in 2026 through week 5, 23 of 5,806 counted dropbacks (0.4%) differ, taking 109 EPA off quarterbacks in total; in 2018-2025 it is 53 to 77 plays a season. It moves a few ranks at the margin (the audit lists the biggest: in 2026, Tyler Huntley from 29th to 20th, Marcus Mariota 18th to 11th). The Spearman correlation between the two orders is .975.

What this leaves out, and does not correct: penalty plays are removed for both sides, about 1.6% of dropbacks. Defensive penalties on dropbacks (roughing the passer, interference) average about +1.5 EPA and offensive ones (grounding, holding) about -1.1, so the removal is roughly balanced. Intentional grounding (328 dropbacks from 2018 to 2026, mean -1.83 EPA) is the quarterback's own error and is not in his number; that is about one play per quarterback-season, worth about 0.004 EPA per dropback on a 500-dropback season, under 0.04 of a talent SD. No adjustment is made for it.

## Eligibility is not accumulation

A sample-size floor decides whether a player gets a card, a rank and a grade. It never removes plays. Players under the floor are in `others` with their box score, their contribution and their plain numbers (`obs`: value and plays, no rank). They appear on the contribution board, marked "few plays, no card", without a link; they have no page and no rank on the other two boards. `audit.playerTable` proves that cards plus `others` add up to the plays, per job, on every build. Uncertainty is carried by the range on each grade, which is wide for few plays and is the only thing that separates a low-volume quarterback from a full-time one in the projection.

## Calibration

`build_calibration.py` replays the quarterback estimate on real seasons: for each season 2019-2025 and each cutoff (4, 5, 8 and 10 games) the estimate is made from those games and earlier seasons only, and scored on the rest of that season relative to the league in those games. All checks use the same rows and the same target (the league's quarterback-only EPA per dropback).

* **Width.** The width multiplier (1.45) is learned from every completed season for use on the next one. Its coverage on the seasons it was learned from is only a description. The test is chronological: each season is scored with a width learned from earlier seasons alone, which gives 83.4% inside the 80% range and 97.2% inside the 95% range over 500 player-season-cutoffs. The learned width fell as more seasons arrived (1.85, 1.83, 1.58, 1.46, 1.46).
* **Dependence.** A player is in several seasons and many pairs, so 6,275 pairs are only 705 player-season-cutoffs of 60 quarterbacks. Every interval resamples players, not pairs.
* Other jobs rest on measured reliabilities and have not been replayed; their ranges use the same width and are described that way.

## Pairwise chances

The only probability the pages show about two players is, for **two quarterbacks**: *the chance that A's EPA per dropback over the games still to come is higher than B's, relative to the league in those games, counting the uncertainty in both estimated levels and the luck in both outcomes.* It is not a chance about who is the better quarterback.

It is shown only when both have 4 to 10 games and at least 150 plays are still to come for each, only in a bucket where the out-of-sample replay supported it (at least 100 pairs; the player-clustered interval does not exclude the claim; realized rate within 6 points), rounded **down** to 5%, never below 55% (under that: "too close to call") and never above **80%**, the highest bucket's realized rate rounded down.

| Claimed | Pairs | Realized | 90% interval | Published |
|---|---|---|---|---|
| 50-60% | 2,525 | 59.5% | 56.6-63.2% | yes |
| 60-70% | 2,018 | 68.5% | 63.6-73.4% | yes |
| 70-80% | 1,200 | 77.2% | 71.0-83.9% | yes |
| 80-100% | 532 | 82.5% | 75.7-90.3% | yes, shown as "80% or better" |

Brier score 0.213 against 0.250 for a coin flip. Not published for any other job, after 10 games, or for a mix of seasons.

## Tracking data (Next Gen Stats)

Weekly rows are summed as numerator and weight. A game the provider did not list for a player is not a zero: it is left out of that stat, and `tracked` says how many games and how many plays the stat covers. Every tracking stat uses one cutoff week: the last week through which the provider has posted at least its usual share of the teams that played (`NGS_MIN_COVER`). On the page: "measured on targeted plays at pass arrival" (separation, cushion) and "tracking data covers N of his M carries" (rushing yards over expected).

## Known limits

* The score and the projection describe a player's measured level inside his team. Blocking, route running, coverage assignment and health are not visible in free data.
* Penalty plays are removed (above). Intentional grounding is not in a quarterback's number.
* A new team or head coach is flagged and not adjusted. No aging term was supported on held-out seasons.
* Pairwise chances exist for quarterback pairs in the 4-to-10-game window only.
* Interval calibration is verified for quarterbacks on a rolling replay. Other jobs rest on measured reliabilities and have not been replayed.
* Tracking coverage is the provider's: the rushing file lists only a team's qualifying rushers, so RYOE covers about three quarters of carries and the games in which a back qualified.
* Early in a season most of a projection is earlier seasons (`cw` is about .05-.15 at week 5). Read it with `g0` and the observed rank beside it, as the page does.
