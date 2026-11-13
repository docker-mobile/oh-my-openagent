import { describe, expect, test } from "bun:test"

import { buildDispatch, isRunnable, preflightPlan, resolveCommand, resolveTemplate } from "./resolve"
import type { AtomicDependency, AtomicExecutor, AtomicTest, InputArgument } from "./types"

const DEFAULT_IMAGE = "PathToAtomicsFolder/T1001.002/bin/T1001.002.jpg"
const DEFAULT_DUMP = "C:\\Windows\\Temp\\lsass_dump.dmp"

function argument(type: string, defaultValue: string | null): InputArgument {
  return { description: `${type} input`, type, default: defaultValue }
}

function executor(name: AtomicExecutor["name"], command: string): AtomicExecutor {
  return { name, command, cleanupCommand: null, elevationRequired: false, steps: [] }
}

function dependency(prereqCommand: string, getPrereqCommand: string | null): AtomicDependency {
  return { description: "prereq", prereqCommand, getPrereqCommand, executor: "powershell" }
}

function dispatchFor(name: AtomicExecutor["name"], command: string) {
  const test_ = atomic({ executor: executor(name, command) })
  return buildDispatch(test_, resolveCommand(test_))
}

function atomic(overrides: Partial<AtomicTest> = {}): AtomicTest {
  return {
    technique: "T1003.001",
    displayName: "OS Credential Dumping: LSASS Memory",
    index: 0,
    guid: "0be2230c-9ab3-4ac2-8826-3199b9a0ebf8",
    name: "fixture",
    description: "fixture atomic",
    platforms: ["windows"],
    arguments: {},
    dependencies: [],
    executor: executor("command", ""),
    manual: false,
    ...overrides,
  }
}

describe("resolveCommand", () => {
  describe("#given an argument with a default and a caller override", () => {
    describe("#when the command is resolved", () => {
      test("#then the override beats the default", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE) },
          executor: executor("sh", "strings #{image_file}"),
        })

        const resolved = resolveCommand(test_, { image_file: "/tmp/override.jpg" })

        expect(resolved.command).toBe("strings /tmp/override.jpg")
        expect(resolved.command).not.toContain(DEFAULT_IMAGE)
        expect(resolved.unresolved).toEqual([])
      })

      test("#then an override for an argument the command never names changes nothing", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE), unused: argument("string", "x") },
          executor: executor("sh", "strings #{image_file}"),
        })

        expect(resolveCommand(test_, { unused: "y" }).command).toBe(`strings ${DEFAULT_IMAGE}`)
      })
    })

    describe("#when no override is supplied", () => {
      test("#then the declared default is substituted", () => {
        const test_ = atomic({
          arguments: { procdump_exe: argument("path", DEFAULT_DUMP) },
          executor: executor("command", `"#{procdump_exe}" -accepteula -ma lsass.exe`),
        })

        const resolved = resolveCommand(test_)

        expect(resolved.command).toBe(`"${DEFAULT_DUMP}" -accepteula -ma lsass.exe`)
        expect(resolved.unresolved).toEqual([])
      })

      test("#then a null default is reported unresolved and left in place", () => {
        const test_ = atomic({
          arguments: { target_host: argument("string", null) },
          executor: executor("bash", "nmap -sV #{target_host} -p 445"),
        })

        const resolved = resolveCommand(test_)

        expect(resolved.command).toBe("nmap -sV #{target_host} -p 445")
        expect(resolved.unresolved).toEqual(["target_host"])
      })

      test("#then a token that is not a declared argument survives verbatim and is not reported", () => {
        const test_ = atomic({
          arguments: { payload: argument("string", "") },
          executor: executor("bash", "printf '%s' '#{not_a_declared_argument}' #{payload}"),
        })

        const resolved = resolveCommand(test_)

        expect(resolved.command).toContain("'#{not_a_declared_argument}'")
        expect(resolved.command).not.toContain("#{payload}")
        expect(resolved.unresolved).toEqual([])
      })

      test("#then a non-identifier payload token mixed with a real placeholder keeps both roles", () => {
        const test_ = atomic({
          arguments: { role_name: argument("string", "reader") },
          executor: executor("bash", "gcloud iam roles describe #{role_name} --format='#{project-id}'"),
        })

        const resolved = resolveCommand(test_)

        expect(resolved.command).toBe("gcloud iam roles describe reader --format='#{project-id}'")
        expect(resolved.unresolved).toEqual([])
      })

      test("#then one unresolved key is reported once even when it repeats", () => {
        const test_ = atomic({
          arguments: { host: argument("string", null) },
          executor: executor("bash", "ping #{host}; ssh #{host}"),
        })

        expect(resolveCommand(test_).unresolved).toEqual(["host"])
      })
    })

    describe("#when a default value itself contains a placeholder token", () => {
      test("#then the substituted text is not rescanned", () => {
        const test_ = atomic({
          arguments: {
            outer: argument("string", "prefix #{inner} suffix"),
            inner: argument("string", "INNER_VALUE"),
          },
          executor: executor("python", "run(#{outer})"),
        })

        const resolved = resolveCommand(test_)

        expect(resolved.command).toBe("run(prefix #{inner} suffix)")
        expect(resolved.command).not.toContain("INNER_VALUE")
        expect(resolved.unresolved).toEqual([])
      })

      test("#then the same non-rescan holds through the template primitive", () => {
        const arguments_ = { a: argument("string", "#{b}"), b: argument("string", "B") }

        expect(resolveTemplate("#{a}", arguments_, {}).text).toBe("#{b}")
        expect(resolveTemplate("#{b}", arguments_, {}).text).toBe("B")
      })
    })

    describe("#when the executor type is read back", () => {
      test("#then it is reported unchanged for every executor type", () => {
        for (const name of ["command", "sh", "bash", "powershell", "pwsh", "python", "manual"] as const) {
          expect(resolveCommand(atomic({ executor: executor(name, "true") })).executor).toBe(name)
        }
      })
    })
  })
})

