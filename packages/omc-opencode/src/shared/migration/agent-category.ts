import { configureMigrationCategoryDefaults } from "@oh-my-cybersecurity/utils/migration/agent-category"

import { DEFAULT_CATEGORIES } from "../../tools/delegate-task/constants"

configureMigrationCategoryDefaults(DEFAULT_CATEGORIES)

export * from "@oh-my-cybersecurity/utils/migration/agent-category"
