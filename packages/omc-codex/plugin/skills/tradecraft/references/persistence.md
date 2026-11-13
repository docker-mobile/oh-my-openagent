# Persistence: staying in without being noticed

You got in. A reboot, a logoff, a rotated credential, or a patched bug can take
it away tomorrow. Persistence is the work you do tonight so tomorrow's session
does not start from zero.

Two questions pick the mechanism: what does it require, and what does it leave
behind? Every mechanism below is ordered by noise, quietest first, and every
one names the artifact an analyst finds first. Know what you created before
you create it.

## The independence rule

A re-entry path must be independent of the vulnerability you used. If your
persistence dies with the exploit, you have not persisted; you have scheduled a
reminder to exploit the same host again. Before you call persistence done,
answer: if the bug that got me in is patched and the process I am riding is
restarted, what brings me back? If the answer is "the same bug", keep working.

In practice this means at least one of:

- A credential you hold that outlives the session (a key, a token, a password
  hash you can pass). Credentials are covered in credentials.md; here they are
  the cheapest independence you can buy.
- A mechanism that runs at boot or on a schedule and reaches out to you, so
  you never need the original entry point again.
- A second access path of a different class than the first: you came in
  through a web exploit, your re-entry is a shell, a key, or a service account.

## Linux

Ordered quietest first. The "analyst finds" line is the first artifact that
names you: the file, the key, or the log event.

1. **Reconfigure a service that already runs.** An existing daemon with a
   config you can repurpose: a web server that will proxy, a CI runner that
   will execute whatever the repo says, a monitoring agent with an exec hook.
   You change one file and the daemon reloads on its own.
   - Requires: write access to the service's config and a way to trigger the
     behavior.
   - Analyst finds first: the config diff. Keep your addition inside an
     existing include or drop-in directory where other, legitimate entries
     already live, and your line reads as one more.
2. **Systemd timer or cron.** A unit pair (`foo.timer` + `foo.service`) in a
   user's `~/.config/systemd/user/`, or a cron line under the existing
   `/etc/cron.d/` or a user crontab.
   - Requires: write access to the drop-in path, or `crontab` rights.
   - Analyst finds first: the unit file or the crontab entry. Timers are
     slightly quieter than cron because `crontab -l` is the first thing a
     tired admin checks; `systemctl --user list-timers` is further down the
     list. Name the unit like the surrounding naming convention. `backup-sync`
     beats `kworker-helper`.
3. **A service unit.** A real `systemd` service with `Restart=always` for
   something you need always-on, not just a callback.
   - Requires: root for system units, only a user session for `--user` units
     with lingering enabled (`loginctl enable-linger`).
   - Analyst finds first: the unit file, then `journalctl` entries. Note that
     enabling linger itself is a small event an analyst can catch: it changes
     behavior for an account that never stayed logged in before.
4. **Shell profile.** A line appended to `~/.bashrc`, `~/.profile`, or
   `/etc/profile.d/`.
   - Requires: write access to the file.
   - Analyst finds first: the appended line, the moment anyone opens a shell.
     This is loud to a human even though it is quiet to a scanner, because it
     executes in front of whoever logs in. Use only when the host is one
     nobody logs into interactively.
5. **Authorized key.** Append your public key to `~/.ssh/authorized_keys`.
   - Requires: write access to the file, and sshd accepting key auth.
   - Analyst finds first: the extra key line. Mitigate the noise by reusing a
     key that is already there if you have its private half, or by matching
     the key type and comment format of the existing entries. A
     `restrict,command="..."` prefix makes the key look purpose-built and
     limits what it can do, which also limits you; decide which you need.
6. **A library or module the host already loads.** `LD_PRELOAD` via an
   existing service environment, a `.so` dropped into a path the loader
   searches, a Python `.pth` file in site-packages, a `node_modules` postinstall.
   - Requires: write access to a path the loader trusts.
   - Analyst finds first: the new file in a directory that should be stable,
     or a modified timestamp on an old one. Match mtime with `touch -r` against
     a neighbor. This class survives almost everything else being found,
     because it executes inside trusted processes.

Platform notes: on macOS, a LaunchAgent or LaunchDaemon plist in
`/Library/LaunchAgents` or `~/Library/LaunchAgents` is the timer analog, and
`sshd` is usually off, so a key needs you to enable Remote Login first, which
is itself an event. On Windows, the ordering is similar: a COM object or
Winlogon helper registered in an existing hive is quieter than a Run key,
which is quieter than a new scheduled task, which is quieter than a new
service. The artifact logic is identical: find where legitimate entries of the
same kind live and look like one more of them.

## Choosing between them

- **Stealth beats reachability.** A mechanism that only fires when someone
  logs in (shell profile) is quieter than a boot-time service but useless if
  the host sits idle for a week. Match the mechanism to the host's actual
  usage: on a CI runner, the pipeline config is the natural home; on a
  jump box, a service unit or key is.
- **One loud mechanism beats three quiet ones.** Every mechanism is an
  artifact on a checklist somewhere. Two mechanisms is the sane maximum on a
  well-monitored host: one credential-based, one mechanism-based. A third
  adds discovery risk faster than it adds reliability.
- **Prefer mechanisms that produce no new listening port.** Your callback is
  a connection out; that is one event. A reverse shell that also binds a
  local port is two. Prefer outbound-only.

## Hygiene

- Record every path you touched in your cleanup list the moment you touch it.
- If you create a file, copy timestamps from a neighbor (`touch -r`). If you
  edit one, know whether the service logs config reloads; many daemons do.
- Test the mechanism by triggering it once immediately. Persistence you have
  not fired is persistence you have not verified, and the day you need it is
  not the day to debug a typo in a unit file.
- If the mechanism grants access to an account, spend one session confirming
  the account actually works end to end from outside, not just locally.
