# Provenance and parity: pentagi + sapper-v2 absorption

Status: living document. Last updated 2026-11-13.
Upstream pins:
- **pentagi** `main = cffed9485aa1cca70762cd08a57ac62a80406258` (MIT, Copyright (c) 2025 PentAGI Development Team)
- **sapper-v2** `master = 7b75e6f1f5d5b4ae0c55878b0dd0994d9b08f1fb` (MIT, Copyright (c) 2026 N1nEmAn)

Harvest evidence this document is derived from (not claims made up here):
- `harvest-sapper.md` - 494 lines, every cited path and `symbol:line` resolved against the pinned clone.
- `harvest-pentagi.md` - 308 lines, 130 cited paths verified, 20/20 spot-checked with `test -f`.

## READ THIS FIRST: what parity does NOT mean here

**Neither upstream shipped a typed finding model, and neither shipped per-binary tool adapters.**
This is stated in the harvests, not inferred:

- sapper-v2: a finding IS a `vuln` fact; its evidence is that fact's `doc` prose. The `data` key
  conventions (`host/port/cve/name/severity/status`) live **only in prompt text**, never validated in code.
- pentagi: "No typed vulnerability/finding model. No CVE, no CVSS, no asset table. Findings are free
  text in `result` fields... A TypeScript port has to **invent** one; there is nothing here to copy."
- Tool invocation: sapper "never invokes nmap/sqlmap/nuclei itself (installed and prompt-referenced
  only; the agent shells out)". pentagi likewise has "no per-binary tool adapters" - the names are
  shell strings the model composes inside a Kali container.

So anything below marked **NEW** is our own design, informed by their shapes, and must never be
described as ported, migrated, or at parity with an upstream implementation of it.

## Absorbed (reimplemented in typed TypeScript)

