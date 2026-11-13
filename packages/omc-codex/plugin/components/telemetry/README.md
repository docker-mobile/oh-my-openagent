# codex-telemetry

Codex plugin component that emits a single anonymous daily-active event (`omc_codex_daily_active`) to PostHog whenever a Codex session starts.

The event is sent **at most once per UTC day per machine**. Its distinct id is `sha256` of a random install id created on the first send and stored as `install-id` in the telemetry state directory; nothing about the machine or user is used to build it. PostHog person profiles are explicitly disabled.

## Hook Wiring

The component registers a single `SessionStart` hook:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/cli.js\" hook session-start",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

The aggregate `plugin/hooks/hooks.json` mounts this hook alongside `rules` and `ultrawork` so all three fire in parallel at the start of every Codex session.

## What Is Captured

A single PostHog `capture` call with:

- `event: "omc_codex_daily_active"`
- `distinctId: sha256(install id)`
- `properties`:
  - `platform`, `product_name`, `package_name`, `package_version`
  - `runtime` (`"node"`), `runtime_version`
  - `source: "plugin"`, `reason: "session_start"`
  - `$os`, `$os_version`, `os_arch`, `os_type`
  - `cpu_count`, `cpu_model`, `total_memory_gb`
  - `locale`, `timezone`, `shell`, `ci`, `terminal`
  - `day_utc` (today's UTC date)
  - `$process_person_profile: false`

The component never sends prompt contents, file contents, API keys, raw hostnames, or any user-identifying data.

## Opt-Out

Set any of the following environment variables before launching Codex:

```bash
# Codex-only opt-out
export OMC_CODEX_DISABLE_POSTHOG=1
export OMC_CODEX_SEND_ANONYMOUS_TELEMETRY=0

# Global opt-out (covers both omc and omc-codex)
export OMC_DISABLE_POSTHOG=1
export OMC_SEND_ANONYMOUS_TELEMETRY=0
```

When any of these is set the component creates a no-op PostHog client and exits without any network call.

## Daily Deduplication

The component writes a small JSON state file at:

```
$XDG_DATA_HOME/omc-codex/posthog-activity.json
# or, when XDG_DATA_HOME is unset:
~/.local/share/omc-codex/posthog-activity.json
```

containing `{ "lastActiveDayUTC": "YYYY-MM-DD" }`. If the stored day matches today (UTC), the hook returns without sending anything. The file is written atomically via `rename(2)`.

## Failure Behavior

Every telemetry path is wrapped in `try`/`catch`. The hook always exits 0 with no stdout or stderr output, even when PostHog construction, capture, or shutdown fails. Codex session startup is never blocked or slowed by telemetry failures.

Handled telemetry failures are written only to a local diagnostics file:

```
$XDG_DATA_HOME/omc-codex/telemetry-diagnostics.jsonl
# or, when XDG_DATA_HOME is unset:
~/.local/share/omc-codex/telemetry-diagnostics.jsonl
```

The diagnostics file keeps JSONL rows for recent telemetry failures, prunes stale rows during writes, and caps itself at 256 KiB by dropping the oldest complete rows. Diagnostics are never sent to PostHog and do not include prompt contents, transcript contents, raw hostnames, API keys, tokens, or full hook payloads.

## Endpoint Overrides

| Variable | Default |
|----------|---------|
| `POSTHOG_HOST` | `https://us.i.posthog.com` |
| `POSTHOG_API_KEY` | shared `omc-codex` project key |

## Development

```bash
npm install
npm test           # vitest (in-process + subprocess CLI smoke)
npm run typecheck
npm run build      # tsc -> dist/
npm run check      # typecheck + biome + build
```

The component shares its product identity constants with the `@oh-my-cybersecurity/omc-codex` CLI installer. Drift between the two implementations is guarded by `packages/omc-codex/src/telemetry/cross-package-equivalence.test.ts`.

## Privacy

See [the omc Privacy Policy](https://github.com/code-yeongyu/oh-my-cybersecurity/blob/dev/docs/legal/privacy-policy.md) for the full disclosure.
