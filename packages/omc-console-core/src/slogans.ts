// Package: @oh-my-cybersecurity/omc-console-core - the console voice: short, hard, adversary-side lines that read like a sticker on the lid.

/** The operator voice. Offensive-first, no hedging, no compliance language. */
export const SLOGANS: readonly string[] = [
  "Get in. Stay in.",
  "Recon is a courtesy you do not owe anyone.",
  "The perimeter was a suggestion.",
  "Own the box. Then own the next one.",
  "Loud is a choice. Quiet is a discipline.",
  "Every network is flat if you are patient enough.",
  "Credentials are just keys somebody left in the lock.",
  "Enumerate until the map stops growing.",
  "The shell you keep is worth two you lost.",
  "Trust is an input you get to write.",
  "Assumed breach is not a scenario. It is the schedule.",
  "Pivot early, pivot often, leave nothing pointing back.",
  "They patch on Tuesdays. You do not.",
  "If it authenticates, it exfiltrates.",
  "The best exploit is the one already in the config.",
  "Persistence is a promise you keep after the reboot.",
  "Nobody logs the thing nobody expected.",
  "Walk the graph until it surrenders its crown jewels.",
  "OPSEC is not paranoia when the logs are real.",
  "Dominance is a posture, not an event.",
]

const SECONDS_PER_DAY = 86_400

/** Day number since the epoch, the stable daily seed. */
function utcDayIndex(now: Date): number {
  return Math.floor(now.getTime() / (SECONDS_PER_DAY * 1_000))
}

/**
 * Picks a slogan. A seed always resolves to the same line; with no seed the line is stable for the current UTC day.
 */
export function pickSlogan(seed?: number, now: Date = new Date()): string {
  const index = seed === undefined ? utcDayIndex(now) : Math.trunc(seed)
  const size = SLOGANS.length
  return SLOGANS[((index % size) + size) % size] ?? SLOGANS[0] ?? ""
}