| Capability | Source | Where it landed | Verification |
|---|---|---|---|
| Fact/intent engagement graph, structural readiness, `goal` terminal fact | sapper `lib/sapper.py` `Store`, `is_ready`, `frontier` | `packages/engagement-core/src/index.ts` | `index.test.ts` (20 tests) |
| Typed fact kinds + flat scalar `data` map, key charset bound | sapper `FACT_KINDS`, `normalize_fact_data` | same, `FACT_KINDS` / `normalizeFactData` | `index.test.ts` |
| One file per node, id counters that skip occupied ids, path-safe id validation | sapper `Store`, `_next_id`, node id regex | `src/store.ts` | `store.test.ts` incl. a traversal-refusal case |
| Loot/flag ledger: dedupe + **record-before-submit** ordering | sapper `cmd_flag`, `update_flag_fact` | `EngagementGraph.recordFlag` | `index.test.ts` (dedupe + ordering) |
| Bounded execution with a hard timeout ceiling, captured output/exit | pentagi `pkg/tools/terminal.go` (`ExecOptions`, `maxExplicitExecCommandTimeout`) | `src/exec.ts` | `exec.test.ts` (12 tests) |
| Security classification vocabulary (severity/confidence/CVE/CWE unions) | pentagi Graphiti node/edge prompt taxonomy | `src/findings.ts` | `findings.test.ts` |
| **Untrusted-data fence**: graph/target/tool output fenced with explicit provenance, injection attempts detected and reported rather than obeyed, fence-escape neutralized | sapper executor + reason templates, and its SKILL.md "textual defense, not a sandbox" caveat | `src/untrusted.ts` | `untrusted.test.ts` (security contract, incl. a fence-escape payload) |
| **Context-window compaction**: transcript parsed into a section/body-pair AST, oversize decisions made on node sizes and types, aged sections collapsed, oversized pairs summarized in place, reasoning stripped before reuse, provider tool-call ids normalized consistently | pentagi `backend/pkg/cast/chain_ast.go` (`ChainAST`, `BodyPair`, `CalculateMessageSize`, `NormalizeToolCallIDs`, `ClearReasoning`) + `backend/pkg/csum/chain_summary.go` (`SummarizeChain`, `summarizeSections`, `summarizeLastSection`, `summarizeOversizedBodyPairs`) | `src/compaction.ts` | `compaction.test.ts` (18 tests) |
| **Field commander + war board**: many concurrent engagements reduced to one compact board, planner decision validated (`action`/`target`/`minutes` clamped), and **round-robin degradation** when the planner throws or returns garbage so an unattended run never stalls | sapper `cmd_command`, `_board_summary`, `render_board`, `_parse_command_payload`; `templates/command.md` | `src/commander.ts` | `commander.test.ts` (24 tests) |
| **Deadline + time-budget injection**: `--deadline` (ISO8601, naive = local) or `--minutes` mutually exclusive, rendered as a budget line and substituted into a prompt so the model paces itself | sapper `deadline_from_args`, `format_time_budget` | `src/deadline.ts` | `deadline.test.ts` (16 tests) |
| **Offline knowledge base**: entry schema (id/title/description/detail/commands/tags/source), tag and id validation, token-overlap search with title weighted above body prose and a tag filter that narrows candidates first, markdown import | sapper `lib/kb.py` (`KnowledgeBase`, `add`, `get`, `search`, `import_markdown`) | `src/kb.ts` | `kb.test.ts` (22 tests) |
| **Recall / similarity search**: token overlap over title (weighted) + description + tags + the first 500 chars of the node doc, CJK split to single-character tokens (no language tokenizer), and a fuzzy-ratio fallback so a reworded task still surfaces prior work | sapper `_recall_tokenize`, `_recall_score`, `recall`, `render_recall`, `render_history_block` | `src/recall.ts` | `recall.test.ts` (26 tests) |
| **Cap-aware scheduler + loop stop conditions**: runs up to the concurrency cap, backfills as units finish, **requeues** a unit that fails while attempts remain rather than dropping it, validates the cap rather than trusting it, and decides loop termination by noop streak / iteration budget / failure limit with the binding reason reported | sapper `cmd_bench` (`_run_parallel`), `cmd_fleet` cap handling, and the auto-loop stop conditions | `src/scheduler.ts` | `scheduler.test.ts` (17 tests) |
| **Typed HTTP platform client**: five endpoints, env-then-file config precedence with `ENV:VAR` token indirection, and every response a result carrying status + error code so a platform rejection is a value, not an exception | sapper `lib/arena.py` (`ArenaClient`, `_request`, `list_challenges`, `start_challenge`, `get_hint`, `submit_flag`, `close_challenge`) | `src/platform.ts` | `platform.test.ts` (19 tests) |
| **Tolerant JSON extraction from prose**: string/escape-aware scanner that returns the first brace-balanced object that actually parses, so a stray brace in a preamble or inside a quoted string cannot derail it | sapper `_extract_first_balanced`, `extract_json_object` | `src/json-extract.ts` | `json-extract.test.ts` |
| **Strict LLM output contracts**: reason classified as exactly one of complete/intents/noop/rejected; the intent applier validates every proposal (known fact ids only, never the reserved goal id, non-empty description, cap 3) and **skips invalid ones instead of aborting the batch**; explore requires title/description/doc/kind/data with `deviations` appended rather than replacing the doc; verify requires a boolean `verified` and enforces that `issues` is non-empty only when false | sapper `_classify_reason_payload`, `_apply_reason`, `_parse_explore_payload`, `_parse_verify_payload` | `src/contracts.ts` | `contracts.test.ts` |
| **Single-pass placeholder prompt assembly + doc-hiding projection**: ONE regex pass over the TEMPLATE only, so an inserted value containing a token such as `{goal}` is never re-substituted (upstream pins this as `test_prompt_substitution_does_not_rewrite_inserted_braces`); graph projection renders title+description and replaces the doc body with a marker, which is the actual context-budget mechanism | sapper `_replace_placeholders`, `render_intent_prompt`, `_to_yaml_like` | `src/prompt-assembly.ts` | `prompt-assembly.test.ts` |
| **Delta subtask plans**: add/remove/modify/reorder against stable ids, pure and non-mutating, rejecting unknown ids and duplicate-producing deltas while reporting applied-vs-rejected per operation so a partially valid model payload still lands | pentagi `backend/pkg/tools/args.go` (`SubtaskOperation`, `SubtaskPatch`), `templates/prompts/refiner.tmpl` | `src/plan-delta.ts` | `plan-delta.test.ts` |
| **Typed provider/model catalog with per-agent resolution**: context window, output cap, four independent price fields, reasoning mode/efforts, an explicit precedence where an agent block wins and omitted fields fall back to the catalog entry rather than becoming undefined, and a lookup distinguishing "no such model" from "model with no overrides" | pentagi `backend/pkg/providers/pconfig/config.go` (`ModelConfig`), `backend/pkg/providers/catalog.go` | `src/model-catalog.ts` | `model-catalog.test.ts` |
| **Tool-call robustness trio**: a repeat detector whose fingerprint includes a caller-supplied state token so a legitimate re-read after a change is not a repeat; an argument fixer that repairs the common malformed-JSON shapes and never silently drops a key; and a bounded corrective reflector that names the specific violation | pentagi `backend/pkg/providers/helpers.go`, `backend/pkg/providers/performer.go`, `templates/prompts/toolcall_fixer.tmpl`, `templates/validator/validator.go` | `src/toolcall-guard.ts` | `toolcall-guard.test.ts` |

