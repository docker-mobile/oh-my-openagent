/**
 * Prompt assembly. Substitution is one regex pass over the template, so a value
 * that itself contains a token such as `{goal}` is inserted literally and is
 * never re-substituted by a later pass. The projection renders facts and
 * intents from title and description only, replacing a doc body with a
 * `(has doc)` marker so the detailed layer never enters the context budget.
 *
 * Absorbed from sapper-v2 (MIT, pin 7b75e6f1f5) `_replace_placeholders`,
 * `render_prompt`, `render_intent_prompt`, `_intent_brief`, `_hint_brief` and
 * `_to_yaml_like` in `lib/sapper.py`. See NOTICE.
 */

const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]+/g

export const DOC_MARKER = "(has doc)"
export const NO_RECALL_BLOCK = "(no prior nodes look similar to this intent)"
export const DEFAULT_MAX_INTENTS = 3

const DOC_NOTE =
  "note: nodes marked (has doc) carry a detailed layer; read it with the doc command when you need the full context."

/**
 * Makes one graph value safe inside a prompt line: control characters collapse
 * so a hostile node cannot forge a rendered row, backticks so it cannot close a
 * prompt fence.
 */
export function promptInline(text: string): string {
  return text.replace(CONTROL_CHARS_RE, " ").replace(/`/g, "'")
}

/**
 * A token absent from `replacements` is left exactly as written, never blanked.
 */
export function substitutePlaceholders(
  template: string,
  replacements: Readonly<Record<string, string>>,
): string {
  return template.replace(PLACEHOLDER_RE, (match: string, name: string) => {
    // A plain lookup resolves inherited members, so `{constructor}` would
    // interpolate a function instead of staying a literal token.
    if (!Object.hasOwn(replacements, name)) return match
    const value: string | undefined = replacements[name]
    return value === undefined ? match : value
  })
}

export interface ProjectedFact {
  readonly id: string
  readonly kind?: string | null
  readonly title?: string | null
  readonly description?: string | null
  readonly data?: Readonly<Record<string, string>> | null
  readonly sourceIntent?: string | null
  readonly doc?: string | null
}

export interface ProjectedIntent {
  readonly id: string
  readonly from: readonly string[]
  readonly to?: string | null
  readonly title?: string | null
  readonly description?: string | null
  readonly requiresConfirmation?: boolean
  readonly confirmed?: boolean
  readonly doc?: string | null
}

export interface ProjectedHint {
  readonly id: string
  readonly creator: string
  readonly content: string
}

export interface GraphProjectionInput {
  readonly status: string
  readonly goal: string
  readonly facts: readonly ProjectedFact[]
  readonly intents: readonly ProjectedIntent[]
  readonly hints?: readonly ProjectedHint[]
}

// Presence only; the doc body is never read here.
function docMarker(doc: string | null | undefined): string {
  return doc ? ` ${DOC_MARKER}` : ""
}

function renderFactLine(fact: ProjectedFact): string {
  const kind = fact.kind ? `<${fact.kind}> ` : ""
  const title = fact.title ? `[${promptInline(fact.title)}] ` : ""
  const entries = Object.entries(fact.data ?? {})
  const data = entries.length > 0
    ? ` {${entries.map(([key, value]) => `${key}=${promptInline(value)}`).join(" ")}}`
    : ""
  const source = fact.sourceIntent ? ` (from ${fact.sourceIntent})` : ""
  return `  - ${fact.id}: ${kind}${title}${promptInline(fact.description ?? "")}${data}${source}${docMarker(fact.doc)}`
}

function renderIntentLine(intent: ProjectedIntent): string {
  const target = intent.to ?? "open"
  const flag = intent.requiresConfirmation && !intent.confirmed ? " [needs_confirmation]" : ""
  const title = intent.title ? `[${promptInline(intent.title)}] ` : ""
  return `  - ${intent.id}: ${JSON.stringify([...intent.from])} -> ${target}${flag} | ${title}${promptInline(intent.description ?? "")}${docMarker(intent.doc)}`
}

export function renderGraphProjection(input: GraphProjectionInput): string {
  const lines = [
    `project: status=${promptInline(input.status)}`,
    `goal: ${promptInline(input.goal)}`,
    "facts:",
    ...input.facts.map(renderFactLine),
    "intents:",
    ...input.intents.map(renderIntentLine),
  ]

  const hints = input.hints ?? []
  if (hints.length > 0) {
    lines.push("hints:")
    lines.push(...hints.map((hint) => `  - ${hint.id} (${promptInline(hint.creator)}): ${promptInline(hint.content)}`))
  }

  lines.push(DOC_NOTE)
  return lines.join("\n")
}

function intentBrief(intent: ProjectedIntent): Record<string, unknown> {
  return {
    id: intent.id,
    from: [...intent.from],
    description: intent.description ?? "",
    requires_confirmation: intent.requiresConfirmation === true,
    confirmed: intent.confirmed === true,
  }
}

function hintBrief(hint: ProjectedHint): Record<string, unknown> {
  return { id: hint.id, creator: hint.creator, content: hint.content }
}

export interface ReasonPromptInput {
  readonly template: string
  readonly origin: string
  readonly goal: string
  readonly graph: GraphProjectionInput
  readonly maxIntents?: number
  readonly timeBudget?: string
}

export function renderReasonPrompt(input: ReasonPromptInput): string {
  const graph = input.graph
  return substitutePlaceholders(input.template, {
    origin: promptInline(input.origin),
    goal: promptInline(input.goal),
    graph_yaml: renderGraphProjection(graph),
    fact_ids: JSON.stringify(graph.facts.map((fact) => fact.id), null, 2),
    open_intents: JSON.stringify(
      graph.intents.filter((intent) => (intent.to ?? null) === null).map(intentBrief),
      null,
      2,
    ),
    hints: JSON.stringify((graph.hints ?? []).map(hintBrief), null, 2),
    max_intents: String(input.maxIntents ?? DEFAULT_MAX_INTENTS),
    time_budget: promptInline(input.timeBudget ?? ""),
  })
}

export interface ExplorePromptInput {
  readonly template: string
  readonly graph: GraphProjectionInput
  readonly intentId: string
  readonly intentDescription: string
  readonly recallBlock?: string
}

export function renderExplorePrompt(input: ExplorePromptInput): string {
  return substitutePlaceholders(input.template, {
    graph_yaml: renderGraphProjection(input.graph),
    intent_id: input.intentId,
    intent_description: promptInline(input.intentDescription),
    recall_block: input.recallBlock ?? NO_RECALL_BLOCK,
  })
}

export interface VerifyPromptInput {
  readonly template: string
  readonly intentDescription: string
  readonly resultDescription: string
}

export function renderVerifyPrompt(input: VerifyPromptInput): string {
  return substitutePlaceholders(input.template, {
    intent_description: promptInline(input.intentDescription),
    result_description: promptInline(input.resultDescription),
  })
}

export interface CommandPromptInput {
  readonly template: string
  readonly board: string
  readonly timeBudget: string
}

export function renderCommandPrompt(input: CommandPromptInput): string {
  return substitutePlaceholders(input.template, {
    board: input.board,
    time_budget: input.timeBudget,
  })
}
