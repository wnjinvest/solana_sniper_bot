#!/usr/bin/env node
// Genereert een nieuwe CHANGELOG-sectie op basis van git log (conventional commits).
// Gebruik: node scripts/update-changelog.js <version>

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) { console.error('Geef een versie mee: node update-changelog.js 0.2.0'); process.exit(1); }

const date = new Date().toISOString().split('T')[0];
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

// Commits ophalen sinds laatste tag (of initiële commit)
let since;
try {
  since = execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf8' }).trim();
} catch {
  since = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
}

const log = execSync(`git log ${since}..HEAD --oneline --no-merges`, { encoding: 'utf8' });
const commits = log.trim().split('\n').filter(Boolean);

if (!commits.length) {
  console.log('Geen nieuwe commits gevonden voor changelog.');
  process.exit(0);
}

const groups = { feat: [], fix: [], refactor: [], docs: [], chore: [] };
const labels = { feat: 'Toegevoegd', fix: 'Opgelost', refactor: 'Verbeterd', docs: 'Documentatie', chore: 'Overig' };

for (const line of commits) {
  // Sla auto-sync commits over
  if (line.includes('auto-sync')) continue;
  const m = line.match(/^[a-f0-9]+ (feat|fix|refactor|docs|chore)[:(]/);
  if (m) {
    const msg = line.replace(/^[a-f0-9]+ \w+\([^)]*\): /, '').replace(/^[a-f0-9]+ \w+: /, '');
    groups[m[1]].push(`- ${msg}`);
  }
}

let entry = `## [${version}] — ${date}\n`;
for (const [type, items] of Object.entries(groups)) {
  if (items.length) entry += `\n### ${labels[type]}\n${items.join('\n')}\n`;
}

const existing = fs.readFileSync(changelogPath, 'utf8');
const firstNewline = existing.indexOf('\n');
const newContent = existing.slice(0, firstNewline + 1) + '\n' + entry + existing.slice(firstNewline + 1);
fs.writeFileSync(changelogPath, newContent);

console.log(`CHANGELOG.md bijgewerkt met v${version}`);
