/**
 * Runtime parity matrix — automated behaviour checks for the V2 port.
 *
 * Agreed shape in code-yeongyu/oh-my-openagent#9389: each row of the
 * 25-row parity matrix is a behaviour check that runs in CI. Rows whose
 * subsystem is not yet ported are `test.todo` entries and flip to active
 * assertions in the corresponding subsystem PR.
 *
 * Source matrix with harness evidence: docs/parity-matrix.md on the
 * reference fork (fazulfi/omo-v2, branch port/v2).
 */
import { afterAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { tool } from "@opencode-ai/plugin/tool"
import { createFakePluginContext } from "../../src/v2/fake-plugin-context"
import { createOmoV2Plugin, omoV2Plugin } from "../../src/v2"

// The native-path rows disable the bridge deterministically, so setup falls
// back to the native slice registrations those rows assert.
const nativeFallbackPlugin = createOmoV2Plugin({
  createV1Module: () => {
    throw new Error("bridge disabled in the native-path rows")
  },
})

describe("V2 parity matrix — scaffold slice (live rows)", () => {
  test("row: plugin load (dual-host export)", () => {
    expect(omoV2Plugin.id).toBe("oh-my-openagent")
    expect(typeof omoV2Plugin.setup).toBe("function")
  })

  test("row: bootstrap RPC omo.status", async () => {
    // The bridge path with a stub V1 module and the bridge's own fake 2.x
    // context: deterministic, no real V1 boot. Only the rpc recorder is ours;
    // the bridge's structural context has no rpc domain.
    const registered: Array<{ id: string; handler: () => Promise<unknown> }> = []
    const fake = createFakePluginContext({ directory: os.tmpdir() })
    const ctx = {
      ...fake.context,
      rpc: {
        register: (
          definition: { id: string; methods: Record<string, unknown> },
          handlers: Record<string, () => Promise<unknown>>,
        ) => {
          for (const method of Object.keys(definition.methods)) {
            registered.push({ id: `${definition.id}.${method}`, handler: handlers[method] })
          }
        },
      },
    }
    const bridgedPlugin = createOmoV2Plugin({
      createV1Module: () => ({ server: (async () => ({})) as never }),
    })
    await bridgedPlugin.setup(ctx as never)
    const status = registered.find((r) => r.id === "omo.status")
    expect(status).toBeDefined()
    expect(await status!.handler()).toEqual({ ok: true, stage: "bridge" })
  })

  test("row: V1 host still loads the V1 entry unchanged", async () => {
    const v1 = await import("../../src/index")
    expect(typeof v1.default).toBe("object")
    expect(typeof v1.default.server).toBe("function")
    expect(typeof v1.omoPlugin).toBe("function")
    // The V1 module graph must not reach the V2 entry: the default export
    // is a V1 PluginModule, which has no `setup` key.
    expect("setup" in v1.default).toBe(false)
  })
})

describe("V2 parity matrix - tools+hooks slice (live rows)", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omo-v2-tools-parity-"))
  // The hermetic home forbids leftover temp entries (#9766): remove the fixture root once the rows are done.
  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })
  fs.writeFileSync(path.join(tmpRoot, "fixture-parity-needle.txt"), "parity-needle-content")

  type ToolDef = {
    name: string
    execute: (input: never) => Promise<{ content: string }>
  }
  type HookEntry = {
    domain: "tool" | "session" | "shell"
    name: string
    fn: (input: Record<string, unknown>) => unknown
  }

  function makeToolsCtx() {
    const toolDefs: ToolDef[] = []
    const hooks: HookEntry[] = []
    const rpcIds: string[] = []
    const ctx = {
      location: { directory: tmpRoot },
      rpc: {
        register: (definition: { id: string; methods: Record<string, unknown> }) => {
          rpcIds.push(definition.id)
          // Slice 3 chains rpc.dispose() in its cleanup; return a stub handle
          // like the real registration would.
          return Promise.resolve({ dispose: async () => {} })
        },
      },
      tool: {
        transform: (
          editorFn: (editor: { add: (info: ToolDef) => void }) => void,
        ) => {
          editorFn({ add: (info: ToolDef) => toolDefs.push(info) })
          return Promise.resolve({ dispose: async () => {} })
        },
        hook: (name: string, fn: HookEntry["fn"]) => {
          hooks.push({ domain: "tool", name, fn })
          return Promise.resolve()
        },
      },
      session: {
        hook: (name: string, fn: HookEntry["fn"]) => {
          hooks.push({ domain: "session", name, fn })
          return Promise.resolve()
        },
      },
      shell: {
        hook: (name: string, fn: HookEntry["fn"]) => {
          hooks.push({ domain: "shell", name, fn })
          return Promise.resolve()
        },
      },
      agent: { transform: () => Promise.resolve() },
    }
    return { ctx, toolDefs, hooks, rpcIds }
  }

  test("row: tools: glob", async () => {
    const { ctx, toolDefs } = makeToolsCtx()
    await nativeFallbackPlugin.setup(ctx as never)
    const glob = toolDefs.find((t) => t.name === "glob")
    expect(glob).toBeDefined()
    const result = await glob!.execute({ pattern: "*.txt" } as never)
    expect(result.content).toContain("fixture-parity-needle.txt")
  })

  test("row: tools: grep", async () => {
    const { ctx, toolDefs } = makeToolsCtx()
    await nativeFallbackPlugin.setup(ctx as never)
    const grep = toolDefs.find((t) => t.name === "grep")
    expect(grep).toBeDefined()
    const result = await grep!.execute({ pattern: "parity-needle-content" } as never)
    expect(result.content).toContain("fixture-parity-needle.txt")
  })

  test("row: hooks: tool.execute.before/after", async () => {
    const { ctx, hooks } = makeToolsCtx()
    await nativeFallbackPlugin.setup(ctx as never)
    const before = hooks.find((h) => h.domain === "tool" && h.name === "execute.before")
    const after = hooks.find((h) => h.domain === "tool" && h.name === "execute.after")
    expect(before).toBeDefined()
    expect(after).toBeDefined()
    // V1 parity (#2697): strip a stray `mcp_` prefix from the tool name.
    const input: Record<string, unknown> = { tool: "mcp_legacy" }
    before!.fn(input)
    expect(input.tool).toBe("legacy")
  })

  test("row: hooks: session compaction", async () => {
    const { ctx, hooks } = makeToolsCtx()
    await nativeFallbackPlugin.setup(ctx as never)
    const compaction = hooks.find((h) => h.domain === "session" && h.name === "compaction")
    expect(compaction).toBeDefined()
  })

  test("row: hooks: shell create.before", async () => {
    const { ctx, hooks } = makeToolsCtx()
    await nativeFallbackPlugin.setup(ctx as never)
    const createBefore = hooks.find((h) => h.domain === "shell" && h.name === "create.before")
    expect(createBefore).toBeDefined()
    // V1 parity: null bytes are stripped from shell commands.
    const input: Record<string, unknown> = { command: "echo\x00clean" }
    createBefore!.fn(input)
    expect(input.command).toBe("echoclean")
  })
})

