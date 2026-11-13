import { describe, expect, test } from "bun:test"
import type { OffensiveAction, OffensivePrimitive, PrimitiveCommand } from "./types"
import { rankForState, searchPrimitives, type ArsenalRankState } from "./query"

function command(overrides: Partial<PrimitiveCommand> = {}): PrimitiveCommand {
  return {
    code: "binary --flag",
    description: "runs the binary",
    usecase: "execute",
    category: "Execute",
    privileges: "unprivileged",
    contexts: [],
    ...overrides,
  }
}

function primitive(overrides: Partial<OffensivePrimitive> = {}): OffensivePrimitive {
  return {
    source: "gtfobins",
    id: "gtfobins:subject",
    binary: "subject",
    name: "subject",
    description: "",
    actions: ["execute"],
    platform: ["linux"],
    mitre: ["T1059"],
    commands: [command()],
    tags: [],
    ...overrides,
  }
}

function idList(primitives: readonly OffensivePrimitive[]): string[] {
  return primitives.map((entry) => entry.id)
}

function positionOf(primitives: readonly OffensivePrimitive[], id: string): number {
  return primitives.findIndex((entry) => entry.id === id)
}

function numericPrimitives(count: number, prefix = "p"): OffensivePrimitive[] {
  return Array.from({ length: count }, (_, index) =>
    primitive({
      id: `${prefix}:${String(index + 1).padStart(3, "0")}`,
      binary: `${prefix}${index + 1}`,
      name: `${prefix}${index + 1}`,
    }),
  )
}

const LINUX_STATE: ArsenalRankState = { privilege: "user", platform: "linux", tty: true, hasShell: true }

