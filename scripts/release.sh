#!/usr/bin/env bash
# Pro-release: versie bump + changelog genereren + tag + push naar GitHub.
# Gebruik: bash scripts/release.sh [patch|minor|major]
# Standaard: patch

set -e
cd "$(dirname "$0")/.."

BUMP=${1:-patch}

# Versie verhogen in beide package.json's
cd bot     && npm version "$BUMP" --no-git-tag-version --silent && cd ..
cd dashboard && npm version "$BUMP" --no-git-tag-version --silent && cd ..

VERSION=$(node -p "require('./bot/package.json').version")

echo "Releasen als v${VERSION}..."

# Changelog genereren
node scripts/update-changelog.js "$VERSION"

# Alles stagen + committen
git add -A
git commit -m "release: v${VERSION}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# Tag aanmaken + pushen
git tag "v${VERSION}"
git push origin HEAD
git push origin "v${VERSION}"

echo ""
echo "✓ Release v${VERSION} gepubliceerd op GitHub."
