import { installPostHogTestGuard } from "./posthog-test-guard"

process.env.OMC_DISABLE_POSTHOG = "true"
installPostHogTestGuard()