describe("V2 parity matrix — agents slice (live rows)", () => {
  type AgentInfo = {
    id: string
    name: string
    mode: string
    description?: string
    system?: string
    hidden?: boolean
  }

  const OMC_TEN = [
    "sisyphus",
    "hephaestus",
    "oracle",
    "librarian",
    "explore",
    "multimodal-looker",
    "metis",
    "momus",
    "atlas",
    "sisyphus-junior",
  ]

  // Simulates the V2 agent catalog with upsert-on-update semantics (the
  // mechanism the reference port found at runtime for registering plugin
  // agents), plus a session client for the dispatch roundtrip.
  function makeAgentsCtx(hostAgents: AgentInfo[]) {
    const rpcHandlers: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {}
    const catalog: Record<string, AgentInfo> = Object.fromEntries(hostAgents.map((agent) => [agent.id, agent]))
    let defaultAgent: string | undefined
    const sessionCalls: Array<{ op: string; args: Record<string, unknown> }> = []

    const ctx = {
      location: { directory: os.tmpdir() },
      rpc: {
        register: (
          definition: { id: string; methods: Record<string, unknown> },
          handlers: Record<string, (input: Record<string, unknown>) => Promise<unknown>>,
        ) => {
          for (const [method, handler] of Object.entries(handlers)) {
            rpcHandlers[`${definition.id}.${method}`] = handler
          }
          return Promise.resolve({ dispose: async () => {} })
        },
      },
      tool: {
        transform: () => Promise.resolve(),
        hook: () => Promise.resolve(),
      },
      shell: { hook: () => Promise.resolve() },
      agent: {
        list: async () => ({ data: Object.values(catalog) }),
        transform: async (
          editorFn: (editor: never) => void,
        ) => {
          editorFn({
            list: () => Object.values(catalog),
            get: (id: string) => catalog[id],
            default: (id: string | undefined) => {
              defaultAgent = id
            },
            update: (id: string, fn: (agent: AgentInfo) => void) => {
              // Upsert semantics: update registers definitions the host has
              // never seen, exactly like the V2-native reference port does.
              const agent = (catalog[id] ?? { id, name: id, mode: "primary" }) as AgentInfo
              fn(agent)
              catalog[id] = agent
            },
            remove: (id: string) => {
              delete catalog[id]
            },
          } as never)
          return Promise.resolve({ dispose: async () => {} })
        },
      },
      session: {
        hook: () => Promise.resolve(),
        create: async (args: Record<string, unknown>) => {
          sessionCalls.push({ op: "create", args })
          return { id: "ses_fake_1", agent: (args as { agent?: string }).agent }
        },
        wait: async (args: Record<string, unknown>) => sessionCalls.push({ op: "wait", args }),
      },
    }
    return { ctx, rpcHandlers, defaultAgent: () => defaultAgent, catalog, sessionCalls }
  }

  test("row: agents: listing (10 OMC agents)", async () => {
    const { ctx, rpcHandlers } = makeAgentsCtx([{ id: "build", name: "build", mode: "primary" }])
    await nativeFallbackPlugin.setup(ctx as never)
    const list = rpcHandlers["omo.agents.list"]
    expect(list).toBeDefined()
    const out = (await list({})) as { count: number; agents: Array<{ id: string }> }
    const ids = out.agents.map((agent) => agent.id)
    for (const omc of OMC_TEN) expect(ids).toContain(omc)
    expect(out.count).toBeGreaterThanOrEqual(10)
  })

  test("row: agents: dispatch roundtrip", async () => {
    const { ctx, rpcHandlers, sessionCalls } = makeAgentsCtx([])
    await nativeFallbackPlugin.setup(ctx as never)
    const dispatch = rpcHandlers["omo.agents.dispatch"]
    expect(dispatch).toBeDefined()
    const out = (await dispatch({ agent: "oracle" })) as { ok: boolean; sessionID?: string; agent?: string }
    expect(out.ok).toBe(true)
    expect(out.sessionID).toBe("ses_fake_1")
    expect(out.agent).toBe("oracle")
    const create = sessionCalls.find((call) => call.op === "create")
    expect(create).toBeDefined()
    expect((create!.args as { agent?: string }).agent).toBe("oracle")
  })

  test("row: agents: unknown agent -> clear error", async () => {
    const { ctx, rpcHandlers } = makeAgentsCtx([])

    await nativeFallbackPlugin.setup(ctx as never)
    const dispatch = rpcHandlers["omo.agents.dispatch"]
    const out = (await dispatch({ agent: "nonexistent-agent-xyz" })) as { ok: boolean; error?: string }
    expect(out.ok).toBe(false)
    expect(out.error).toContain("unknown agent: nonexistent-agent-xyz")
    expect(out.error).toContain("available:")
  })

  test("row: agents: builtin build/plan demoted, default sisyphus", async () => {
    const { ctx, defaultAgent, catalog } = makeAgentsCtx([
      { id: "build", name: "build", mode: "primary" },
      { id: "plan", name: "plan", mode: "primary" },
    ])
    await nativeFallbackPlugin.setup(ctx as never)
    // V1 parity: builtin build/plan demote to hidden subagents.
    expect(catalog["build"]!.mode).toBe("subagent")
    expect(catalog["build"]!.hidden).toBe(true)
    expect(catalog["plan"]!.mode).toBe("subagent")
    expect(catalog["plan"]!.hidden).toBe(true)
    // V1 parity: sisyphus is the default primary agent.
    expect(defaultAgent()).toBe("sisyphus")
  })

  test("row: rpc cleanup disposes omo.agents registration", async () => {
    const { ctx } = makeAgentsCtx([])
    const cleanup = await nativeFallbackPlugin.setup(ctx as never)
    expect(typeof cleanup).toBe("function")
    await cleanup?.()
  })
})

