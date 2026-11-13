/**
 * Payload classifier: a total, documented heuristic from a raw payload string onto
 * PayloadKind. It recognizes signals rather than parsing a grammar, so it never
 * throws and always answers: an unrecognized string falls through to "wordlist" when
 * it looks like a bare wordlist entry and to "other" otherwise, never a guess.
 *
 * PRECEDENCE, most specific signal first. Every rule below is consulted in this
 * order and the first match wins, so an ambiguous payload lands on the more specific
 * kind. The tie-breaks that a reader is most likely to question:
 *   1. xxe          an XML DOCTYPE/ENTITY declaration is an explicit document type,
 *                   so it outranks the lfi path such a body usually also contains.
 *   2. ldap         an LDAP/JNDI filter or scheme outranks the ssti delimiter, since
 *                   `${jndi:ldap://x}` carries a named protocol, not an expression.
 *   3. ssti         a template delimiter pair around an expression.
 *   4. graphql      an operation keyword bound to a selection set, or __schema/__typename.
 *   5. nosql        a Mongo operator name ($ne, $where) is a stronger signal than the
 *                   SQL keyword shapes it resembles.
 *   6. sqli         SQL keyword, function or tautology shapes.
 *   7. csv-injection a spreadsheet formula at the START of a line, so `=cmd|...` is a
 *                   formula rather than the shell pipe it also looks like.
 *   8. crlf         a carriage-return + line-feed pair, injected or percent-encoded.
 *   9. header       an HTTP header field name at the start of a line, so
 *                   `X-Forwarded-For: 127.0.0.1` is a header, not the ssrf address
 *                   it carries.
 *  10. xss          markup, an event handler, or a javascript:/document sink.
 *  11. rce          an explicit interpreter, reverse shell or webshell invocation.
 *  12. command-injection a shell separator or substitution bound to a command word,
 *                   so `cat /etc/passwd; whoami` is command injection, not lfi.
 *  13. lfi          traversal, a sensitive filesystem path, or a stream wrapper.
 *  14. ssrf         a loopback/private/metadata address or a local-service scheme.
 *  15. open-redirect a scheme-relative or backslash host, matched last among the
 *                   network rules because `//host` alone is the weakest signal.
 *  16. wordlist     a bare single token with no injection syntax at all.
 *  17. other        prose, an empty string, or anything unrecognized.
 */
import type { PayloadKind } from "./types"

interface Signal {
  readonly kind: PayloadKind
  readonly pattern: RegExp
}

const SHELL_COMMANDS =
  "cat|whoami|id|ls|dir|uname|hostname|curl|wget|ping|nc|ncat|bash|sh|zsh|sleep|echo|type|ipconfig|ifconfig|nslookup|powershell|python|perl|rm|cp|mv|chmod|chown|kill|touch|printf|find|tee|env|set|head|tail|more|base64"

