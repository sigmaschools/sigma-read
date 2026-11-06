#!/usr/bin/env bash
# Fails when a tracked file looks like it holds a password, key or other credential.
# Covers code, docs, config and scripts alike: a credential written anywhere in a
# repository is readable by everyone with access, and stays in git history.
#
# Credentials live in the hosting platform's environment variables or the team's
# password manager. Docs list usernames and roles only.
#
# A line that is a deliberate fake (a CI placeholder, a test fixture) can end with
# the marker  credential-check: allow  and is then skipped.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

patterns=(
  # A table with a Password column
  '^\|([^|]*\|)*[[:space:]]*pass(word|wd)[[:space:]]*\|'
  # "user@example.com / secret" sign-in pairs
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}[[:space:]]+/[[:space:]]+[^[:space:]/]+'
  # password: "secret", pwd = 'secret' in code or config (a quoted literal, not a variable)
  '(^|[[:space:]{,(])["'"'"']?(password|passwd|pwd|pw)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'`][^"'"'"'`[:space:]$]{4,}["'"'"'`]'
  # A literal handed to a hashing call
  '(bcrypt\.hash|hashPassword|hashSync)\([^,)]*["'"'"'`]'
  '(password|passwd|pwd)["'"'"']?[[:space:]]*[:=][[:space:]]*([A-Za-z_.]+[[:space:]]*\+[[:space:]]*["'"'"'`]|`[^`]*\$\{)'
  # Known key formats
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'sk-[A-Za-z0-9]{32,}'
  'AIza[0-9A-Za-z_-]{35}'
  'gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  're_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}'
  '(sr_live|cak|cop)_[A-Za-z0-9_-]{20,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  # A database URL with a password in it
  '(postgres|postgresql|mysql|mongodb(\+srv)?)://[^:/[:space:]]+:[^@[:space:]]+@'
)

regex=$(IFS='|'; echo "${patterns[*]}")

# Lock files and this script are skipped; everything else that git tracks is checked.
matches=$(git grep -n -I -i -E "$regex" -- . \
  ':!package-lock.json' ':!**/package-lock.json' ':!go.sum' \
  ':!scripts/check-no-credentials.sh' ':!tools/check-no-credentials.sh' ':!tests/check-no-credentials.sh' \
  | grep -v -i 'credential-check: allow' \
  | grep -v -E '://[^:/[:space:]]+:[^@[:space:]]+@(localhost|127\.0\.0\.1)[:/]' || true)

# In prose (Markdown and text), an unquoted "Password: secret" or "password - secret" too
prose=$(git grep -n -I -i -E '(^|[^A-Za-z_-])(password|passwd|pwd)[*_]*([[:space:]]*[:=]|[[:space:]]+-[[:space:]])[*_`[:space:]]*[A-Za-z0-9!@#%^&*._-]{4,}' -- '*.md' '*.txt' \
  | grep -v -i 'credential-check: allow' || true)
matches=$(printf '%s\n%s' "$matches" "$prose" | sed '/^$/d')

if [[ -n "$matches" ]]; then
  echo "Possible credentials in tracked files:"
  echo "$matches"
  echo
  echo "Move the value to an environment variable or the team's password manager."
  echo "If a line is a deliberate fake, end it with: credential-check: allow"
  exit 1
fi
echo "No credentials found in tracked files."