describe("isRunnable", () => {
  describe("#given a manual test", () => {
    describe("#when runnability is asked", () => {
      test("#then it is never runnable, even with a command present", () => {
        const withCommand = atomic({ manual: true, executor: executor("manual", "echo hi") })
        const withoutCommand = atomic({ manual: true, executor: executor("manual", "") })

        expect(isRunnable(withCommand)).toBe(false)
        expect(isRunnable(withoutCommand)).toBe(false)
      })
    })
  })

  describe("#given a non-manual test whose command is empty after resolution", () => {
    describe("#when runnability is asked", () => {
      test("#then it is not runnable", () => {
        expect(isRunnable(atomic({ executor: executor("sh", "") }))).toBe(false)
        expect(isRunnable(atomic({ executor: executor("sh", "   \n\t ") }))).toBe(false)
      })

      test("#then a command that only holds an unresolved token still counts as present", () => {
        const test_ = atomic({
          arguments: { host: argument("string", null) },
          executor: executor("sh", "#{host}"),
        })

        expect(isRunnable(test_)).toBe(true)
        expect(resolveCommand(test_).command).toBe("#{host}")
      })
    })
  })

  describe("#given a non-manual test with a real command", () => {
    describe("#when runnability is asked", () => {
      test("#then it is runnable", () => {
        expect(isRunnable(atomic({ executor: executor("bash", "id") }))).toBe(true)
      })
    })
  })
})

describe("buildDispatch", () => {
  describe("#given every spawnable executor type", () => {
    describe("#when a dispatch is built", () => {
      test("#then sh and bash take -c", () => {
        expect(dispatchFor("sh", "strings #{image}")).toEqual({ binary: "/bin/sh", args: ["-c", "strings #{image}"] })
        expect(dispatchFor("bash", "strings #{image}")).toEqual({ binary: "/bin/bash", args: ["-c", "strings #{image}"] })
      })

      test("#then powershell and pwsh take -Command", () => {
        expect(dispatchFor("powershell", "Get-Process lsass")).toEqual({ binary: "pwsh", args: ["-Command", "Get-Process lsass"] })
        expect(dispatchFor("pwsh", "Get-Process lsass")).toEqual({ binary: "pwsh", args: ["-Command", "Get-Process lsass"] })
      })

      test("#then python takes -c with python3", () => {
        expect(dispatchFor("python", "print('lsass')")).toEqual({ binary: "python3", args: ["-c", "print('lsass')"] })
      })

      test("#then command takes -c with the platform shell", () => {
        const test_ = atomic({ executor: executor("command", "whoami") })
        const dispatch = buildDispatch(test_, resolveCommand(test_))

        expect(dispatch?.binary).toBe(process.platform === "win32" ? "cmd.exe" : "/bin/sh")
        expect(dispatch?.args).toEqual(["-c", "whoami"])
      })

      test("#then the resolved command travels into the args, not the raw template", () => {
        const test_ = atomic({
          arguments: { remote_script: argument("url", "https://example.test/m.ps1") },
          executor: executor("powershell", "IEX #{remote_script}"),
        })
        const dispatch = buildDispatch(test_, resolveCommand(test_))

        expect(dispatch).toEqual({ binary: "pwsh", args: ["-Command", "IEX https://example.test/m.ps1"] })
      })
    })
  })

  describe("#given a manual executor", () => {
    describe("#when a dispatch is built", () => {
      test("#then the binary is null because nothing is ever spawned", () => {
        const test_ = atomic({ manual: true, executor: executor("manual", "") })

        expect(buildDispatch(test_, resolveCommand(test_))).toBeNull()
      })
    })
  })
})