### Absorbed into dedicated offensive packages

| Package | Capability | Upstream | License + pin | Verification |
|---|---|---|---|---|
| `packages/arsenal-core` | **Unix + Windows binary-abuse corpus as typed primitives**: closed function set mapped onto an `OffensiveAction` union, a total category mapping, alias resolution with cycle detection, and a deterministic re-runnable generator | GTFOBins (478 records) and LOLBAS (248 records) | **GPL-3.0** - see the corpus note below | `gtfobins.test.ts`, `lolbas.test.ts`, `query.test.ts`; corpus generation verified at 478/248 |
| `packages/attack-playbook-core` | **MITRE ATT&CK atomic-test corpus**: technique/atomic/executor/argument schema, `#{key}` placeholder resolution that reports unresolved tokens and leaves non-argument `#{}` text verbatim, a pure dispatch table, and dependency pre-flight data | Red Canary atomic-red-team (353 techniques) | MIT (c) 2018 Red Canary, `LICENSE.txt` read at pin | `playbook.test.ts`, `resolve.test.ts`; corpus verified at 353 techniques |
| `packages/payload-forge-core` | **Payload templates + wordlist index**: the `§VAR§` templating convention rendered single-pass with unresolved tokens left visible rather than blanked, a documented total payload classifier, and a wordlist family index carrying a sha256 per file so a consumer can verify what it reads | PayloadsAllTheThings hopla corpus (132 templates, 69 families) | MIT (c) 2019 Swissky, `LICENSE` read at pin | `payload.test.ts`, `render.test.ts`, `classify.test.ts`; corpus verified at 132/69 |
| `packages/omc-console-core` | **Offensive console**: semantic ANSI palette, box-drawing block wordmark, operator slogans, and a width-correct dashboard frame over the engagement graph and the arsenal corpus | NEW - no upstream | none | `palette.test.ts`, `wordmark.test.ts`, `slogans.test.ts`, `dashboard.test.ts` (53 tests) |
| `packages/shared-skills/skills/{offensive-doctrine,exploitation,tradecraft}` | **Offensive doctrine as skills**: sequencing/evidence/timeboxing/discipline, exploit selection through privilege escalation, and persistence/credentials/pivoting/cleanup - re-authored in our voice from the upstream doctrine's shape, never copied prose | sapper `templates/*.md`, `docker/commander/SKILL.md` | MIT (c) 2026 N1nEmAn | frontmatter parses with exactly `name`+`description`; repo loader tests 12 pass / 0 fail |

### How the absorbed capability reaches a user

