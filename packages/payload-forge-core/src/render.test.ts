import { describe, expect, test } from "bun:test"
import { renderPayload } from "./render"
import type { PayloadTemplate, PayloadVariable } from "./types"

function templateWith(body: string, variables: readonly PayloadVariable[] = []): PayloadTemplate {
  return {
    id: "pat:command-injection:fixture",
    name: "Fixture",
    kind: "command-injection",
    category: "Command Injection",
    body,
    variables,
    source: "hopla_config.json",
    tags: ["command injection"],
  }
}

function variableWithDefault(name: string, defaultValue: string | null): PayloadVariable {
  return { name, description: "", defaultValue }
}

describe("renderPayload substitution", () => {
  describe("#given a token whose variable declares a default", () => {
    test("#when an override is supplied #then the override wins over the default", () => {
      const template = templateWith("ping \u00a7IP\u00a7", [variableWithDefault("IP", "127.0.0.1")])

      expect(renderPayload(template, { IP: "10.0.0.1" })).toEqual({ body: "ping 10.0.0.1", unresolved: [] })
    })

    test("#when the override is the empty string #then the caller's blank is honored", () => {
      const template = templateWith("ping \u00a7IP\u00a7", [variableWithDefault("IP", "127.0.0.1")])

      expect(renderPayload(template, { IP: "" })).toEqual({ body: "ping ", unresolved: [] })
    })

    test("#when no override is supplied #then the declared default is used", () => {
      const template = templateWith("http://\u00a7HOST\u00a7:\u00a7PORT\u00a7/shell.txt", [
        variableWithDefault("HOST", "10.0.0.1"),
        variableWithDefault("PORT", "8080"),
      ])

      expect(renderPayload(template)).toEqual({ body: "http://10.0.0.1:8080/shell.txt", unresolved: [] })
      expect(renderPayload(template, {})).toEqual({ body: "http://10.0.0.1:8080/shell.txt", unresolved: [] })
    })

    test("#when a variable mixes declared and absent names #then each name resolves by its own rule", () => {
      const template = templateWith("\u00a7HOST\u00a7\u00a7IP\u00a7", [
        variableWithDefault("HOST", "example.com"),
        variableWithDefault("IP", null),
      ])

      expect(renderPayload(template, { IP: "10.0.0.1" })).toEqual({ body: "example.com10.0.0.1", unresolved: [] })
    })
  })

  describe("#given a token with neither an override nor a default", () => {
    test("#when it is rendered #then the token survives verbatim and the name is reported", () => {
      const template = templateWith("ping \u00a7IP\u00a7", [variableWithDefault("IP", null)])

      const rendered = renderPayload(template, { PORT: "8080" })

      expect(rendered.unresolved).toEqual(["IP"])
      expect(rendered.body).toBe("ping \u00a7IP\u00a7")
      expect(rendered.body).toContain("\u00a7IP\u00a7")
    })

    test("#when the record omits the declared name entirely #then the default still resolves", () => {
      const template = templateWith("echo \u00a7TARGET\u00a7", [variableWithDefault("TARGET", "127.0.0.1")])
      const rendered = renderPayload(template, { OTHER: "x" })

      expect(rendered.body).toBe("echo 127.0.0.1")
      expect(rendered.unresolved).toEqual([])
    })

    test("#when an undeclared name appears in the body #then it is reported and left verbatim", () => {
      const template = templateWith("cat \u00a7UNDECLARED\u00a7")

      expect(renderPayload(template)).toEqual({ body: "cat \u00a7UNDECLARED\u00a7", unresolved: ["UNDECLARED"] })
    })

    test("#when the same missing token appears twice #then it is replaced nowhere and reported once", () => {
      const template = templateWith("\u00a7IP\u00a7/\u00a7IP\u00a7", [variableWithDefault("IP", null)])

      const rendered = renderPayload(template)

      expect(rendered.body).toBe("\u00a7IP\u00a7/\u00a7IP\u00a7")
      expect(rendered.unresolved).toEqual(["IP"])
    })

    test("#when several tokens are missing #then every name is reported in body order", () => {
      const template = templateWith("\u00a7B\u00a7 \u00a7A\u00a7 \u00a7B\u00a7 \u00a7C\u00a7")

      expect(renderPayload(template).unresolved).toEqual(["B", "A", "C"])
    })

    test("#when an inherited object member names the token #then it is not treated as a supplied value", () => {
      const template = templateWith("\u00a7constructor\u00a7")

      expect(renderPayload(template)).toEqual({ body: "\u00a7constructor\u00a7", unresolved: ["constructor"] })
    })

    test("#when a lone section sign carries no closing delimiter #then it is not a token", () => {
      const template = templateWith("50\u00a7 discount and \u00a7X\u00a7")

      expect(renderPayload(template)).toEqual({ body: "50\u00a7 discount and \u00a7X\u00a7", unresolved: ["X"] })
    })
  })

  describe("#given a value that itself contains the token convention", () => {
    test("#when the body is rendered #then the substituted value is never re-scanned", () => {
      const template = templateWith("[\u00a7A\u00a7]", [variableWithDefault("A", null), variableWithDefault("B", "DEFAULT-B")])

      const rendered = renderPayload(template, { A: "inner-\u00a7B\u00a7-tail" })

      expect(rendered.body).toBe("[inner-\u00a7B\u00a7-tail]")
      expect(rendered.unresolved).toEqual([])
    })

    test("#when a value supplies one token and injects another #then only the supplied name is resolved", () => {
      const template = templateWith("\u00a7A\u00a7", [variableWithDefault("A", null), variableWithDefault("B", "DEFAULT-B")])

      expect(renderPayload(template, { A: "\u00a7B\u00a7" })).toEqual({ body: "\u00a7B\u00a7", unresolved: [] })
    })

    test("#when a value injects a token this render has already left unresolved #then the body keeps it once", () => {
      const template = templateWith("\u00a7A\u00a7/\u00a7C\u00a7", [variableWithDefault("A", null), variableWithDefault("C", null)])

      expect(renderPayload(template, { A: "\u00a7C\u00a7" })).toEqual({ body: "\u00a7C\u00a7/\u00a7C\u00a7", unresolved: ["C"] })
    })
  })

  describe("#given token names that differ only in case", () => {
    test("#when both are rendered #then each resolves against its own exact name", () => {
      const template = templateWith("\u00a7Host\u00a7 \u00a7HOST\u00a7 \u00a7host\u00a7", [variableWithDefault("host", "lower")])

      const rendered = renderPayload(template, { HOST: "UPPER" })

      expect(rendered.body).toBe("\u00a7Host\u00a7 UPPER lower")
      expect(rendered.unresolved).toEqual(["Host"])
    })
  })

  describe("#given a body that carries no token at all", () => {
    test("#when it is rendered #then it passes through unchanged with nothing unresolved", () => {
      const body = "IFS=,;`cat<<<uname,-a`"
      const template = templateWith(body, [variableWithDefault("IP", "127.0.0.1")])

      const rendered = renderPayload(template, { IP: "10.0.0.1" })

      expect(rendered.body).toBe(body)
      expect(rendered.unresolved).toEqual([])
    })

    test("#when the body is empty #then the result is empty", () => {
      expect(renderPayload(templateWith(""))).toEqual({ body: "", unresolved: [] })
    })
  })

  describe("#given the same template rendered repeatedly", () => {
    test("#when it is rendered twice #then both results are identical", () => {
      const template = templateWith("\u00a7A\u00a7-\u00a7B\u00a7", [variableWithDefault("B", null)])

      const first = renderPayload(template, { A: "a" })
      const second = renderPayload(template, { A: "a" })

      expect(first).toEqual(second)
    })

    test("#when a render completes #then neither the template nor the values record is mutated", () => {
      const variables: readonly PayloadVariable[] = [variableWithDefault("A", "default-value")]
      const template = templateWith("x\u00a7A\u00a7y", variables)
      const values: Record<string, string> = { A: "override" }

      renderPayload(template, values)

      expect(template.body).toBe("x\u00a7A\u00a7y")
      expect(template.variables).toEqual([{ name: "A", description: "", defaultValue: "default-value" }])
      expect(values).toEqual({ A: "override" })
    })
  })
})