describe("preflightPlan", () => {
  describe("#given a test whose dependencies carry placeholders", () => {
    describe("#when the plan is built", () => {
      test("#then each dependency reports the resolved prereq and get_prereq commands", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE) },
          dependencies: [
            dependency("test -f \"#{image_file}\"", "curl -o \"#{image_file}\" https://example.test/i.jpg"),
            dependency("test -f /tmp/other", "touch /tmp/other"),
          ],
        })

        const plan = preflightPlan(test_)

        expect(plan.length).toBe(2)
        expect(plan[0]?.prereqCommand).toBe(`test -f "${DEFAULT_IMAGE}"`)
        expect(plan[0]?.getPrereqCommand).toBe(`curl -o "${DEFAULT_IMAGE}" https://example.test/i.jpg`)
        expect(plan[0]?.executor).toBe("powershell")
        expect(plan[1]?.prereqCommand).toBe("test -f /tmp/other")
        expect(plan[1]?.getPrereqCommand).toBe("touch /tmp/other")
        expect(plan[0]?.unresolved).toEqual([])
      })

      test("#then overrides reach the dependency commands too", () => {
        const test_ = atomic({
          arguments: { procdump_exe: argument("path", DEFAULT_DUMP) },
          dependencies: [
            dependency("Test-Path \"#{procdump_exe}\"", "Invoke-WebRequest -OutFile \"#{procdump_exe}\""),
          ],
        })

        const plan = preflightPlan(test_, { procdump_exe: "C:\\tools\\procdump.exe" })

        expect(plan[0]?.prereqCommand).toBe('Test-Path "C:\\tools\\procdump.exe"')
        expect(plan[0]?.getPrereqCommand).toBe('Invoke-WebRequest -OutFile "C:\\tools\\procdump.exe"')
      })

      test("#then a dependency with no get_prereq command reports null rather than an empty string", () => {
        const test_ = atomic({ dependencies: [dependency("test -f /tmp/x", null)] })

        expect(preflightPlan(test_)[0]?.getPrereqCommand).toBeNull()
      })

      test("#then unresolved keys from both commands are merged once", () => {
        const test_ = atomic({
          arguments: { a: argument("string", null), b: argument("string", null) },
          dependencies: [dependency("run #{a}", "fix #{b} #{a}")],
        })

        expect(preflightPlan(test_)[0]?.unresolved).toEqual(["a", "b"])
      })

      test("#then a test with no dependencies yields an empty plan", () => {
        expect(preflightPlan(atomic())).toEqual([])
      })
    })
  })
})

describe("purity", () => {
  describe("#given a loaded atomic test", () => {
    describe("#when every function in the module runs", () => {
      test("#then the input test is not mutated", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE) },
          dependencies: [dependency("test -f \"#{image_file}\"", "curl -o \"#{image_file}\" https://example.test/i.jpg")],
          executor: executor("sh", "strings #{image_file}"),
        })
        const before = structuredClone(test_)

        resolveCommand(test_, { image_file: "/tmp/other.jpg" })
        isRunnable(test_)
        buildDispatch(test_, resolveCommand(test_))
        preflightPlan(test_, { image_file: "/tmp/other.jpg" })

        expect(test_).toEqual(before)
      })

      test("#then the overrides map is not mutated", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE), extra: argument("string", null) },
          executor: executor("sh", "strings #{image_file} #{extra}"),
        })
        const overrides = { image_file: "/tmp/other.jpg" }
        const before = structuredClone(overrides)

        resolveCommand(test_, overrides)
        preflightPlan(test_, overrides)

        expect(overrides).toEqual(before)
      })
    })

    describe("#when the same call is made twice", () => {
      test("#then the result is deeply equal", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE) },
          dependencies: [dependency("test -f \"#{image_file}\"", null)],
          executor: executor("bash", "strings #{image_file}"),
        })

        expect(resolveCommand(test_)).toEqual(resolveCommand(test_))
        expect(preflightPlan(test_)).toEqual(preflightPlan(test_))
        expect(buildDispatch(test_, resolveCommand(test_))).toEqual(buildDispatch(test_, resolveCommand(test_)))
      })

      test("#then the returned collections are fresh per call", () => {
        const test_ = atomic({
          arguments: { image_file: argument("path", DEFAULT_IMAGE) },
          executor: executor("bash", "strings #{image_file}"),
        })

        expect(resolveCommand(test_).unresolved).not.toBe(resolveCommand(test_).unresolved)
        expect(preflightPlan(test_)).not.toBe(preflightPlan(test_))
        expect(buildDispatch(test_, resolveCommand(test_))?.args).not.toBe(
          buildDispatch(test_, resolveCommand(test_))?.args,
        )
      })
    })
  })
})
