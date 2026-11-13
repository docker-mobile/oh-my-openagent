# Pivoting: moving to the next host

You hold one machine. The objective lives elsewhere: another segment, a
management network, a workstation, a cloud control plane. Pivoting is turning
your foothold into a route so you can reach it as if you were local.

## When to pivot and when to stop

Pivot only when you can answer yes to all three:

1. You have a named target on the far side: a host, a service, a credential
   you intend to use. "See what's over there" is not a target; it is how
   engagements sprawl and how noisy ones get caught.
2. Your foothold is itself durable: a re-entry path exists and your
   credentials are banked. If the hop dies mid-work and the foothold behind
   it dies with your only session, you lose everything at once.
3. The route's detection cost is understood: you know whether the intermediate
   host logs forwarded connections, whether the far segment has egress
   monitoring, and you have decided those costs are worth the target.

Otherwise, stop and consolidate. Harvest more credentials, map more of the
local network, harden your persistence, and let the picture come to you.
Momentum feels like progress; in a monitored environment, every hop is a
chance to be seen, and the operator who moves only when the move is named
lasts longer than the one who scans because scanning is possible.

## Enumerating the neighborhood

From the foothold, answer four questions before touching anything beyond it:

- **What is this host connected to?** Interfaces and routes (`ip addr`,
  `ip route`, `arp -a`), then read them like a map: each interface is a
  network you can potentially reach, and the ARP cache shows who talked to
  this host recently.
- **What has this host talked to?** Established and listening sockets
  (`ss -tunap` / `netstat -ano`), connection history where available, and
  application-level hints: database connection strings, LDAP server configs,
  `/etc/hosts`, DNS resolver settings, service configs pointing at other
  hosts by name. A web app's config names its database host; the database
  host is a target you already have credentials for.
- **What names resolve here?** The internal DNS view is the environment's own
  inventory. Zone transfer if it is misconfigured; otherwise enumerate names
  the host itself uses. Internal naming conventions (`db01`, `vpn`, `jenkins`)
  are worth more than a ping sweep.
- **What does the local segment look like?** Passive first: listen to ARP,
  watch broadcasts, read what arrives. Active sweeps (`ping`, port scans)
  only with a rate and scope you have decided in advance, and never a
  full-range scan from a host that has no legitimate reason to scan.

Channels between hosts matter as much as the hosts themselves: which
protocols cross segment boundaries (RDP and WinRM from admin workstations,
SSH from bastions, DNS and HTTPS from everywhere), which ports egress
filters allow, whether the host can reach the internet directly or through
a proxy. The path you take is the one that looks like existing traffic, not
the one that is technically open.

## Tunneling and forwarding

The mechanics, in the order you should reach for them:

- **Local port forward** when the target service is reachable from the
  foothold but not from you: `ssh -L 5432:db.internal:5432 jump` forwards
  your local 5432 through the foothold to the database. No tooling on the
  target, one process, one connection pattern (your foothold connecting to
  the DB, which it probably does anyway).
- **Dynamic forward / SOCKS** when you want to explore rather than reach one
  service: `ssh -D 1080 jump` gives you a SOCKS proxy at your end, and
  proxychains or an app-level proxy setting sends any tool through it. This
  is the default for scanning and for web apps on internal hosts.
- **Remote forward** when the foothold cannot reach you but you need to push
  a listener in: `ssh -R 9000:localhost:9000 you@yourbox` from the target
  exposes a service from your side to the target's network. Common when the
  foothold is egress-restricted except for a couple of ports.
- **Forwarders without ssh**: on Windows, `netsh interface portproxy` builds
  a TCP forwarder natively; `plink` does the ssh cases where ssh.exe is
  absent. socat covers both directions on Linux and
  `socat TCP-LISTEN:8443,fork TCP:internal:443` reads exactly like what it
  does.
- **When no shell-level forwarding exists**, fall back to protocol-native
  relays: an HTTP proxy you stand up on the foothold, DNS as a carrier when
  nothing else crosses, or an ICMP tunnel as the last resort. Each is slower
  and weirder than the ssh family; pay that cost only when the ssh family
  cannot cross.

Rules for tunnels:

- One tunnel, one purpose, documented. Name them and note the exact command
  in your ledger. A mystery listener on 8443 that you cannot explain in an
  hour is a finding for their team and a mystery for you.
- Match the protocol shape of the host. A build server that has never made a
  connection to port 4444 should not start making one.
- Prefer connections that mimic existing flows: the foothold already talks to
  the database; your tunnel riding that same route is invisible in topology,
  even if volume spikes.
- Tear tunnels down when a phase ends. Idle tunnels are artifacts, and an
  artifact discovered is traced backwards hop by hop.

## Keeping a chain of hops distinguishable

Long chains fail at their weakest hop and take the whole session down with
them. Two disciplines prevent that:

- **Label every hop.** Give each session and tunnel a name recording where it
  sits in the chain: `edge-web01`, `hop2-dc01`, `db-tunnel`. In your
  tooling, in your tmux window names, in your notes. When the middle hop
  dies, you should be able to say in seconds which sessions it carried and
  which are independent.
- **Build for graceful loss.** Any hop deeper than two should have its own
  persistence on the far side: a key on the third host reachable by a path
  that does not cross the second, or a callback from the third host that
  does not traverse the chain. The test: kill any single hop mentally and
  confirm you still have a route to every host that matters. If killing hop
  two strands everything past it, you have a chain, not a network, and you
  should add one independent path before going deeper.
- **Keep timing and fingerprints per-hop.** Sessions that all beacon at the
  same interval from different hosts correlate. Vary intervals per hop, and
  keep per-hop identity (keys, host fingerprints) distinct so the loss of
  one does not compromise the others.
