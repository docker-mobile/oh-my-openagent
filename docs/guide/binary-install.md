# Installing the compiled `omc` binary

Each GitHub Release of oh-my-cybersecurity attaches per-OS/arch single-file `omc` executables plus a `SHA256SUMS` checksum file. The binary is self-contained: it embeds the senpi engine, the omc plugin payload, and every runtime resource, and provisions them into `~/.omc/binary-runtime/<version>/` on first run. No node, npm, or bun install is required.

## One-line install (recommended)

[Install OmC](install.md) is the full guide: every platform, channels, fixing your `PATH`, updating and uninstalling.

```sh
curl -fsSL https://get.omc.nga.hm/install.sh | bash            # latest
curl -fsSL https://get.omc.nga.hm/install.sh | bash -s -- beta # beta channel, or pass a version such as 5.1.1
```

```powershell
irm https://get.omc.nga.hm/install.ps1 | iex
```

The script picks the asset for your OS, CPU, libc and AVX2 support (Rosetta shells get the Apple Silicon build), verifies it against the release `SHA256SUMS`, and installs it as `~/.local/bin/omc` (`%USERPROFILE%\.local\bin\omc.exe` on Windows). If that directory is not on `PATH` it adds a marked block to your shell profile (or your Windows user `PATH`). It writes a receipt to `~/.omc/install.json` and reports any npm `omc-ai` install it finds without removing it. It refuses to run as root.

Binaries come from the get.omc.nga.hm mirror, a Cloudflare R2 copy of each release behind the CDN. When the mirror does not have a version, or is unreachable, the script downloads the same file from GitHub Releases and verifies it the same way. Settings: `OMC_INSTALL_DIR` (install directory), `OMC_NO_MODIFY_PATH=1` (never edit profiles).

## Manual install (per OS)

Download the asset for your platform with `curl`, make it executable, and run it. Replace `<VERSION>` with the release tag (for example `5.0.0-beta.20`) and `<TARGET>` with your platform from the table below.

```sh
# macOS (Apple Silicon)
curl -Lo omc "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/omc-darwin-arm64"
chmod +x omc
./omc --version
```

```sh
# macOS (Intel)
curl -Lo omc "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/omc-darwin-x64"
chmod +x omc
./omc --version
```

```sh
# Linux x64 (glibc)
curl -Lo omc "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/omc-linux-x64"
chmod +x omc
./omc --version
```

```sh
# Linux ARM64 (glibc)
curl -Lo omc "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/omc-linux-arm64"
chmod +x omc
./omc --version
```

```sh
# Linux x64 (musl / Alpine)
curl -Lo omc "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/omc-linux-x64-musl"
chmod +x omc
./omc --version
```

```powershell
# Windows x64 (PowerShell)
curl.exe -Lo omc.exe "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/omc-windows-x64.exe"
.\omc.exe --version
```

Verify the download against the release checksums:

```sh
curl -LO "https://github.com/code-yeongyu/oh-my-cybersecurity/releases/download/v<VERSION>/SHA256SUMS"
shasum -a 256 -c SHA256SUMS --ignore-missing
```

## Platform targets

| Asset | Platform |
|-------|----------|
| `omc-darwin-arm64` | macOS Apple Silicon |
| `omc-darwin-x64` | macOS Intel |
| `omc-darwin-x64-baseline` | macOS Intel (older CPUs, no AVX2) |
| `omc-linux-x64` | Linux x64 (glibc) |
| `omc-linux-x64-baseline` | Linux x64 (glibc, no AVX2) |
| `linux-arm64` -> `omc-linux-arm64` | Linux ARM64 (glibc) |
| `omc-linux-x64-musl` | Linux x64 (musl / Alpine) |
| `omc-linux-x64-musl-baseline` | Linux x64 (musl, no AVX2) |
| `omc-linux-arm64-musl` | Linux ARM64 (musl / Alpine) |
| `omc-windows-x64.exe` | Windows x64 |
| `omc-windows-x64-baseline.exe` | Windows x64 (older CPUs, no AVX2) |
| `omc-windows-arm64.exe` | Windows ARM64 (true ARM64) |

## macOS: use curl, not a browser download

The binaries are unsigned. A binary downloaded through a web browser carries the `com.apple.quarantine` attribute and macOS Gatekeeper will suspend it on first run. `curl` does not attach that attribute, so installing with the `curl` commands above avoids the quarantine prompt entirely. Do not strip quarantine attributes with `xattr -d` as a workaround - that weakens the same protection on files that genuinely need it.

## First run: self-provisioning

On first run the binary writes its runtime to `~/.omc/binary-runtime/<version>/` (the engine, plugin, native PTY prebuild, themes, and assets) and re-executes from there. Subsequent runs start directly from the provisioned copy. This is normal and happens once per version.

## Updating

Re-run the one-line installer: it replaces the binary when the channel has a newer version and does nothing otherwise. For a manual install, download the new release's asset the same way and replace the binary; the `update` subcommand prints the exact `curl` command for your platform.

The compiled `omc update` trims `GH_TOKEN` and `GITHUB_TOKEN`, then uses `GH_TOKEN`, falling back to `GITHUB_TOKEN` when the primary variable is unset, empty, or whitespace-only. Without a token it queries anonymously, sharing GitHub's limit of 60 requests per hour per IP. If GitHub rejects a supplied token with HTTP 401, the updater retries once anonymously. If that retry also fails, the error names the token variables so you can replace or unset stale credentials. If the anonymous quota is exhausted, set either variable to a valid GitHub token and run `omc update` again. The public asset download command does not include the token.

## Notes and limits

- **Windows ARM64 is a true ARM64 binary.** This differs from the npm `oh-my-cybersecurity-windows-arm64` package, which ships an x64 binary under emulation. The release asset runs natively on ARM64 Windows.
- **`--inspect` / inspector mode is unsupported** in the compiled binaries; use the npm install for debugging with an inspector.
- **Beta and stable releases both carry these assets.** The compiled binary is the OmC Native edition; on stable releases it is still built from the beta-channel engine, so treat it as a beta-quality native build attached for convenience.
- **glibc floor:** the Linux glibc binaries inherit Bun's own glibc floor; older distributions should use the musl (Alpine) variants.
