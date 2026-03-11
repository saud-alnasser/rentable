import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

config({ override: false, quiet: true });

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const tauriArgs = ['exec', 'tauri', ...process.argv.slice(2)];

const result = spawnSync(pnpmCommand, tauriArgs, {
	cwd: process.cwd(),
	env: process.env,
	shell: process.platform === 'win32',
	stdio: 'inherit'
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