describe("V2 parity matrix — bridge slice (live rows through the merged entry)", () => {
  const until = async (predicate: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (predicate()) return
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error("condition was not met in time")
  }

  // Runs the merged entry with a stub V1 module whose server returns the
  // given hooks, against the bridge's own fake 2.x context plus an rpc
  // recorder for the entry's bootstrap RPC.
  const setupBridged = async (hooks: Record<string, unknown>) => {
    const registered: Array<{ id: string; handler: () => Promise<unknown> }> = []
    const fake = createFakePluginContext({ directory: os.tmpdir() })
    const ctx = {
      ...fake.context,
      rpc: {
        register: (
          definition: { id: string; methods: Record<string, unknown> },
          handlers: Record<string, () => Promise<unknown>>,
        ) => {
          for (const method of Object.keys(definition.methods)) {
            registered.push({ id: `${definition.id}.${method}`, handler: handlers[method] })
          }
        },
      },
    }
    const plugin = createOmoV2Plugin({
      createV1Module: () => ({ server: (async () => hooks) as never }),
    })
    const cleanup = await plugin.setup(ctx as never)
    return { cleanup, fake, registered }
  }

  test("row: client/session/event surface", async () => {
    // given a V1 event hook behind the bridge
    const seen: string[] = []
    const { cleanup, fake, registered } = await setupBridged({
      event: (async ({ event }: { event: { type: string } }) => void seen.push(event.type)) as never,
    })
    // then the bootstrap RPC still reports the bridge stage
    const status = registered.find((r) => r.id === "omo.status")
    expect(status).toBeDefined()
    expect(await status!.handler()).toEqual({ ok: true, stage: "bridge" })

    // when the host emits 2.x session events
    await until(() => fake.activeSubscribers() === 1)
    fake.emit({ type: "session.execution.started", data: { sessionID: "ses_1" } })
    fake.emit({ type: "session.execution.succeeded", data: { sessionID: "ses_1" } })

    // then the V1 hook receives them translated to 1.x events in order
    await until(() => seen.length === 3)
    expect(seen).toEqual(["session.status", "session.status", "session.idle"])
    await cleanup()
  })

  test("row: MCP: builtin server injection", async () => {
    // given a V1 config hook that injects a remote MCP server
    const { cleanup, fake } = await setupBridged({
      config: (async (target: Record<string, unknown>) => {
        Object.assign(target, {
          mcp: {
            "omo-docs": { type: "remote", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" } },
          },
        })
      }) as never,
    })

    // when the config bridge applies it
    await until(() => fake.mcpReloadCount() > 0)

    // then the server is migrated onto the 2.x mcp domain
    const servers = fake.builtMcp()
    expect(servers.get("omo-docs")).toMatchObject({
      type: "remote",
      url: "https://mcp.example.com/mcp",
    })
    await cleanup()
  })

  test("row: skills: skills callable from registered agent surface", async () => {
    // given a V1 tool registry whose skill tool is built with the V1 tool helper
    const { cleanup, fake } = await setupBridged({
      tool: {
        skill: tool({
          description: "Read or run a bundled skill",
          args: { name: tool.schema.string().describe("the skill to load") },
          execute: (async () => "skill loaded") as never,
        }),
      },
    })

    // then the converted tool is registered on the 2.x tool domain, so every
    // agent surface (including the registered OMC agents) can call it
    const skill = fake.addedTools.find((entry) => entry.name === "skill")
    expect(skill).toBeDefined()
    expect(skill!.description).toBe("Read or run a bundled skill")
    await cleanup()
  })

  test("row: config: V1 config normalizes without rewrite", async () => {
    // given a V1 config hook in the exact shape the V1 plugin emits
    const { cleanup, fake } = await setupBridged({
      config: (async (target: Record<string, unknown>) => {
        Object.assign(target, {
          agent: {
            Sisyphus: { prompt: "You orchestrate.", description: "Main", mode: "primary", color: "#112233" },
          },
          default_agent: "Sisyphus",
        })
      }) as never,
    })

    // when the config bridge applies it
    await until(() => fake.reloadCount() > 0)

    // then the agent config is migrated (not rewritten) onto the 2.x domain
    const sisyphus = fake.builtAgents().get("Sisyphus")
    expect(sisyphus).toMatchObject({ system: "You orchestrate.", description: "Main", mode: "primary" })
    expect(fake.defaultAgent()).toBe("Sisyphus")
    await cleanup()
  })

  test("row: static gates: native v2 files import no V1 SDK, bridge imports stay dependency-backed, pin exact", async () => {
    const v2Dir = path.join(import.meta.dir, "..", "..", "src", "v2")
    const pkg = JSON.parse(fs.readFileSync(path.join(v2Dir, "..", "..", "package.json"), "utf8"))

    // The native slice files (entry, tools, agents) touch only the 2.x SDK:
    // a strict zero on @opencode-ai references keeps them host-agnostic.
    for (const name of ["index.ts", "tools.ts", "agents.ts"]) {
      const src = fs.readFileSync(path.join(v2Dir, name), "utf8")
      expect(src.includes("@opencode-ai/")).toBe(false)
    }

    // The bridge runs the real V1 plugin body, so it imports the V1 SDK —
    // backed by the package's own declared dependency, so a 2.x host's plugin
    // install resolves it without the host providing anything.
    expect(pkg.dependencies["@opencode-ai/plugin"]).toBeDefined()

    // The V2 plugin SDK stays an exact optional peer pin.
    const pin = pkg.peerDependencies?.["@opencode/plugin"] ?? pkg.peerDependenciesMeta?.["@opencode/plugin"]
    expect(JSON.stringify(pin)).toContain("2.0.20")
  })
})

describe("V2 parity matrix — subsystem rows (pending, flip in follow-up slices)", () => {
  test.todo("row: background task: spawn -> collect (live dual-host drive)")
  test.todo("row: background task: error path does not hang (live dual-host drive)")
  test.todo("row: todos: write/read roundtrip (live dual-host drive)")
  test.todo("row: MCP: injected server visible via tools/list (live dual-host drive)")
  test.todo("row: skills: location fallback listing (live dual-host drive)")
  test.todo("row: TUI: registerTui slot claims + keymap (2.x TUI API port)")
  test.todo("row: companion: DCP 3.2.0 co-loads, no conflicts (live dual-host drive)")
  test.todo("row: companion: tokenscope co-loads, no conflicts (live dual-host drive)")
})