describe("searchPrimitives filters", () => {
  describe("#given a corpus with one primitive per distinguishing attribute", () => {
    const shellLinux = primitive({ id: "a:shell-linux", actions: ["shell"], platform: ["linux"] })
    const shellWindows = primitive({ id: "b:shell-windows", actions: ["shell"], platform: ["windows"] })
    const reconLinux = primitive({ id: "c:recon-linux", actions: ["recon"], platform: ["linux"] })
    const corpus = [shellLinux, shellWindows, reconLinux] as const

    describe("#when filtering by action alone", () => {
      test("#then only primitives listing that action survive", () => {
        expect(idList(searchPrimitives(corpus, { action: "shell" }))).toEqual([
          "a:shell-linux",
          "b:shell-windows",
        ])
        expect(idList(searchPrimitives(corpus, { action: "recon" }))).toEqual(["c:recon-linux"])
        expect(idList(searchPrimitives(corpus, { action: "uac-bypass" }))).toEqual([])
      })
    })

    describe("#when filtering by platform alone", () => {
      test("#then only primitives listing that platform survive", () => {
        expect(idList(searchPrimitives(corpus, { platform: "linux" }))).toEqual([
          "a:shell-linux",
          "c:recon-linux",
        ])
        expect(idList(searchPrimitives(corpus, { platform: "windows" }))).toEqual(["b:shell-windows"])
        expect(idList(searchPrimitives(corpus, { platform: "macos" }))).toEqual([])
      })
    })

    describe("#when filtering by binary alone", () => {
      test("#then only the exact binary matches", () => {
        const exact = primitive({ id: "d:tar", binary: "tar", name: "Tar Archive" })
        const similar = primitive({ id: "e:tar-wrapper", binary: "tar-wrapper", name: "tar" })

        expect(idList(searchPrimitives([exact, similar], { binary: "tar" }))).toEqual(["d:tar"])
      })
    })

    describe("#when filtering by mitre alone", () => {
      test("#then only primitives carrying that technique id survive", () => {
        const evasive = primitive({ id: "f:evasive", mitre: ["T1218", "T1059"] })
        const plain = primitive({ id: "g:plain", mitre: ["T1059"] })

        expect(idList(searchPrimitives([evasive, plain], { mitre: "T1218" }))).toEqual(["f:evasive"])
        expect(idList(searchPrimitives([evasive, plain], { mitre: "T1218.011" }))).toEqual([])
      })
    })

    describe("#when filtering by source alone", () => {
      test("#then only that corpus is returned", () => {
        const fromGtfobins = primitive({ id: "h:gtfobins", source: "gtfobins" })
        const fromLolbas = primitive({ id: "i:lolbas", source: "lolbas", platform: ["windows"] })

        expect(idList(searchPrimitives([fromGtfobins, fromLolbas], { source: "gtfobins" }))).toEqual([
          "h:gtfobins",
        ])
        expect(idList(searchPrimitives([fromGtfobins, fromLolbas], { source: "lolbas" }))).toEqual([
          "i:lolbas",
        ])
      })
    })

    describe("#when filtering by text", () => {
      test("#then name, description, binary and tag matches all qualify", () => {
        const byName = primitive({ id: "j:name", name: "Runas", binary: "runas", description: "" })
        const byDescription = primitive({
          id: "k:description",
          name: "Zeta",
          binary: "zeta",
          description: "Runs a command as another user",
        })
        const byBinary = primitive({ id: "l:binary", name: "Omega", binary: "omega" })
        const byTag = primitive({ id: "m:tag", name: "Sigma", binary: "sigma", tags: ["Remote: WSH"] })
        const corpusForText = [byName, byDescription, byBinary, byTag] as const

        expect(idList(searchPrimitives(corpusForText, { text: "runas" }))).toEqual(["j:name"])
        expect(idList(searchPrimitives(corpusForText, { text: "another user" }))).toEqual(["k:description"])
        expect(idList(searchPrimitives(corpusForText, { text: "omega" }))).toEqual(["l:binary"])
        expect(idList(searchPrimitives(corpusForText, { text: "remote" }))).toEqual(["m:tag"])
      })

      test("#then text matches the command body, not just the primitive metadata", () => {
        const withPayload = primitive({
          id: "n:payload",
          name: "Ordinary",
          binary: "ordinary",
          description: "No hints here",
          tags: [],
          commands: [command({ code: "ordinary -c 'LD_PRELOAD=/tmp/evil.so ordinary'" })],
        })
        const withoutPayload = primitive({ id: "o:clean", name: "Other", binary: "other", tags: [] })

        const hits = searchPrimitives([withPayload, withoutPayload], { text: "ld_preload" })

        expect(idList(hits)).toEqual(["n:payload"])
      })

      test("#then matching is case-insensitive in both directions", () => {
        const mixed = primitive({ id: "p:mixed", name: "FILE ReAd", binary: "mixed", tags: [] })

        expect(idList(searchPrimitives([mixed], { text: "file read" }))).toEqual(["p:mixed"])
        expect(idList(searchPrimitives([mixed], { text: "FILE READ" }))).toEqual(["p:mixed"])
      })
    })

    describe("#when several filters are combined", () => {
      test("#then an item matching one filter but not another is excluded", () => {
        const matchesBoth = primitive({ id: "q:both", actions: ["shell"], platform: ["linux"], mitre: ["T1059"] })
        const wrongPlatform = primitive({ id: "r:wrong-platform", actions: ["shell"], platform: ["windows"], mitre: ["T1059"] })
        const wrongAction = primitive({ id: "s:wrong-action", actions: ["recon"], platform: ["linux"], mitre: ["T1059"] })
        const wrongMitre = primitive({ id: "t:wrong-mitre", actions: ["shell"], platform: ["linux"], mitre: ["T1005"] })

        const combined = searchPrimitives([matchesBoth, wrongPlatform, wrongAction, wrongMitre], {
          action: "shell",
          platform: "linux",
          mitre: "T1059",
        })

        expect(idList(combined)).toEqual(["q:both"])
      })

      test("#then a text filter also AND-combines with the structured filters", () => {
        const wanted = primitive({
          id: "u:wanted",
          actions: ["shell"],
          platform: ["linux"],
          name: "Shellshock",
          binary: "shellshock",
        })
        const noText = primitive({ id: "v:no-text", actions: ["shell"], platform: ["linux"], name: "Quiet", binary: "quiet" })

        const hits = searchPrimitives([wanted, noText], { action: "shell", platform: "linux", text: "shellshock" })

        expect(idList(hits)).toEqual(["u:wanted"])
      })
    })
  })
})

