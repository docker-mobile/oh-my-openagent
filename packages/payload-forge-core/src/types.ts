/**
 * Frozen payload-forge contract: the payload kinds, the template and wordlist
 * records the corpora are generated into, and the render/classify signatures
 * every consumer codes against.
 *
 * Absorbed from PayloadsAllTheThings (MIT, Copyright (c) 2019 Swissky, pin
 * 08ea40e77db3f42ef8f20c65196f3936a19b6c86). See NOTICE.
 *
 * `renderPayload` and `classifyPayload` are declared here and implemented in
 * `render.ts` and `classify.ts`. The corpora they operate on are loaded from
 * disk at runtime and are never inlined into a TS module.
 */

export const PAYLOAD_KINDS = ["xss", "sqli", "ssti", "lfi", "rce", "xxe", "ssrf", "open-redirect", "crlf", "csv-injection", "command-injection", "ldap", "nosql", "graphql", "header", "wordlist", "other"] as const
export type PayloadKind = (typeof PAYLOAD_KINDS)[number]

export interface PayloadVariable { readonly name: string; readonly description: string; readonly defaultValue: string | null }
export interface PayloadTemplate { readonly id: string; readonly name: string; readonly kind: PayloadKind; readonly category: string; readonly body: string; readonly variables: readonly PayloadVariable[]; readonly source: string; readonly tags: readonly string[] }
export interface WordlistEntry { readonly id: string; readonly family: string; readonly lines: number; readonly sourcePath: string }
export interface PayloadIndex { readonly templates: number; readonly families: number; readonly generatedAt: string; readonly pin: string }
export interface RenderResult { readonly body: string; readonly unresolved: readonly string[] }

export declare function renderPayload(template: PayloadTemplate, values?: Readonly<Record<string, string>>): RenderResult
export declare function classifyPayload(text: string): PayloadKind
