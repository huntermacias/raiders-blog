#!/usr/bin/env bash
# Pushes the data commit the job just made, even when main has moved.
#
# usage: bash scripts/ci/push-data.sh <path> [<path> ...]
#
# The data jobs rebuild their files from scratch, so a plain `git pull --rebase`
# has nothing to merge, only a fight: when someone else (or another data job)
# changed the same file, the rebase stops on a conflict, and retrying it fails
# the same way every time. Instead, when the push is rejected this keeps the
# job's own copy of its paths, resets to the new main, puts those paths back and
# commits again with the same message. The job's files win; everything else on
# main is left exactly as it is.
set -u
branch="${GITHUB_REF_NAME:-main}"
msg="$(git log -1 --format=%B)"
paths=("$@")
[ "${#paths[@]}" -gt 0 ] || { echo "no paths given" >&2; exit 2; }

for i in 1 2 3 4 5; do
  if git push origin "HEAD:${branch}"; then exit 0; fi
  echo "Push rejected (attempt $i): main moved. Rebuilding the commit on top of it."
  git fetch --quiet origin "${branch}" || { sleep $((i * 4)); continue; }

  keep="$(mktemp -d)"
  for p in "${paths[@]}"; do
    if [ -e "$p" ]; then mkdir -p "$keep/$(dirname "$p")"; cp -R "$p" "$keep/$p"; fi
  done

  git rebase --abort >/dev/null 2>&1 || true
  git reset --quiet --hard "origin/${branch}"

  for p in "${paths[@]}"; do
    if [ -e "$keep/$p" ]; then
      rm -rf "$p"; mkdir -p "$(dirname "$p")"; cp -R "$keep/$p" "$p"
    fi
  done
  rm -rf "$keep"

  git add -A -- "${paths[@]}"
  if git diff --cached --quiet; then
    echo "Main already has these files as they are. Nothing to push."
    exit 0
  fi
  git commit --quiet -m "$msg"
  sleep $((i * 3))
done
echo "Gave up after 5 attempts." >&2
exit 1
