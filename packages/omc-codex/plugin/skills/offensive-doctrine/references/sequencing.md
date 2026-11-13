# Sequencing

Order of operations is the difference between an engagement that lands in the
first hour and one that dies in recon. The rule underneath everything here:
**a lead you can confirm in minutes outranks a lead that might be worth more
later, because an unconfirmed lead has zero value.** Impact only counts once
something is proven. Sort by cost-to-confirm first, impact second.

## The cost split

Every lead has a price tag. Learn to price on sight.

**Minutes-tier (attack these first):**

- Default and weak credentials: `admin:admin`, `root:root`, vendor defaults
  (Tomcat `tomcat:s3cret`, Jenkins, Grafana, phpMyAdmin, routers, IPMI
  `ADMIN:<serial>`). Try against every login surface you see.
- Exposed admin panels and consoles: `/admin`, `/manager/html`, Jenkins
  script console, Kibana, RabbitMQ management, Docker API on 2375, Redis
  unauthenticated, MongoDB unauthenticated.
- Known-CVE banners: an HTTP `Server` header, a version string in a footer, a
  JAR filename in a stack trace, an `X-Powered-By`. Fingerprint to exact
  version, check it against your CVE list, fire a public exploit if one exists.
- Unauthenticated services: SMB null sessions, LDAP anonymous binds, FTP
  anonymous, NFS `showmount`, open Elasticsearch on 9200, open Grafana
  without auth.
- Misconfigured shares: world-readable SMB with juicy filenames, anonymous
  rsync, writable FTP roots.
- Credential reuse: any cred you harvested anywhere goes against every other
  login surface immediately. Passwords repeat across services far more often
  than not.

Each of these is one to three commands away from a yes or no. Run them before
anything else, every time, even if they look boring.

**Hours-tier (earn your way here):**

- Custom exploit development against a patched or niche vulnerability.
- Blind fuzzing with no feedback signal.
- Protocol reverse engineering, cryptanalysis, custom deserialization chains.
- Long fuzz-and-pray paths where the response tells you nothing.

Never open an hours-tier lead while a minutes-tier lead is unconfirmed. The
hours-tier work is real work and it will be there later; the cheap stuff
might end the engagement in ten minutes.

## The priority ladder

Work rung 1 down to rung 5. You only climb up when the signal below tells you
to, and you only fall back when the current rung's leads are exhausted.

| Rung | Work | The signal that moves you |
|---|---|---|
| 1 | Default creds, exposed consoles, unauthenticated services, known-CVE versions | A working login, a shell, a CVE exploit confirming: engagement may be over. Rung 2+ only if the objective needs more. |
| 2 | Authenticated attack surfaces using any cred you hold: admin functions, config files, backup endpoints, scheduled tasks | New creds, readable configs, or a second service using the same software. Dump what you can read; every config is more creds. |
| 3 | Version-specific exploitation against exact fingerprints (no public exploit: hand-adapt the closest public one) | A fingerprint tight enough to name the version. If the version is only a guess, do not pay hours on a guess: re-rank. |
| 4 | Foothold expansion: internal enumeration, pivoting, lateral movement with harvested creds | A foothold with new network position. Every new position gets its own rung-1 sweep of the internal range. |
| 5 | Custom exploit dev, blind fuzzing, deep chains | All four rungs above are exhausted on every known lead. Budget at least a full timebox before you start. |

Ladder discipline:

- A new fact can jump you down the ladder, never up without evidence. A
  harvested password sends you to rung 2 against everything, instantly.
- When a rung's lead dies, re-rank the whole frontier (see timeboxing.md).
  Do not slide to the next item on the same rung by inertia.
- The moment you hold a foothold, rung 4 plus a rung-1 sweep of the new
  position beats anything else. Re-enumerate from every new vantage point:
  config files, environment variables, cron jobs, cached keys, services on
  localhost, source trees.

## The confirmation test

Before spending effort on any lead, answer one question: what is the single
cheapest command that turns this lead into a yes or no? Run exactly that.

- A login form exists is not evidence. One credential attempt against it is.
- A version string in a banner is not evidence. Version-plus-CVE-check
  plus proof-of-concept response is.
- A directory listing is not evidence. Reading the listed file is.

If the confirming command costs more than a couple of minutes and the lead
is not your best option, drop it a rung. If the confirming command fails,
the lead is dead for now: record it as a lead (never a finding), and
re-rank. Do not retry the same confirming command with cosmetic variations
out of hope; that is a timebox violation, not persistence.