| Surface | What it does | Proof |
|---|---|---|
| `omc arsenal index` | Prints the corpus location, generated timestamp, per-source record counts and the pinned upstream commit | 478 + 248 records with real pins; see the SC2 capture |
| `omc arsenal search <text>` | Filters the corpus by action, platform, source, MITRE id and free text, rendering an aligned table | returns MITRE-mapped rows, e.g. `lolbas:Schtasks.exe  execute  schtasks /create ...` |
| `omc arsenal for-state` | Ranks primitives for a privilege/platform state (privilege-escalation and credential-access first) | `query.test.ts` ranking ladder |
| `omc dash` | Renders the engagement graph, the frontier and the arsenal as one frame; `--watch` redraws, `--json` emits the model | screenshots inspected in both modes; live corpus shown in the ARSENAL panel |
| `omc --help`, `omc version` | Greet with the wordmark and the slogan of the day | `--help` capture; `version` writes the banner to stderr so stdout stays one parseable line |

## NEW - designed here, no upstream equivalent

| Capability | Why it is new | Where |
|---|---|---|
| **Typed finding model**: severity ranks, CVE/CWE validation, evidence records with tool + argv + captured output, dedupe, severity ranking, unproven-claim detection | Neither upstream has a typed finding (both keep prose) | `src/findings.ts` |
| **Scanner tool adapters**: declared `{name, binary, buildArgs}` definitions for nmap/nuclei/httpx, with argv built by the adapter rather than by a caller or a model | Neither upstream adapts tools at all; both let the model compose shell strings | `src/exec.ts` (`AdapterDefinition`, `runAdapter`), `src/cli.ts` (`ADAPTERS`) |
| **Shell-metacharacter refusal** before any spawn, on both command and arguments | Upstreams pass model-composed strings to a shell | `src/exec.ts` (`assertNoShellMeta`) |
| **Fence-escape neutralization**: a payload carrying a closing fence tag cannot appear to be trusted text | Upstream fence is prose only, with no escaping mechanism | `src/untrusted.ts` (`neutralizeFence`) |
| **CLI entrypoint** `omc-engagement` over graph + findings + adapters | Upstreams are a Python CLI and a Go server; neither is this surface | `src/cli.ts` |

## Deliberately dropped

| Dropped | Source | Reason |
|---|---|---|
| Legion runtime: commander TUI, tmux worker panes, bash watchdog, TUI glyph scraping, `~/.claude.json` mutation | sapper | Report: "nothing in the legion runtime needs to be ported to reproduce the offensive capability." Superseded by our runtime. |
| Docker images / Kali toolchain / nuclei zip | both | Environmental plumbing; tools are provisioned by the environment, adapters report `not-found` rather than faking a scan. |
| HTML DAG view, arena/competition platform bridge, `ArenaError` rebinding hack | sapper | Presentation is ours; the rebinding is replaced by a typed result. |
| Entire Go platform: gqlgen generated code (48k lines), Echo server, installer TUI, PostgreSQL/pgvector, Graphiti, Langfuse | pentagi | Runtime-specific. |
| langchaingo fork and Go provider SDKs | pentagi | Go-specific LLM plumbing; a Bun port wants a fetch-based interface. |
| VXControl Cloud SDK paths | pentagi | MIT code, but service access needs a separate license key and terms. Report's own advice: "simplest is not to reuse them at all." Not used or referenced. |
| 56 shipped KB entries (Chinese CTF playbooks) | sapper | To be re-authored, not copied; `source` provenance kept if any single entry is imported. |

## Not yet absorbed (honest remaining gap)

These carry real value per the harvests and are **not implemented**:

