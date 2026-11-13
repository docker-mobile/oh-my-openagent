# Install OmC

One command installs the native `omc` binary for your OS and CPU. You don't need Node.js, npm or Bun.

<!-- install-tabs:start -->

**macOS, Linux, WSL**

```bash
curl -fsSL https://get.omc.nga.hm/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://get.omc.nga.hm/install.ps1 | iex
```

**Windows CMD**

```bat
powershell -ExecutionPolicy Bypass -c "irm https://get.omc.nga.hm/install.ps1 | iex"
```

<!-- install-tabs:end -->

The script picks the build for your OS, CPU and C library, checks it against the release `SHA256SUMS`, and installs it at `~/.local/bin/omc` (`%USERPROFILE%\.local\bin\omc.exe` on Windows). On WSL, run the macOS/Linux command inside your Linux distribution; it installs the Linux build there. The script refuses to run as root or as Administrator, so run it as your own user.

Binaries come from get.omc.nga.hm, a CDN copy of each GitHub release. When get.omc.nga.hm can't serve a file, the script downloads the same file from GitHub Releases and checks it the same way.

## Check the install

Open a **new** terminal, so it picks up the updated `PATH`, and run:

```bash
omc --version
```

It prints the installed version. Then open a project, run `omc`, and describe the job.

If the terminal says `omc: command not found` (or `omc is not recognized` on Windows), see [Fix your PATH](#fix-your-path).

## Fix your PATH

When `~/.local/bin` is not on your `PATH`, the installer adds it for you:

| Shell | File the installer edits |
| :--- | :--- |
| zsh | `~/.zshrc` (or `$ZDOTDIR/.zshrc`) |
| bash on macOS | `~/.bash_profile` |
| bash on Linux and WSL | `~/.bashrc` |
| fish | `~/.config/fish/conf.d/omc.fish` |
| any other shell | `~/.profile` |
| Windows | your User `PATH` environment variable |

On macOS, Linux and WSL the edit is a block between `# >>> omc installer >>>` and `# <<< omc installer <<<`, so running the installer again never adds a second copy. A terminal that was already open does not re-read that file. Open a new one, or add the directory to the current session:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

To add it yourself (for example after installing with `OMC_NO_MODIFY_PATH=1`):

```bash
# zsh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
# bash (use ~/.bash_profile on macOS)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
# fish
fish_add_path ~/.local/bin
```

```powershell
# Windows PowerShell
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::SetEnvironmentVariable('Path', "$userPath;$HOME\.local\bin", 'User')
```

On Windows the window you installed from can run `omc` right away. Other terminals see the new `PATH` after you open them again.

If `omc --version` prints something unexpected, another `omc` may come first on your `PATH`. `command -v omc` (macOS, Linux, WSL) or `Get-Command omc` (PowerShell) shows which one runs. The installer also reports an npm or Bun install of `omc-ai` it finds, and leaves it in place.

## Pick a channel or version

The installer follows the `latest` channel, the same release as `omc-ai@latest` on npm. Pass `beta` for the beta channel, or an exact version:

```bash
curl -fsSL https://get.omc.nga.hm/install.sh | bash -s -- beta
curl -fsSL https://get.omc.nga.hm/install.sh | bash -s -- 5.1.1
```

```powershell
& ([scriptblock]::Create((irm https://get.omc.nga.hm/install.ps1))) beta
```

Settings, read from the environment:

| Variable | Effect |
| :--- | :--- |
| `OMC_INSTALL_DIR` | Install directory (default `~/.local/bin`) |
| `OMC_NO_MODIFY_PATH=1` | Never edit shell profiles or the User `PATH` |
| `OMC_INSTALL_BASE_URL` | Download from another mirror instead of `https://get.omc.nga.hm` |

In a pipe, set the variable on the `bash` side: `curl -fsSL https://get.omc.nga.hm/install.sh | OMC_INSTALL_DIR="$HOME/bin" bash`.

## Update

Run the install command again. It replaces the binary when the channel has a newer version and does nothing otherwise.

## Uninstall

macOS, Linux and WSL:

```bash
rm ~/.local/bin/omc
rm -rf ~/.omc/binary-runtime ~/.omc/install.json
```

Then delete the `# >>> omc installer >>>` block from the shell file listed in [Fix your PATH](#fix-your-path).

Windows PowerShell:

```powershell
Remove-Item "$HOME\.local\bin\omc.exe"
Remove-Item -Recurse "$HOME\.omc\binary-runtime", "$HOME\.omc\install.json"
```

Then remove `%USERPROFILE%\.local\bin` from your User `PATH` if nothing else lives there.

`~/.omc` also holds your settings, sessions and memory. Delete the whole folder only if you want those gone too.

## Behind a proxy or offline

The installer needs HTTPS access to `get.omc.nga.hm`. If that fails, it falls back to `registry.npmjs.org` (to resolve the channel) and `github.com` (for the files). On macOS, Linux and WSL it downloads with `curl` (or `wget`), which honor the `https_proxy` / `HTTPS_PROXY` environment variables. Windows PowerShell uses the system proxy settings.

The binary is self-contained. On first run it unpacks its runtime into `~/.omc/binary-runtime/<version>/` without downloading anything, so it runs on a machine with no internet access. To install on such a machine, download the asset for your platform and `SHA256SUMS` from [GitHub Releases](https://github.com/code-yeongyu/oh-my-cybersecurity/releases) on a connected machine, verify it, and copy it to `~/.local/bin/omc`. The asset names and the manual steps are in the [compiled binary guide](https://github.com/code-yeongyu/oh-my-cybersecurity/blob/dev/docs/guide/binary-install.md). Teams with an internal mirror can point `OMC_INSTALL_BASE_URL` at a server that copies the `get.omc.nga.hm` paths (`/channels/<channel>`, `/v/<version>/<asset>`).

## Install with npm or Bun instead

The same OmC is published to npm as `omc-ai`:

```bash
bun add -g omc-ai
# or
npm i -g omc-ai
```

A package-manager install updates with `omc update` and uninstalls with `bun remove -g omc-ai` (or `npm uninstall -g omc-ai`). The unrelated `omc` package on npm belongs to someone else.

## Arch Linux: community AUR package

[`omc-bin`](https://aur.archlinux.org/packages/omc-bin) is a community package for Arch Linux and its derivatives, maintained by [@sTiKyt](https://github.com/sTiKyt), not by the OmC team. It downloads the official Linux binary for its version from our [GitHub Releases](https://github.com/code-yeongyu/oh-my-cybersecurity/releases) (`omc-linux-x64`, `omc-linux-x64-baseline` on CPUs without AVX2, or `omc-linux-arm64`), checks it against the SHA-256 in that release's `SHA256SUMS`, and installs it as `/usr/bin/omc`.

```bash
yay -S omc-bin   # or paru, or your AUR helper of choice
```

Update it with your AUR helper. `omc update` and the install command don't know about pacman yet: the install command would put a second `omc` in `~/.local/bin` instead of updating `/usr/bin/omc`. New releases reach the package when its maintainer updates it, so it can trail the `latest` channel. As with any AUR package, read the PKGBUILD before you build it. Uninstall with `sudo pacman -R omc-bin`.

Looking for the OpenCode or Codex plugin editions instead? See [Installation](installation.md).
