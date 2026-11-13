import { createProductIdentity } from "@oh-my-cybersecurity/utils"

const PRODUCT_IDENTITY = createProductIdentity({
  pluginName: "oh-my-cybersecurity",
  legacyPluginName: "oh-my-opencode",
  publishedPackageName: "oh-my-cybersecurity",
  configBasename: "oh-my-cybersecurity",
  legacyConfigBasename: "oh-my-opencode",
  logFileName: "oh-my-cybersecurity.log",
  cacheDirName: "oh-my-cybersecurity",
})

export const PLUGIN_NAME = PRODUCT_IDENTITY.pluginName
export const LEGACY_PLUGIN_NAME = PRODUCT_IDENTITY.legacyPluginName
export const PUBLISHED_PACKAGE_NAME = PRODUCT_IDENTITY.publishedPackageName
export const ACCEPTED_PACKAGE_NAMES = [PUBLISHED_PACKAGE_NAME, PLUGIN_NAME] as const
export const CONFIG_BASENAME = PRODUCT_IDENTITY.configBasename
export const LEGACY_CONFIG_BASENAME = PRODUCT_IDENTITY.legacyConfigBasename
export const LOG_FILENAME = PRODUCT_IDENTITY.logFileName
export const CACHE_DIR_NAME = PRODUCT_IDENTITY.cacheDirName
