export const CODEX_COMPONENT_NOTICE_REQUIREMENTS = [
  {
    path: "packages/omc-codex/plugin/components/comment-checker",
    requiredTerms: ["pi-comment-checker", "@code-yeongyu/comment-checker"],
  },
  {
    path: "packages/omc-codex/plugin/components/lsp",
    requiredTerms: ["pi-lsp-client"],
  },
  {
    path: "packages/omc-codex/plugin/components/rules",
    requiredTerms: ["pi-rules", "picomatch"],
  },
  {
    path: "packages/omc-codex/plugin/components/ulw-execute-continuation",
    requiredTerms: [],
  },
  {
    path: "packages/omc-codex/plugin/components/telemetry",
    requiredTerms: ["posthog-node", "@oh-my-cybersecurity/telemetry-core"],
  },
  {
    path: "packages/omc-codex/plugin/components/ultrawork",
    requiredTerms: [],
  },
  {
    path: "packages/omc-codex/plugin/components/ulw-loop",
    requiredTerms: [],
  },
]
