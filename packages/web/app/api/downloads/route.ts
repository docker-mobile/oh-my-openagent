import { downloadBadgeResponse, liveDownloadBadge } from "@/lib/download-badge"
import { FALLBACK_FORMATTED_STATS, getStats } from "@/lib/stats"

/**
 * Shields.io endpoint badge for every OmC download: the npm lineage plus the compiled binaries
 * downloaded from GitHub releases or served by the get.omc.nga.hm mirror. Usage: https://img.shields.io/endpoint?url=https://omc.nga.hm/api/downloads
 */
export async function GET() {
  try {
    return liveDownloadBadge("downloads", (await getStats()).totalDownloads)
  } catch {
    return downloadBadgeResponse("downloads", FALLBACK_FORMATTED_STATS.totalDownloads, false)
  }
}
