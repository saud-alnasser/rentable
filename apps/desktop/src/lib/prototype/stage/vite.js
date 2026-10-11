import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workspaceMigrationsFolder } from '@rentable/workspace-migrations';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../..');
const appHost = path.join(lib, 'app', 'host.ts');
const stageHost = path.join(here, 'host.ts');
const held = path.join(here, 'held.ts').split(path.sep).join('/');

const MIGRATIONS = 'virtual:stage-migrations';
const ADAPTER = 'stage-adapter:';

/**
 * Every feature whose `tauri.ts` is its port's Tauri adapter, and so a way to the shell besides
 * the composed host: the query reading the organization's state calls its adapter directly.
 */
const ADAPTERS = [
	'organization',
	'platform',
	'print',
	'settings',
	'startup',
	'sync',
	'transfer',
	'update',
	'workspace'
];

/** @param {string} a @param {string} b */
const same = (a, b) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();

/**
 * The seam staging runs through, and the whole of it.
 *
 * **The cut is the shell.** Everything past `@tauri-apps/api/core`'s `invoke` is what reaches the
 * owner's database, credentials, session and sync, so staging runs the frontend on the dev server
 * with no Tauri process at all. Two kinds of module are swapped: the host the composition root
 * binds (`$lib/app/host`), for `./host.ts`, which answers it from mock data and installs the IPC
 * mocks every remaining `invoke` lands in; and each feature's Tauri adapter (`$lib/<feature>/tauri`),
 * which some reads call directly, for the matching port of that same host. No product module knows
 * staging exists.
 *
 * **Applied only to `vite dev --mode stage`**, so a build, a test run and the ordinary dev server
 * resolve every module exactly as before, and nothing under this directory enters a bundle.
 *
 * The migrations reach the browser through a virtual module rather than a glob, because they live
 * in a package outside this one's root and the dev server serves nothing from there.
 *
 * @returns {import('vite').Plugin}
 */
export function stage() {
	return {
		name: 'rentable:stage',
		enforce: 'pre',
		apply: (_config, env) => env.command === 'serve' && env.mode === 'stage',
		config: () => ({
			// its own port, so staging runs beside a dev run of the app rather than refusing to start.
			server: { port: 1430, strictPort: true }
		}),
		async resolveId(source, importer, options) {
			if (source === MIGRATIONS) return `\0${MIGRATIONS}`;
			if (!importer || !/(host|tauri)(\.ts)?$/.test(source)) return null;
			if (same(importer.split('?')[0], stageHost)) return null;

			const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
			if (!resolved) return null;

			const file = resolved.id.split('?')[0];
			if (same(file, appHost)) return stageHost;

			const feature = ADAPTERS.find((name) => same(file, path.join(lib, name, 'tauri.ts')));

			return feature ? `\0${ADAPTER}${feature}` : null;
		},
		load(id) {
			if (id.startsWith(`\0${ADAPTER}`)) {
				const feature = id.slice(ADAPTER.length + 1);
				const port = feature === 'platform' ? 'host' : `host[${JSON.stringify(feature)}]`;

				// read at the call rather than bound at import, for the reason `./held.ts` gives.
				return [
					`import { heldHost } from ${JSON.stringify(held)};`,
					`export const tauri = new Proxy({}, { get: (_, key) => { const host = heldHost(); return ${port}[key]; } });`
				].join('\n');
			}

			if (id !== `\0${MIGRATIONS}`) return null;

			const folder = fileURLToPath(workspaceMigrationsFolder);
			const files = readdirSync(folder)
				.filter((name) => name.endsWith('.sql'))
				.sort();

			return `export default ${JSON.stringify(files.map((file) => readFileSync(path.join(folder, file), 'utf8')))};`;
		}
	};
}
