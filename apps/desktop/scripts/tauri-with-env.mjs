import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Both the `.env` read and the CLI's own project discovery are anchored to this package
// rather than to whatever directory the caller happened to be in. The Tauri CLI finds its
// `tauri.conf.json` by walking from the working directory, so an inherited cwd is what
// decides which configuration a build reads — and `--config` cannot pin it, because that
// flag merges over the discovered file rather than replacing the discovery.
const packageRoot = join(import.meta.dirname, '..');

config({ path: join(packageRoot, '.env'), override: false, quiet: true });

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const tauriArgs = ['exec', 'tauri', ...process.argv.slice(2)];

const result = spawnSync(pnpmCommand, tauriArgs, {
	cwd: packageRoot,
	env: process.env,
	shell: process.platform === 'win32',
	stdio: 'inherit'
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
