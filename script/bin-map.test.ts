import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { bin: Record<string, string> };

describe("root package.json bin map", () => {
  test("#given the renamed bin map #when inspecting entries #then the omc bin entry is absent", () => {
    // when
    const hasOmoEntry = Object.prototype.hasOwnProperty.call(packageJson.bin, "omc");

    // then
    expect(hasOmoEntry).toBe(false);
  });

  test("#given the renamed bin map #when inspecting entries #then omc-agent-toolkit points at the shared entry", () => {
    // then
    expect(packageJson.bin["omc-agent-toolkit"]).toBe("bin/oh-my-cybersecurity.js");
  });

  test("#given the renamed bin map #when inspecting entries #then the four surviving aliases keep the shared entry", () => {
    // given
    const survivingAliases = ["oh-my-cybersecurity", "omc-agent-toolkit", "lazycodex", "lazycodex-ai"];

    // then
    for (const alias of survivingAliases) {
      expect(packageJson.bin[alias]).toBe("bin/oh-my-cybersecurity.js");
    }
  });
});
