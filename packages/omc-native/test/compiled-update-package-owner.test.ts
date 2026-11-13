import { describe, expect, test } from "bun:test"
import { compiledUpdate, type PackageOwner, probePackageOwner, releaseAssetName, type RunOwnerQuery } from "../compiled-update"

const ASSET = releaseAssetName(undefined, "linux", "x64")

async function updateWith(owner: PackageOwner | undefined) {
  let lookups = 0
  const probed: string[] = []
  const result = await compiledUpdate({
    omoAiVersion: "9.9.9",
    releaseTarget: undefined,
    destination: "/usr/bin/omc",
    platform: "linux",
    arch: "x64",
    fetchReleases: async () => {
      lookups += 1
      return [{ tag_name: "v9.9.10", assets: [{ name: ASSET }] }]
    },
    args: ["update"],
    probeOwner: (path) => {
      probed.push(path)
      return owner
    },
  })
  return { result, lookups, probed }
}

function queries(answers: Record<string, string>): { run: RunOwnerQuery; asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    run: (command) => {
      asked.push(command)
      return answers[command]
    },
  }
}

describe("compiled omc update on a package-manager install", () => {
  test("#given the binary is owned by pacman #when omc update runs #then it names the manager, exits 1 and prints no replace command", async () => {
    // given
    const owner: PackageOwner = { manager: "pacman", pkg: "omc-bin" }

    // when
    const { result, lookups, probed } = await updateWith(owner)

    // then
    expect(probed).toEqual(["/usr/bin/omc"])
    expect(result.exitCode).toBe(1)
    expect(result.stream).toBe("stderr")
    expect(result.output).toBe("omc: installed via pacman (omc-bin); update it with pacman or your AUR helper, e.g. `yay -Syu omc-bin`")
    expect(result.output).not.toContain("curl")
    expect(lookups).toBe(0)
  })

  test("#given no manager owns the binary #when omc update runs #then it keeps today's replace command", async () => {
    // given / when
    const { result, lookups } = await updateWith(undefined)

    // then
    expect(result.exitCode).toBe(0)
    expect(result.output).toStartWith("omc 9.9.10 is available (running 9.9.9). Replace this binary with:\ncurl ")
    expect(lookups).toBe(1)
  })

  test("#given update --help on an owned binary #then usage still wins over the ownership refusal", async () => {
    // given / when
    const result = await compiledUpdate({
      omoAiVersion: "9.9.9", releaseTarget: undefined, destination: "/usr/bin/omc", platform: "linux", arch: "x64",
      fetchReleases: async () => [], args: ["update", "--help"], probeOwner: () => ({ manager: "pacman", pkg: "omc-bin" }),
    })

    // then
    expect(result.exitCode).toBe(0)
    expect(result.output).toStartWith("Usage: omc update")
  })
})

describe("probePackageOwner", () => {
  test("#given pacman owns the path #then it reports pacman with the package name and stops querying", () => {
    // given
    const { run, asked } = queries({ pacman: "omc-bin" })

    // when / then
    expect(probePackageOwner("/usr/bin/omc-missing-for-test", "linux", run)).toEqual({ manager: "pacman", pkg: "omc-bin" })
    expect(asked).toEqual(["pacman"])
  })

  test("#given only dpkg knows the path #then it reports the dpkg package without the arch or path suffix", () => {
    // given
    const { run } = queries({ "dpkg-query": "omc-ai:amd64: /usr/bin/omc-missing-for-test" })

    // when / then
    expect(probePackageOwner("/usr/bin/omc-missing-for-test", "linux", run)).toEqual({ manager: "dpkg", pkg: "omc-ai" })
  })

  test("#given only rpm knows the path #then it reports rpm", () => {
    // given
    const { run } = queries({ rpm: "omc" })

    // when / then
    expect(probePackageOwner("/usr/bin/omc-missing-for-test", "linux", run)).toEqual({ manager: "rpm", pkg: "omc" })
  })

  test("#given no tool answers #then it fails open with undefined", () => {
    // given
    const { run, asked } = queries({})

    // when / then
    expect(probePackageOwner("/home/u/.local/bin/omc-missing-for-test", "linux", run)).toBeUndefined()
    expect(asked).toEqual(["pacman", "dpkg-query", "rpm"])
  })

  test("#given a Homebrew Cellar or nix store path #then it is recognized from the path without running any query", () => {
    // given
    const { run, asked } = queries({})

    // when / then
    expect(probePackageOwner("/opt/homebrew/Cellar/omc/5.1.19/bin/omc", "darwin", run)).toEqual({ manager: "brew", pkg: "omc" })
    expect(probePackageOwner("/nix/store/0123456789abcdfghijklmnpqrsvwxyz-omc-5.1.19/bin/omc", "linux", run)).toEqual({ manager: "nix", pkg: "omc-5.1.19" })
    expect(asked).toEqual([])
  })

  test("#given a darwin or windows path outside Cellar #then it runs no linux package query", () => {
    // given
    const { run, asked } = queries({ pacman: "never" })

    // when / then
    expect(probePackageOwner("/usr/local/bin/omc-missing-for-test", "darwin", run)).toBeUndefined()
    expect(probePackageOwner("C:\\Users\\u\\omc.exe", "win32", run)).toBeUndefined()
    expect(asked).toEqual([])
  })
})