describe("searchPrimitives ordering and limit", () => {
  describe("#given a corpus supplied in an order that is not id order", () => {
    const shuffled = [numericPrimitives(3)[2], numericPrimitives(3)[0], numericPrimitives(3)[1]] as OffensivePrimitive[]

    describe("#when searching without an explicit limit", () => {
      test("#then results come back ordered by id", () => {
        expect(idList(searchPrimitives(shuffled, {}))).toEqual(["p:001", "p:002", "p:003"])
      })
    })

    describe("#when the same search runs twice", () => {
      test("#then both calls produce the identical id order", () => {
        const first = idList(searchPrimitives(shuffled, { action: "execute" }))
        const second = idList(searchPrimitives(shuffled, { action: "execute" }))

        expect(first).toEqual(second)
        expect(first).toEqual(["p:001", "p:002", "p:003"])
      })

      test("#then a re-ordered copy of the input yields the same order", () => {
        const reversed = [...shuffled].reverse()

        expect(idList(searchPrimitives(reversed, {}))).toEqual(idList(searchPrimitives(shuffled, {})))
      })
    })
  })

  describe("#given a corpus larger than the default limit", () => {
    const corpus = numericPrimitives(60)

    describe("#when no limit is supplied", () => {
      test("#then the default caps the result at 50", () => {
        const results = searchPrimitives(corpus, {})

        expect(results.length).toBe(50)
        expect(results[0]?.id).toBe("p:001")
        expect(results[49]?.id).toBe("p:050")
      })
    })

    describe("#when an explicit limit is supplied", () => {
      test("#then the limit is applied after ordering, keeping the lowest ids", () => {
        const results = searchPrimitives([...corpus].reverse(), { limit: 3 })

        expect(idList(results)).toEqual(["p:001", "p:002", "p:003"])
      })

      test("#then a limit of zero is honored", () => {
        expect(searchPrimitives(corpus, { limit: 0 })).toEqual([])
      })
    })
  })

  describe("#given a corpus larger than the hard ceiling", () => {
    const corpus = numericPrimitives(520)

    describe("#when a limit above the ceiling is requested", () => {
      test("#then the result never exceeds 500 entries", () => {
        const results = searchPrimitives(corpus, { limit: 10_000 })

        expect(results.length).toBe(500)
        expect(results[499]?.id).toBe("p:500")
      })

      test("#then the ceiling also caps an explicit oversized limit, not only a computed one", () => {
        expect(searchPrimitives(corpus, { limit: 501 + 1 }).length).toBe(500)
        expect(searchPrimitives(corpus, { limit: Number.MAX_SAFE_INTEGER }).length).toBe(500)
      })
    })

    describe("#when the limit is not a usable number", () => {
      test("#then it falls back to the default instead of returning nothing", () => {
        expect(searchPrimitives(corpus, { limit: Number.NaN }).length).toBe(50)
        expect(searchPrimitives(corpus, { limit: Number.POSITIVE_INFINITY }).length).toBe(50)
      })
    })
  })

  describe("#given the caller's input array", () => {
    const corpus = numericPrimitives(4)
    const snapshot = structuredClone(corpus)

    describe("#when a search runs against it", () => {
      test("#then the input array is not mutated", () => {
        searchPrimitives(corpus, { action: "execute" })
        searchPrimitives(corpus, { limit: 1 })

        expect(corpus).toEqual(snapshot)
        expect(idList(corpus)).toEqual(["p:001", "p:002", "p:003", "p:004"])
      })
    })
  })
})

