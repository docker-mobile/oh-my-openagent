/** The per-repo changelog-gate config: the only file that differs between repos. */
export const GATE_CONFIG = {
  releaseBranchPattern: /^release\//,
  // No releaseActors list: check-pr-changelog.ts identifies the release-state PR by publish.yml's marker on a
  // release branch in this repository, never by who opened it (#11704).
  // Unused here: check-pr-changelog.ts passes the shipped-surface classifier (changelog-shipping-policy.mjs) as
  // isUserFacing, which replaces the root rule for every verdict (#10841).
  userFacingRoots: [],
  // Exactly what publish.yml's release commit stages besides CHANGELOG.md and the fragments.
  releaseArtifacts: [
    /^package\.json$/,
    /^bun\.lock$/,
    /^packages\/[^/]+\/package\.json$/,
    /^packages\/omc-senpi\/plugin\/package\.json$/,
    // publish.yml force-adds the whole directory (git add -f packages/omc-senpi/plugin/extensions).
    /^packages\/omc-senpi\/plugin\/extensions\//,
    /^packages\/omc-senpi\/plugin\/runtime\//,
    /^packages\/omc-codex\/plugin\/(?:package\.json|package-lock\.json|\.codex-plugin\/plugin\.json)$/,
    /^packages\/omc-codex\/plugin\/components\/[^/]+\/(?:package\.json|hooks\/hooks\.json)$/,
    /^packages\/omc-codex\/plugin\/hooks\/[^/]+\.json$/,
    /^packages\/omc-codex\/scripts\/install-dist\/install-local\.mjs$/,
    // stamp-release-changelog.ts writes the fragments' log blocks into their logs in the release commit.
    /^packages\/[^/]+\/changes\.md$/,
  ],
} as const;
