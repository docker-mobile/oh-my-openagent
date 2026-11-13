# Credentials: the multiplier

One host with no credentials is one host. One host with the right credential
material is the whole environment the host can see. Harvesting and pricing
credentials is the highest-return work you do on any foothold, and the
discipline is the same as for any asset: know what it is worth before you
spend it.

## Where material actually lives

Work through these in order on every new foothold. The first three cost
seconds; the rest cost minutes. Skip nothing just because the host "looks
empty".

**Process memory and command lines.** `/proc/*/cmdline` and the environment
blocks in `/proc/*/environ` on Linux; running processes on Windows via a
memory dump of `lsass` (requires SYSTEM) or a tool like `procdump` on a
promising process. Long-running daemons hold secrets in argv and env far more
often than people expect: database URLs, API keys, `AWS_ACCESS_KEY_ID`. Scan
every process command line first; it is one command and frequently enough.

**Environment.** The current shell's env, the systemd unit environment for
every service (`systemctl show <unit> -p Environment` or the
`/etc/systemd/system/*.d/` drop-ins and `EnvironmentFile=` targets), Docker
containers (`docker inspect` on every running container), CI runner config.
A service that talks to a database has its password in one of these.

**Configuration files of services that need secrets.** Application config
trees: `/etc/`, the app's own directory, dotfiles in home directories,
`web.config` / `appsettings.json` on Windows, `.env` files, `wp-config.php`,
`settings.py`, `application.properties`, Kubernetes mounts under
`/var/run/secrets/` on anything running kube. Grep for the shapes: `password`,
`secret`, `token`, `key`, `conn`, `jdbc`, `postgres://`, `AKIA`.

**Browser and application stores.** A foothold on a workstation or a host
where a human works: saved logins in Chrome/Firefox profile databases
(decryptable as the logged-in user), cookie stores (session hijack without
ever learning a password), SSH configs and known hosts (`~/.ssh/`, including
agent forwarding sockets: `SSH_AUTH_SOCK` lets you use keys held in an agent
on a host you jumped from), git credential stores (`.git-credentials`,
`git credential fill`), RDP saved creds on Windows (cmdkey /list).

**Key material.** SSH private keys anywhere in home directories (`find /
-xdev -name id_* -o -name *.pem 2>/dev/null`), TLS client certs, GPG keys,
`.kube/config` (often admin for the whole cluster), service-account JSON for
cloud providers, `id_rsa` baked into container images.

**Cached authentication.** Windows: `Mimikatz`-class extraction of
NTDS.dit/cached domain credentials when you are SYSTEM on a domain-joined
box, and DPAPI-protected blobs readable as the user. Linux: Pluggable
Authentication Module caches are rare, but `/etc/shadow` hashes on an
illicitly-read host crack offline. Sudo timestamp files are not reusable, but
a readable `/etc/sudoers.d/` tells you whose password unlocks root.

**Tokens with wider scope than the session.** Cloud instance metadata
endpoints (SSRF-style: from the host itself, `169.254.169.254` on AWS/GCP,
the IMDS on Azure) handing over role credentials that belong to the machine,
not the user. OAuth refresh tokens in app config. CI/CD tokens with repo or
deploy scope. Kubernetes service-account tokens on pods. These are the
highest-value finds because their scope is usually broader than anything the
local user could do.

## Pricing a credential before you spend it

A credential is an asset with a blast radius. Before you use it, write down
three things:

1. **Identity**: what account or principal does it authenticate as? (Read the
   key's comment, the token's claims, run `aws sts get-caller-identity`,
   `whoami` with the ticket.)
2. **Reach**: what can that principal touch? On cloud creds, list the actual
   policy; on domain creds, the group memberships; on SSH keys, the
   `authorized_keys` restrict lines and the account's sudo rights.
3. **Sensitivity**: does using it generate a high-signal event? A domain
   admin login on a workstation is an alert; a service account API call is a
   log line. Price the detection cost alongside the value.

The spending rules:

- **Prefer the least-privileged credential that answers the question.** You
  need to read one file on one server. If a low-privileged account can read
  it, use that. Escalate only when the low-priv attempt fails, not before.
- **Never burn a high-value credential on a low-value check.** Using the
  domain admin to test whether port 445 is open is the mistake that ends
  engagements, because the log it leaves is the one that gets correlated.
- **Spend cheap credentials to find expensive ones.** A user-level shell on a
  dev box that holds the CI token is the path; do not reach for the CI token
  until the user-level shell has told you exactly where it is.
- **Know the credential's lifetime and audit trail.** A token with an expiry
  you will outlive is worth banking; a session cookie you just created has a
  footprint tied to your current access. Note both in your asset list.
- **Assume every use is logged somewhere.** The question is never "can they
  see it" but "does it look unusual next to this account's normal behavior".
  A service account that normally calls from one IP calling from your
  foothold is a pattern an analyst can catch; if you must use it, use it in
  its normal shape (same region, same endpoints, similar volume).

## Keeping the ledger

Maintain one running list of every credential: type, identity, reach, where
you got it, and what you have used it for. This does three things: prevents
double-spending something whose use was noisy, lets you answer "what would a
rotation kill?" when planning re-entry, and makes cleanup honest about what
the target may already know. A credential you forgot you have is a credential
you will burn by accident.