describe("rankForState", () => {
  describe("#given primitives spanning several offensive tiers on linux", () => {
    const escalation = primitive({
      id: "a:escalation",
      actions: ["privilege-escalation"],
      commands: [command({ privileges: "unprivileged" })],
    })
    const credential = primitive({ id: "b:credential", actions: ["credential-access"] })
    const evasion = primitive({ id: "c:evasion", actions: ["defense-evasion"] })
    const execution = primitive({ id: "d:execution", actions: ["shell", "reverse-shell"] })
    const recon = primitive({ id: "e:recon", actions: ["recon"] })
    const fileRead = primitive({ id: "f:file-read", actions: ["file-read"] })

    describe("#when ranking an unsorted corpus for a user-level linux shell", () => {
      test("#then privilege escalation ranks above recon and file access", () => {
        const ranked = rankForState(LINUX_STATE, [recon, fileRead, escalation])

        expect(ranked[0]?.id).toBe("a:escalation")
        expect(positionOf(ranked, "a:escalation")).toBeLessThan(positionOf(ranked, "e:recon"))
        expect(positionOf(ranked, "a:escalation")).toBeLessThan(positionOf(ranked, "f:file-read"))
      })

      test("#then the full order follows the offensive value ladder", () => {
        const ranked = rankForState(LINUX_STATE, [fileRead, recon, execution, evasion, credential, escalation])

        expect(idList(ranked)).toEqual([
          "a:escalation",
          "b:credential",
          "c:evasion",
          "d:execution",
          "e:recon",
          "f:file-read",
        ])
      })

      test("#then ties on tier break by id regardless of input order", () => {
        const later = primitive({ id: "z:later", actions: ["recon"] })
        const earlier = primitive({ id: "y:earlier", actions: ["file-read"] })

        expect(idList(rankForState(LINUX_STATE, [later, earlier]))).toEqual(["y:earlier", "z:later"])
        expect(idList(rankForState(LINUX_STATE, [earlier, later]))).toEqual(["y:earlier", "z:later"])
      })

      test("#then the returned values are the same primitive objects, not a wrapper type", () => {
        const ranked = rankForState(LINUX_STATE, [recon, escalation])

        expect(ranked[0]).toBe(escalation)
        expect(ranked[1]).toBe(recon)
      })
    })

    describe("#when the state platform does not match a primitive", () => {
      test("#then a windows uac-bypass primitive is excluded from a linux state", () => {
        const windowsBypass = primitive({
          id: "g:windows-bypass",
          actions: ["uac-bypass"],
          platform: ["windows"],
        })
        const linuxExecution = primitive({ id: "h:linux-execution", actions: ["execute"], platform: ["linux"] })

        const ranked = rankForState(LINUX_STATE, [windowsBypass, linuxExecution])

        expect(idList(ranked)).toEqual(["h:linux-execution"])
      })

      test("#then the same primitive is admitted for a windows state", () => {
        const windowsBypass = primitive({ id: "g:windows-bypass", actions: ["uac-bypass"], platform: ["windows"] })

        const ranked = rankForState({ ...LINUX_STATE, platform: "windows" }, [windowsBypass])

        expect(idList(ranked)).toEqual(["g:windows-bypass"])
      })

      test("#then the platform list itself is never rewritten", () => {
        const windowsBypass = primitive({ id: "g:windows-bypass", actions: ["uac-bypass"], platform: ["windows"] })

        rankForState(LINUX_STATE, [windowsBypass])

        expect(windowsBypass.platform).toEqual(["windows"])
      })
    })

    describe("#given commands that need sudo or suid", () => {
      const sudoOnly = primitive({ id: "i:sudo", commands: [command({ privileges: "sudo" })] })
      const suidOnly = primitive({ id: "j:suid", commands: [command({ privileges: "suid" })] })
      const unprivileged = primitive({ id: "k:unprivileged", commands: [command({ privileges: "unprivileged" })] })

      describe("#when the state privilege level varies", () => {
        test("#then a plain user sees only unprivileged commands", () => {
          expect(idList(rankForState({ ...LINUX_STATE, privilege: "user" }, [sudoOnly, suidOnly, unprivileged]))).toEqual([
            "k:unprivileged",
          ])
        })

        test("#then sudo admits sudo commands and suid admits suid commands", () => {
          expect(
            idList(rankForState({ ...LINUX_STATE, privilege: "sudo" }, [sudoOnly, suidOnly, unprivileged])),
          ).toEqual(["i:sudo", "k:unprivileged"])
          expect(
            idList(rankForState({ ...LINUX_STATE, privilege: "suid" }, [sudoOnly, suidOnly, unprivileged])),
          ).toEqual(["j:suid", "k:unprivileged"])
        })

        test("#then root admits every command", () => {
          expect(idList(rankForState({ ...LINUX_STATE, privilege: "root" }, [sudoOnly, suidOnly, unprivileged]))).toEqual([
            "i:sudo",
            "j:suid",
            "k:unprivileged",
          ])
        })
      })
    })

    describe("#given commands that need a tty or a shell", () => {
      const needsTty = primitive({
        id: "l:tty",
        commands: [command({ code: "target </dev/tty >/dev/tty" })],
      })
      const ttyVariant = primitive({
        id: "m:tty-variant",
        commands: [command({ variant: "tcp-server-tty" })],
      })
      const needsShell = primitive({
        id: "n:shell",
        commands: [command({ code: "target | tee /tmp/out" })],
      })
      const plain = primitive({ id: "o:plain", commands: [command({ code: "target --version" })] })

      describe("#when the state has a tty and a shell", () => {
        test("#then every primitive stays eligible", () => {
          expect(idList(rankForState(LINUX_STATE, [needsTty, ttyVariant, needsShell, plain]))).toEqual([
            "l:tty",
            "m:tty-variant",
            "n:shell",
            "o:plain",
          ])
        })
      })

      describe("#when the state has no tty", () => {
        test("#then tty-dependent primitives are dropped, including tty variants", () => {
          const ranked = rankForState({ ...LINUX_STATE, tty: false }, [needsTty, ttyVariant, needsShell, plain])

          expect(idList(ranked)).toEqual(["n:shell", "o:plain"])
        })
      })

      describe("#when the state has no shell", () => {
        test("#then primitives whose only commands need shell syntax are dropped", () => {
          const ranked = rankForState({ ...LINUX_STATE, hasShell: false }, [needsShell, plain])

          expect(idList(ranked)).toEqual(["o:plain"])
        })

        test("#then a command needing no shell syntax survives without a shell", () => {
          const ranked = rankForState({ ...LINUX_STATE, hasShell: false }, [ttyVariant, plain])

          expect(idList(ranked)).toEqual(["m:tty-variant", "o:plain"])
        })
      })
    })

    describe("#given the caller's input array", () => {
      const corpus = [primitive({ id: "p:one" }), primitive({ id: "q:two", platform: ["windows"] })]
      const snapshot = structuredClone(corpus)

      describe("#when rankForState runs against it", () => {
        test("#then the input array is not mutated", () => {
          rankForState(LINUX_STATE, corpus)

          expect(corpus).toEqual(snapshot)
          expect(idList(corpus)).toEqual(["p:one", "q:two"])
        })
      })
    })

    describe("#given a corpus of primitives with no actions", () => {
      const actionless = primitive({ id: "r:actionless", actions: [] })

      describe("#when ranked against real actions", () => {
        test("#then it sorts last but is still returned", () => {
          const execution = primitive({ id: "s:execution", actions: ["execute"] })

          expect(idList(rankForState(LINUX_STATE, [actionless, execution]))).toEqual(["s:execution", "r:actionless"])
        })
      })
    })
  })
})

