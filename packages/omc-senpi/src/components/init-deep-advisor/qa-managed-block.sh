#!/usr/bin/env bash
set -euo pipefail
TMPREPO=$(mktemp -d)
trap 'rm -rf "$TMPREPO"' EXIT
cd "$TMPREPO"
git init >/dev/null
git -c user.name=QA -c user.email=qa@example.invalid -c commit.gpgsign=false commit --allow-empty -m init >/dev/null
echo 'user-line' > .git/info/exclude
EXCLUDE=$(git rev-parse --git-path info/exclude)
mkdir -p "$(dirname "$EXCLUDE")"
grep -q '# >>> omc-senpi' "$EXCLUDE" || printf '# >>> omc-senpi init-deep local (managed)\n/.omc/init-deep.json\nAGENTS.md\n# <<< omc-senpi init-deep local (managed)\n' >> "$EXCLUDE"
grep -q '# >>> omc-senpi' "$EXCLUDE" || printf '# >>> omc-senpi init-deep local (managed)\n/.omc/init-deep.json\nAGENTS.md\n# <<< omc-senpi init-deep local (managed)\n' >> "$EXCLUDE"
test "$(grep -c '# >>> omc-senpi' "$EXCLUDE")" -eq 1
test "$(grep -c '# <<< omc-senpi' "$EXCLUDE")" -eq 1
grep -q 'user-line' "$EXCLUDE"
test $? -eq 0
