---
name: tradecraft
description: "Adversary tradecraft for staying effective on a target: persistence, credential material, pivoting to the next host, and cleaning up the trail you made. Use after initial access is confirmed and the objective needs more than one host or more than one session."
---

# Tradecraft

Initial access is a rental. This skill is how you turn it into a lease: hold the
host, spend its secrets, reach the next machine, and leave nothing live behind
when you go.

Load this skill only once the beachhead is real and confirmed. Before that, your
problem is access, not persistence. After that, your problem is time: every
session you lose to a reboot, a credential rotation, or a dead foothold is work
you redo from zero.

## Operating rules that govern everything here

- A foothold without an independent re-entry path is a countdown, not an
  outpost. If the patch that closes your exploit also closes your access, you
  never persisted.
- Every credential is an asset with a blast radius. Price it before you spend
  it. Never burn a domain-admin ticket to read one file.
- Every hop you add is a dependency you can lose. Label your chains so one dead
  relay does not take the whole engagement with it.
- Cleanup is about killing live access, not erasing history. The target's logs
  may already contain everything. Act like it.

## References

Read by problem, not in order:

| File | Read when |
|------|-----------|
| [persistence.md](references/persistence.md) | You need the session to survive a reboot, a logoff, or the fix for the bug you came in through. Mechanisms by platform, ordered by noise, with the artifact each one leaves for an analyst. |
| [credentials.md](references/credentials.md) | You need to move beyond what this one account can see. Where credential material actually lives on real hosts and how to spend it without burning it. |
| [pivoting.md](references/pivoting.md) | The next host or segment is behind the one you hold. Turning a foothold into a route: enumeration, tunneling, and keeping a hop chain distinguishable. |
| [cleanup.md](references/cleanup.md) | The objective is met or you are standing down. What to remove, in what order, and the honest limit of what removal can do. |

## Sequencing

Typical order on a new foothold: establish one quiet persistence mechanism
(persistence.md), harvest and price the credential material (credentials.md),
map the neighborhood and decide whether to move or consolidate (pivoting.md),
and keep a running list of every artifact you created so cleanup.md has
something accurate to work from. Write that list from the first minute. Cleanup
you improvise at the end is cleanup that misses things.
