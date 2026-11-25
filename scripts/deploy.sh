#!/bin/sh
# Builds the site and publishes it to the gh-pages branch, which GitHub Pages serves:
# the app at /flower/ and the launch-film renderer at /flower/film/.
set -e
cd "$(dirname "$0")/.."
repo=$(pwd)
base=${BASE_PATH:-/flower}

NEXT_PUBLIC_BASE_PATH="$base" npx next build
( cd film && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && sh build.sh )

site=$(mktemp -d)
if git fetch -q origin gh-pages 2>/dev/null; then
  git worktree add -q --detach "$site" origin/gh-pages
else
  git worktree add -q --detach "$site" HEAD          # first deploy: start gh-pages with no history of its own
  git -C "$site" checkout -q --orphan gh-pages
fi
cd "$site"
git rm -rqf --ignore-unmatch .
cp -R "$repo/out/." .
mkdir -p film
cp "$repo/film/artifact/index.html" "$repo/film/artifact/app.js" "$repo/film/artifact/app.css" film/
touch .nojekyll
git add -A
if git commit -q -m "Deploy $(git -C "$repo" rev-parse --short HEAD)"; then git push -q origin HEAD:gh-pages && echo "deployed"; else echo "site already up to date"; fi
cd "$repo"
git worktree remove --force "$site"
