/* eslint-disable @typescript-eslint/no-require-imports */

const { execSync } = require('node:child_process');
const { version } = require('../package.json');

const tag = `v${version}`;

execSync('git fetch --tags --force', { stdio: 'inherit' });

try {
	execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
	console.log(`tag ${tag} already exists; skipping publish step.`);
	process.exit(0);
} catch {}

execSync(`git tag ${tag}`, { stdio: 'inherit' });
execSync(`git push origin ${tag}`, { stdio: 'inherit' });
