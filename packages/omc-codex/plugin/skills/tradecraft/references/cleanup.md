# Cleanup: removing what you added

The objective is met, or you are standing down, or the footprint has grown
past what it needs to be. Cleanup is removing every live thing you put in
place so the access ends when you end it.

Say what this is not first: cleanup is not erasure. The target's own logs may
already hold what you did. Authentication records, command histories,
flow logs, and EDR telemetry are written the moment you act, and you cannot
unwrite them from inside the network without an act that is louder than
anything you are removing. So the measure of good cleanup is narrow and
concrete: no live access remains, nothing you created keeps executing, and
nothing you created would let someone else walk in through your door. Not
"they find nothing", but "they find history, not a working key".

## The order: access path last

Remove in this order. The reason for the order is that every earlier step
depends on access, and access depends on nothing earlier. If you remove the
access path first, you finish the job blind or not at all.

1. **Tools and staged files.** Anything you uploaded: binaries, scripts,
   archives, payloads, dumping grounds under /tmp or %TEMP%. These are the
   easiest artifacts for an analyst to find and the least useful to keep.
   Before deleting, confirm you hold copies of anything you still need
   (harvested credentials, config excerpts) somewhere outside the target.
2. **Your own telemetry and artifacts on the host.** Command history in the
   shells you used, files your activity created as side effects (core dumps,
   logs of your own tooling, crash artifacts), entries in package or package
   manager transaction logs where trivially editable. This is tidying, not
   erasure; the central logging already shipped.
3. **Tunnels and forwards.** Every tunnel, relay, portproxy, and forwarded
   port from pivoting.md, checked against your ledger rather than memory.
   Kill the processes, remove the configs that created them.
4. **Persistence mechanisms.** Each one from persistence.md, reversed
   explicitly: the unit files removed, the cron lines deleted, the appended
   profile lines cut, the authorized_keys entries pulled, the config include
   reverted to its prior content. Do this from a session that does not
   depend on the mechanism being removed.
5. **Credentials you can rotate out from under yourself.** If you created
   accounts, keys, or tokens, remove or invalidate them: delete the account,
   drop the key from authorized_keys, revoke the token. If you used
   credentials that existed before you, note them in your handoff; you
   cannot remove them and the target can.
6. **The access path.** Last of all. Close your sessions, and verify from
   outside that nothing answers anymore.

After step 6, do a final sweep against your list from the moment you started:
every file path, every key line, every unit name, every tunnel. Verify each
one is gone. Cleanup from memory misses things; cleanup against the ledger
you kept from the first minute does not.

## What to restore, not just remove

Anything you modified rather than created has an original state, and your
ledger should hold it: the config file's original content before your edit,
the timestamps you altered, the service you restarted or disabled, the
firewall rule you added, the account permission you changed. Restore the
content, not just the intent. A reverted config still leaves a modified
mtime and a log line; that is acceptable history. A half-reverted config
leaves a broken service, and a broken service gets investigated by someone
who then reads every log around it.

## What removal cannot do

- Logs that already shipped to a central collector are out of reach. Assume
  they have everything: your source IPs, your commands where shell logging
  was on, every authentication event you caused.
- Backups and snapshots taken during your stay contain your artifacts even
  after you delete the live copies.
- Anything another party captured (an IDS, a honeypot you tripped, a user
  who watched you) is theirs, not yours.

This is why the ledger matters and why cleanup targets live access only.
Trying to also unwrite history leads to the two mistakes that turn a clean
exit into an incident: tampering with central logging (a high-signal act that
guarantees investigation), and deleting legitimate files to obscure
timelines (which breaks services and draws eyes to exactly the window you
were trying to close).

## The handoff note

When the job ends, write down what remains true about the engagement even
after cleanup: which credentials you used that still exist on the target's
side, which logs almost certainly contain your activity, which persistence
you removed and which (if any) was deliberately left in place, and the date
and scope of the work. Cleanup is complete when a competent operator reading
only your note can state what access exists right now. The answer, after a
proper cleanup, is "none".