const SIGNALS: readonly Signal[] = [
  { kind: "xxe", pattern: /<!DOCTYPE|<!ENTITY/i },
  {
    kind: "ldap",
    pattern: /jndi:(?:ldap|rmi|dns|iiop|corba|nds|http)|\bldap:\/\/|\(\s*[&|]\s*\(|\(\s*\?[a-z][a-z0-9_.-]*\s*[=<>*]|\((?:uid|cn|sn|mail|objectclass|objectcategory|userpassword|samaccountname|memberof|distinguishedname|name|domain)\s*[=*]|%28(?:uid|cn|objectclass)%3d/i,
  },
  {
    kind: "ssti",
    pattern:
      /\{\{[^}]{1,80}\}\}|\$\{(?!jndi:)(?!(?:IFS|PATH|HOME|SHELL|PWD|USER)\b)[^}]{1,80}\}|<%=[^%]{1,80}%>|#\{[^}]{1,80}\}|\{%[^%]{1,80}%\}/,
  },
  { kind: "graphql", pattern: /\b(?:query|mutation|subscription)\b[^;{}]{0,80}\{|\{\s*__\w+|\b__(?:schema|typename|type|field)\b/i },
  {
    kind: "nosql",
    pattern:
      /\$(?:gte|gt|lte|lt|ne|eq|where|regex|exists|nin|in|or|and|not|nor|expr|jsonSchema|elemMatch|slice|size|all|type|mod)\b|\{\s*"\s*\$|(?:^|[;"']\s*)return\s+true\b|\bwhile\s*\(\s*true\s*\)/i,
  },
  {
    kind: "sqli",
    pattern:
      /'\s*(?:or|and)\s+'?\d+'?\s*=\s*'?\d|"\s*(?:or|and)\s+"?\d+"?\s*=\s*"?\d|\b(?:or|and)\s+\d+\s*=\s*\d\b|\bunion\b\s+(?:all\s+)?\bselect\b|\binformation_schema\b|\bsleep\s*\(\s*\d|\bbenchmark\s*\(|\bwaitfor\s+delay\b|\bupdatexml\s*\(|\bextractvalue\s*\(|\bxp_cmdshell\b|@@version|\binsert\s+into\b|\bdelete\s+from\b|\|\|\s*'\d'\s*=\s*'\d/i,
  },
  {
    kind: "csv-injection",
    pattern: /^[=@]\s*\S*(?:\(|\||!|")|^[+-]\s*(?:[a-z_]+\s*\(|\d+\s*[+\-*/^]\s*\d|\|)/im,
  },
  { kind: "crlf", pattern: /%0d%0a|%0a%0d|\r\n|\\r\\n/i },
  {
    kind: "header",
    pattern:
      /(?:^|[\r\n])\s*(?:host|x-forwarded-for|x-forwarded-host|x-forwarded-proto|x-original-url|x-rewrite-url|x-http-method-override|x-custom-ip-authorization|x-client-ip|referer|user-agent|forwarded|via|content-length|transfer-encoding)\s*:/im,
  },
  {
    kind: "xss",
    pattern:
      /<\s*(?:script|img|svg|iframe|body|input|details|object|embed|video|audio|marquee|math|form|a)\b[^>]*>|<\w+[^>]*\son\w+\s*=|on(?:error|load|click|mouseover|focus|animationstart|toggle|begin)\s*=|javascript\s*:|data:text\/html|document\.(?:cookie|domain|location|write)\b|alert\s*\(|prompt\s*\(|confirm\s*\(/i,
  },
  {
    kind: "rce",
    pattern:
      /\bbash\s+-[ic]\b|\bsh\s+-[ic]\b|(?:^|\s)(?:ba|z|da|k)?sh\s+-c\b|\/bin\/(?:ba|z|da|k)?sh\b|\/dev\/tcp\/|\bnc\s+-e\b|\bncat\s+-e\b|\bsocat\b|\bpython[23]?\s+-c\b|\bperl\s+-e\b|\bruby\s+-e\b|\bphp\s+-r\b|\bnode\s+-e\b|\bpowershell(?:\.exe)?\b[^;{}]{0,40}-(?:enc|e|nop|w)\b|\bcmd(?:\.exe)?\s*\/c\b|\biex\s*\(|\binvoke-expression\b|\bdownloadstring\b|\beval\s*\(\s*(?:base64|atob|\$_(?:GET|POST|REQUEST))|\b(?:system|passthru|shell_exec|popen|proc_open)\s*\(|\b(?:curl|wget)\b[^\n]{0,60}\|\s*(?:ba)?sh\b/i,
  },
  {
    kind: "command-injection",
    pattern: new RegExp(
      `\\$\\(|\`\\s*(?:${SHELL_COMMANDS})\\b|(?:;|\\||&&|%0a|%0d|%3b|%7c)\\s*(?:${SHELL_COMMANDS})\\b|\\$\\{IFS\\}|<<<|\\b(?:cat|type|head|tail|more)\\s+(?:/|\\.\\.|[a-z]:\\\\)`,
      "i",
    ),
  },
  {
    kind: "lfi",
    pattern:
      /\.\.[/\\]|%2e%2e%2f|%2e%2e\/|%252e%252e|\/etc\/(?:passwd|shadow|hosts|group)|\/proc\/self\/(?:environ|cmdline)|php:\/\/|(?:file|phar|zip|expect|data):\/\/|\/windows\/win\.ini\b|boot\.ini\b|\/WEB-INF\//i,
  },
  {
    kind: "ssrf",
    pattern:
      /169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|\b127\.0\.0\.1\b|\blocalhost\b|\[::1\]|\b0\.0\.0\.0\b|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.\d{1,3}\.\d{1,3}\b|\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b|gopher:\/\/|dict:\/\//i,
  },
  {
    kind: "open-redirect",
    pattern: /(?:^|[^:\w])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+|\\\\[a-z0-9-]+(?:\.[a-z0-9-]+)+|%2f%2f[a-z0-9-]+(?:\.[a-z0-9-]+)+/i,
  },
]

const BARE_TOKEN = /^[A-Za-z0-9_.@!#$%^&*+=~-]{8,128}$/

export function classifyPayload(text: string): PayloadKind {
  const trimmed = text.trim()
  if (trimmed.length === 0) return "other"
  for (const signal of SIGNALS) {
    if (signal.pattern.test(trimmed)) return signal.kind
  }
  return looksLikeWordlistEntry(trimmed) ? "wordlist" : "other"
}

function looksLikeWordlistEntry(trimmed: string): boolean {
  if (!BARE_TOKEN.test(trimmed)) return false
  if (/^\d+(?:\.\d+)*$/.test(trimmed)) return false
  const letters = trimmed.match(/[A-Za-z]/g)
  return letters !== null && letters.length >= 2
}
