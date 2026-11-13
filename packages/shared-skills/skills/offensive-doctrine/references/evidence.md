# Evidence

Everything you claim about the target lives or dies on evidence. A finding you
cannot back with the command that produced it is a rumor, and a rumor that
reaches the operator poisons every decision downstream of it. Build the graph
on facts or do not write the entry.

## The chain, link by link

There is a fixed chain from observation to impact, and every link needs its
own proof. The chain is:

**banner -> version -> vulnerability -> exploit -> access -> impact**

- **A banner is not a version.** `Apache/2.4.49` in a Server header is a claim
  the software makes about itself. Confirm the version from a second source
  before you lean on it: a response body, an error page, a JAR or DLL
  filename, a fingerprint probe that reads behavior. Banners are often stale,
  often proxied, often lies.
- **A version is not a vulnerability.** A CVE matching the version says the
  code *may* be vulnerable. Configuration, backports, and hardening decide.
  You confirm a vulnerability only with a probe whose response distinguishes
  vulnerable from patched.
- **A vulnerability is not an exploit.** Knowing CVE-2021-41773 applies means
  nothing until your specific payload produces the specific response on this
  specific instance. Run it.
- **An exploit is not access.** A 200 with command output is access. A crash,
  a 500, or a delayed response is not. Prove what you can do with the
  foothold: whoami, id, read a file only that position can read.
- **Access is not impact.** A shell as `www-data` on a host with no data, no
  network position, and no escalation path is a footnote, not a finding.
  State what the access actually reaches: data, credentials, pivots, domain
  position.

**Skipping a link is forbidden.** Every skipped link becomes a false claim
somewhere: the banner that was a proxy's, the CVE that was backported, the
exploit that fired against a honeypot decoy, the shell that could read
nothing. If you have not proven link N+1, your claim stops at N. Write it
that way.

## What counts as evidence

A fact in the graph carries three things, and all three are required:

1. **The command run**, exact, replayable: tool, arguments, target.
2. **The output** that backs the claim: the response, the file content, the
   screenshot, the bytes. Trimmed to the relevant lines, but never
   paraphrased. Paraphrase is where facts rot into fiction.
3. **The interpretation**, one line: what this output proves and what it does
   not. `curl -s http://10.0.0.5/api/users` returning a JSON list proves
   unauthenticated data exposure of that endpoint and nothing about the rest
   of the API.

Good fact: `cred admin:P@ssw0rd123 validated against 10.0.0.5:5985 (evil-winrm,
whoami = svc_deploy)` with the session transcript attached.
Bad fact: `found admin creds`. Found where? Valid where? Says who?

## Leads are not findings

An unconfirmed lead is recorded as a lead, never as a finding. The record
names the lead, the reason it looks live, and the cheapest confirming test
you did not run yet. Examples: "directory /backup exists and returns 403,
not 404: worth auth-bypass check", "SMB host might be a DC, no LDAP enum yet".

Leads and findings live in separate registers. When a lead confirms, it moves
to the findings with its evidence. When a lead dies, it stays in the lead
register with its kill reason so nobody re-derives it in an hour. What never
happens: a lead written as a fact, then quoted later as though it were
proven. That is how engagements report phantom vulnerabilities.

A scanner WARNING is not a vulnerability. Scanners guess from fingerprints;
their output is a lead generator, not an oracle. Same rule for any AI-
suggested "vulnerability", any blog post about a similar setup, and your own
intuition. All of them are leads until a command proves otherwise.

## Do not invent results

If evidence is missing, the next action is a command that produces it, not a
sentence that assumes it. "Probably vulnerable" is a lead. "Working on the
exploit" is a plan. Neither is a fact. When you fail, record the failure
with its exact command and error: a documented failure is valuable evidence
that kills a dead lead for good and stops the next operator from re-walking
it.
