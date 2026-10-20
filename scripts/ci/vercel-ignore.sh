#!/usr/bin/env bash
# Vercel runs this (vercel.json "ignoreCommand") before it builds. Exit 0 = skip the build, exit 1 = build.
#
# Each build costs build CPU, and puts the CDN and ISR caches back to empty (the share cards and pages are then drawn again). Two kinds of push do
# not change what visitors see, so they do not need one:
#   - a push that only touches notes, docs, tests, helper scripts or CI config;
#   - a branch (preview) push, unless the commit message says [preview] or the project sets VERCEL_BUILD_PREVIEWS=1.
# Anything this cannot decide, such as a missing base commit, builds: a wasted build is cheaper than a stale site.
set -u

build() { echo "ignore-step: building ($1)"; exit 1; }
skip() { echo "ignore-step: skipping ($1)"; exit 0; }

branch="${VERCEL_GIT_COMMIT_REF:-}"
msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"

if [ "${VERCEL_ENV:-}" != "production" ] && [ "${VERCEL_BUILD_PREVIEWS:-}" != "1" ]; then
  case "$msg" in
    *"[preview]"*) ;;
    *) skip "preview of ${branch:-a branch}; add [preview] to the commit message, or set VERCEL_BUILD_PREVIEWS=1, to build one" ;;
  esac
fi

sha="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ]; then base="${sha}^"; fi

# The base commit may be missing from a shallow clone.
if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=50 origin "${base}" 2>/dev/null || true
fi
git cat-file -e "${base}^{commit}" 2>/dev/null || build "cannot find the last deployed commit"
git cat-file -e "${sha}^{commit}" 2>/dev/null || build "cannot find this commit"

changed="$(git diff --name-only "$base" "$sha" 2>/dev/null)" || build "cannot compare with the last deployed commit"
[ -n "$changed" ] || skip "no files changed since the last deployed commit"

# Files that do not reach a visitor: nothing here is imported by the site or served from public/.
if printf '%s\n' "$changed" | grep -Ev '^(docs|notes|guides|tests|scripts|\.github)/|^[^/]+\.md$|^\.gitignore$|^\.gitattributes$' | grep -q .; then
  build "site files changed"
fi
skip "only notes, tests, scripts or CI files changed"
