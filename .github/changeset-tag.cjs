/* eslint-disable @typescript-eslint/no-require-imports */

const { execSync } = require('node:child_process');
// `<name>@<version>` — changesets' own convention for a package in a workspace, so a second
// publishable package tags itself without colliding with this one. The name is read rather
// than spelled here: a tag that disagrees with the package it came from is a release nobody
// can trace back.
//
// **The tag is not part of the updater contract**, despite carrying the version. Installed
// applications poll `releases/latest/download/latest.json`, which GitHub resolves through its
// latest-release pointer — sorted by date, drafts and prereleases excluded, tag name never
// consulted — and the version they compare against is the one tauri-action reads from the app
// rather than from this tag. What the contract does hold is the endpoint, that field, and the
// signing key. See the effort's `evidence/research/the-updater-contract`.
const { name, version } = require('../apps/desktop/package.json');

const tag = `${name}@${version}`;

execSync('git fetch --tags --force', { stdio: 'inherit' });

try {
	execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
	console.log(`tag ${tag} already exists; skipping publish step.`);
	process.exit(0);
} catch {
	console.log(`tag ${tag} does not exist yet; creating it.`);
}

execSync(`git tag ${tag}`, { stdio: 'inherit' });
execSync(`git push origin ${tag}`, { stdio: 'inherit' });