1. ~~**ChainAST + summarizer + window compaction**~~ - **ABSORBED**, see the absorbed table above (`src/compaction.ts`, 18 tests).
2. ~~**Delta subtask plans**~~ - **ABSORBED** into `src/plan-delta.ts`.
3. ~~**Typed provider/model catalog with per-agent overrides**~~ - **ABSORBED** into `src/model-catalog.ts`.
4. ~~**Tool-call robustness trio**~~ - **ABSORBED** into `src/toolcall-guard.ts`.
5. ~~**Model payload contracts**~~ - **ABSORBED** into `src/contracts.ts`.
6. ~~**Tolerant JSON extraction from prose**~~ - **ABSORBED** into `src/json-extract.ts`.
7. ~~**Single-pass placeholder prompt assembly + doc-hiding projection**~~ - **ABSORBED** into `src/prompt-assembly.ts`.
8. ~~**Untrusted-data fence**~~ - **ABSORBED**, see the absorbed table above (`src/untrusted.ts`, 15 tests).
9. **Fleet/sweep tmux control** - sapper rank 18, and the harvest ranks it the lowest-value surface ("useful only if we keep a pane-driving mode"). Not started, and the legion runtime is explicitly dropped above.
10. ~~**Offensive doctrine as skill assets**~~ - **ABSORBED** as three shared skills (`offensive-doctrine`, `exploitation`, `tradecraft`).
11. ~~**MITRE ATT&CK tactic derivation for `attack-playbook-core`**~~ - **ABSORBED**. Every technique is anchored to its tactic from the upstream index: all 353 techniques carry a non-empty `tactics` array (for example `T1003` -> `["credential-access"]`), asserted by `playbook.test.ts`.
12. **Corpus content beyond the indexed catalogs** - the wordlist bodies and the payload artifacts behind the 132 templates ship as generated local data, not as vendored text; nothing upstream is copied into the repository.

Nothing in this section may be described as absorbed until it exists and has a test that fails
when the behavior breaks.

## Corpus licensing: why the generated data is NOT committed

The offensive corpora are derived from upstream projects whose licenses do not permit redistribution
inside this repository, so they are **generated locally on demand and gitignored**:

| Corpus | Upstream license | Decision |
|---|---|---|
| GTFOBins (478 records) | **GPL-3.0** | Not redistributed. This repository is SUL-1.0, and shipping GPL-derived data inside it would impose copyleft on the whole product. The generator, schema mapping, loader and tests are our own original code and carry no upstream copyright; the JSON is produced against the operator's own clone. |
| LOLBAS (248 records) | **GPL-3.0** | Same decision, same reason (the two upstream LICENSE files are byte-identical, sha256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`). |
| atomic-red-team (353 techniques) | MIT (c) 2018 Red Canary | Committable, but treated as a generated artifact for consistency and repository size. |
| PayloadsAllTheThings (132 templates, 69 families) | MIT (c) 2019 Swissky | Same treatment. |
| HackTricks | **CC BY-NC 4.0** | **Deliberately NOT absorbed.** The NonCommercial clause makes the text unusable in a distributed product, and the prose had no machine-consumable seam. MITRE ATT&CK (Apache-2.0) was absorbed instead, which every corpus here already keys on. Recorded in `packages/payload-forge-core/NOTICE` so the decision is visible rather than silent. |

The `.gitignore` rules live at `packages/{arsenal-core,attack-playbook-core,payload-forge-core}/data/`. This mirrors the repository's
existing DMCA-safe model for `shared-skills` third-party references: pinned provenance and a build-time
materialization, never a committed copy.

## License compliance state

- `packages/engagement-core/NOTICE` carries both MIT texts, both pinned commits, the exact list of
  what was taken from each, and pentagi's `NOTICE` reproduced **verbatim** (including the VXControl
  Cloud SDK AGPL-3.0-with-exception sentence), as that notice is a condition attached to the
  distributed work.
- pentagi's `EULA.md` is **not** propagated: it is a product-level agreement subordinate to MIT for
  source, and reproducing it would misrepresent the license.
- Upstream acceptable-use / disclaimer text is not propagated as product copy. The MIT notice
  obligation is met in `NOTICE`; a third party's request is not a license condition.
- Trademarks "PentAGI" and "VXControl" are not used in product naming or to imply endorsement.

## How to falsify this document

Every "absorbed" row must be checkable by running its named test. Every "NEW" row must have no
upstream source; if a reviewer finds one, that row is wrong and gets corrected here.
Every "not yet absorbed" row that is later implemented moves up, with the test that proves it.
