# assets/ - Generated Schemas

## OVERVIEW

Checked-in JSON artifacts consumed by editors, CLIs, installers, and published packages. This directory is output, not the source of configuration or help contracts.

## STRUCTURE

```
assets/
├── oh-my-cybersecurity.schema.json   # OpenCode edition config schema
├── omc.schema.json              # Harness-neutral omc.json schema
└── help/                        # Machine-readable CLI help schemas
    ├── acp.schema.json
    ├── doctor.schema.json
    ├── sandbox.schema.json
    └── status.schema.json
```

## SOURCE OF TRUTH

| Artifact | Generator / source |
|----------|--------------------|
| `oh-my-cybersecurity.schema.json` | `script/build-schema.ts` + OpenCode Zod schemas under `packages/omc-opencode/src/config/schema/` |
| `omc.schema.json` | `script/build-omc-schema.ts` + `packages/omc-config-core/` |
| `help/*.schema.json` | `script/build-help-schemas.ts` + CLI help definitions |

## COMMANDS

```bash
bun run build:schema
bun run build:omc-schema
bun run script/build-help-schemas.ts
bun test tests/omc-schema-freshness.test.ts
```

## CONVENTIONS

- Regenerate after changing the corresponding source schema or help definition.
- Commit generated output with the source change that requires it.
- Review diffs for accidental field removal, default changes, or stale descriptions.

## ANTI-PATTERNS

- Never hand-edit generated JSON.
- Never fix a freshness test by weakening or deleting the assertion.
- Never update only one schema copy when a shared source feeds multiple artifacts.