describe("action coverage of the ranking ladder", () => {
  const EVERY_ACTION: readonly OffensiveAction[] = [
    "execute", "shell", "reverse-shell", "bind-shell", "file-read", "file-write", "upload", "download",
    "privilege-escalation", "credential-access", "defense-evasion", "persistence", "lateral-movement",
    "uac-bypass", "injection", "recon",
  ]

  describe("#given one primitive per offensive action", () => {
    const corpus = EVERY_ACTION.map((action) =>
      primitive({ id: `t:${action}`, actions: [action], binary: action, name: action, tags: [] }),
    )

    describe("#when the whole corpus is ranked for a linux state", () => {
      test("#then every action maps into the ladder without being dropped", () => {
        const ranked = rankForState(LINUX_STATE, corpus)

        expect(ranked.length).toBe(EVERY_ACTION.length)
        expect(new Set(idList(ranked)).size).toBe(EVERY_ACTION.length)
        expect(positionOf(ranked, "t:privilege-escalation")).toBeLessThan(positionOf(ranked, "t:recon"))
        expect(positionOf(ranked, "t:credential-access")).toBeLessThan(positionOf(ranked, "t:execute"))
        expect(positionOf(ranked, "t:defense-evasion")).toBeLessThan(positionOf(ranked, "t:file-read"))
      })
    })
  })
})
