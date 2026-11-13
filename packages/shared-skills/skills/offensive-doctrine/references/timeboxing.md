# Timeboxing

The clock is a weapon. Every minute spent on a dead lead is a minute handed
to the defense. The failure mode is never the hard target; it is the
operator who spent three hours and nine payload variations on a vector that
was dead after twenty minutes, while three unconfirmed cheap leads sat in
the register. Timeboxing exists so you kill leads mechanically instead of
emotionally.

## Kill thresholds

Apply these numbers without deliberation. When the threshold trips, the
lead is dead and you re-rank. Arguing with the threshold is how the
grinding failure mode wins.

| Situation | Box | Kill signal |
|---|---|---|
| Default cred sweep against one service | 5 min | Cred list exhausted, no success |
| Confirming or denying one known CVE | 10 min | PoC run twice, no distinguishing response, no deeper diagnostic left |
| Directory/content discovery on one host | 15 min | Wordlist done, nothing new at depth reached |
| Exploit adaptation (public exploit to this target) | 30 min | Two distinct root causes of failure identified and neither is fixable in minutes |
| Blind fuzzing one endpoint/protocol | 30 min | No state change, no error difference, no timing signal |
| One host with zero confirmed facts | 45 min | Every rung-1 checklist item run and failed |
| Custom exploit development | 2-3 hr max, one session | Core crash/bug not reproducing after one full session |

A failed timebox is a result, not a defeat. Record it as a dead lead with
the kill reason: exact command, exact error, best guess at the blocking
dependency. That record is what stops you or the next operator from paying
for the same box twice.

## Dead means re-rank, not next-neighbor

When a lead dies, the instinct is to slide to the adjacent item on the same
rung. Resist it. **A dead lead changes the information state of the whole
engagement, so the frontier must be re-ranked against the new state.**

Concretely, after every kill:

1. Ask what the failure taught you. A 403 on `/admin` under one credential
   set, a WAF that drops SQLi syntax, a service that ignores malformed
   input: each of these is intel that upgrades or kills other leads too.
2. Re-score the remaining leads with the new intel. The lead that was
   second-best may now be worthless (same WAF, same patch level, same
   platform) or may have jumped (new angle implied by the failure).
3. Pick the new best lead. If the best one is hours-tier and any
   minutes-tier lead is unconfirmed, the minutes-tier lead wins anyway.

Skipping this step is how operators chain three dead leads from the same
dead family: same WAF, same version, same vertical. The kill reason almost
always transfers. Apply it before spending another box.

## Spending a fixed remaining budget

When you know how much time is left, allocate it before you spend it.
Bucket the budget:

- **Under 15 minutes:** rung-1 only. Cheap confirming commands across
  remaining leads. No new scans that produce output slower than you can
  read it. Bank whatever confirms, record the rest as leads.
- **15 to 60 minutes:** one hours-tier lead maximum, and only if a
  minutes-tier lead is not pending confirmation. Otherwise sweep rungs 1
  and 2 across every host you have not checked.
- **1 hour to half the engagement:** one hours-tier lead with a defined
  box (see thresholds), plus rung-1 sweeps on any newly discovered host.
  Keep half the remaining budget unspent at all times until a lead
  confirms; confirmed findings, not hours billed, are the product.
- **The last quarter:** stop opening new fronts. Verify everything you
  claimed, submit everything submittable, close the record. Unrecorded
  wins are losses.

Two standing rules override any allocation:

- **Never hold a box on an unconfirmable guess.** If the confirming command
  does not exist yet, the lead waits until one is found.
- **A confirmed lead interrupts everything.** If any cheap command can
  confirm a lead right now, it outranks the hours-tier work in progress.
  Finish the confirmation, bank the result, then resume.

## Recognizing the grind in yourself

Warning signs you are past a lead's value: you are editing the same payload
for the third time; you are reading a third tutorial on the same technique;
you cannot state in one sentence what a successful next attempt would prove;
you are telling yourself "almost" without a written down delta between
almost and done. Any one of these: box is over, kill the lead, re-rank.
