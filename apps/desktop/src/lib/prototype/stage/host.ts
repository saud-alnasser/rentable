import { BUILT_IN } from '@rentable/workspace-permission';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { mount } from 'svelte';

import type { Host } from '$lib/app/host';
import { fakeHost } from '$lib/app/tests/host.ts';
import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { fakeSettings } from '$lib/settings/tests/testing.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';
import Bar from './bar.svelte';
import { openStagedDatabase, type StagedDatabase } from './database';
import { hold } from './held';
import { answerWith } from './ipc';
import { writeRecords } from './record';
import { allStates, readSelection, type Selection, type State } from './state';

/**
 * THE STAGED HOST
 *
 * What `$lib/app/host` resolves to under `vite dev --mode stage` (`./vite.js`), and the whole of
 * what staging puts in place of the shell. It is the first module the root layout's composition
 * root imports, so its top-level `await` below runs before any procedure can.
 *
 * **Nothing here reaches anything real.** Every `invoke` the frontend makes lands in `mockIPC`,
 * which answers the workspace database from the in-memory engine (`./database`) and refuses every
 * other command by name. In the desktop window (`pnpm stage:open`) the one exception is the window
 * itself: shown, dragged, minimized, maximized and closed through the shell, since it holds no
 * data, and the shell behind it runs on a stage identifier of its own (`scripts/stage.mjs`).
 *
 * The host is `fakeHost()` from the tests, so the type checker holds it to the real port and each
 * member it does not answer refuses naming itself; the members startup needs are answered from the
 * mock organization below.
 */

type ShellInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

// the shell's own `invoke`, read before `mockIPC` replaces it: there is one in the desktop window,
// none in a browser.
const shell = (window as { __TAURI_INTERNALS__?: { invoke?: ShellInvoke } }).__TAURI_INTERNALS__
	?.invoke;

const selection = readSelection();
const states = allStates();
const state = states.find((each) => each.id === selection.state) ?? states[0];

const database = await openStagedDatabase();
await writeRecords(database.db, selection.language);

// a state whose records fail still boots, on the records written so far, and says why on the bar.
const failed = await state
	?.records?.(database.db)
	.then(() => null)
	.catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

installIpc(database);

export const host: Host = rejecting(stagedHost(selection, state));
state?.host?.(host);
hold(host);

mountBar(states, state, selection, failed ?? null);

// what `scripts/stage-shots.mjs` reads to enter each state; the bar says how far one has got.
Object.assign(window, {
	stage: { states: states.map(({ id, label, owner }) => ({ id, label, owner })) }
});

function stagedHost(selection: Selection, state: State | undefined): Host {
	const role = state?.member?.role ?? 'owner';
	const workspace = fakeOrganizationWorkspace({
		id: 'staged',
		name: selection.language === 'ar' ? 'عقارات الشمال' : 'North Properties',
		accessLevel: state?.member?.access ?? 'full-access'
	});
	const session = fakeOrganizationSession({
		organizationName: selection.language === 'ar' ? 'شركة الإيجار' : 'Acme Rentals',
		username: role === 'owner' ? 'olivia.owner' : 'sam.member',
		role,
		roleId: BUILT_IN[role].id,
		rank: BUILT_IN[role].rank,
		permissions: state?.member?.permissions ?? BUILT_IN[role].mask,
		workspaces: [workspace]
	});
	const organization = fakeOrganizationState({
		organizations: [fakeHeldOrganization({ role })],
		session
	});
	const sync = fakeSyncState({
		workspace: fakeWorkspace({ id: 'staged', remoteId: 'staged', name: workspace.name }),
		lastReachedAt: Date.now()
	});
	const settings = fakeSettings({
		locale: selection.language,
		appearance: selection.appearance,
		version: 'staged'
	});
	const base = fakeHost();
	const unlisten = async () => () => {};

	return {
		...base,
		window: {
			...base.window,
			show: frame('show'),
			hide: frame('hide'),
			minimize: frame('minimize'),
			maximize: frame('maximize'),
			drag: frame('drag'),
			close: frame('close')
		},
		// what the shell would write to the diagnostics file goes to the console: there is no file.
		diagnostics: {
			write: async (record) => console.info(`stage: diagnostics ${JSON.stringify(record)}`),
			directory: async () => ''
		},
		startup: {
			bootstrap: async () => ({
				targetVersion: '',
				previousVersion: '',
				updateError: null,
				status: 'obsolete',
				previousReleaseUrl: ''
			})
		},
		settings: {
			get: async () => settings,
			set: async (changeset) => Object.assign(settings, changeset)
		},
		workspace: {
			earlier: { ...base.workspace.earlier, find: async () => null }
		},
		update: {
			...base.update,
			check: async () => ({ outcome: 'noRelease' })
		},
		sync: {
			...base.sync,
			getState: async () => sync,
			replicate: async () => ({
				pushed: false,
				received: false,
				refusal: 'none',
				standing: 'held',
				heldByVersion: []
			}),
			push: async () => true
		},
		organization: {
			...base.organization,
			getState: async () => organization,
			linkTake: async () => null,
			onLink: unlisten,
			onMigration: unlisten,
			markGet: async () => null,
			renewDue: async () => false,
			workspace: {
				...base.organization.workspace,
				open: async () => workspace,
				query: async (_id, { sql, params }) => database.single(sql, params),
				batch: async (_id, queries) =>
					database.batch(queries.map((query) => ({ ...query, method: 'all' })))
			},
			upgrade: {
				...base.organization.upgrade,
				awaiting: async () => ({ organization: [], workspaces: {} })
			}
		}
	};
}

/**
 * the host with every refusing member refusing as the shell does, by a rejected promise.
 *
 * The test fakes throw where they are called, which a test wants; the app's own callers chain a
 * `.catch` onto a call to the shell, and a throw there escapes it and fails whatever called it, as
 * no shell call ever does.
 */
function rejecting<T>(port: T): T {
	if (typeof port === 'function') {
		return ((...args: unknown[]) => {
			try {
				return port(...args);
			} catch (error) {
				return Promise.reject(error);
			}
		}) as T;
	}

	if (port && typeof port === 'object') {
		return Object.fromEntries(
			Object.entries(port).map(([key, member]) => [key, rejecting(member)])
		) as T;
	}

	return port;
}

/** a command of the window's own: the window answers it where there is one, nothing where not. */
function frame(name: string) {
	return async () => {
		await shell?.(`plugin:frame|${name}`, {});
	};
}

function installIpc(database: StagedDatabase) {
	const answer = (command: string, payload: unknown) => {
		const args = (payload ?? {}) as Record<string, unknown>;

		// the database plugin's two commands, a statement and a batch, told apart by what they
		// carry: `platform/database/client.ts` is the one place that names them, and the client
		// it builds is the one whose statements pass the rewrite.
		if (command.startsWith('plugin:database|')) {
			if ('queries' in args) {
				return database.batch(args.queries as Parameters<StagedDatabase['batch']>[0]);
			}

			const { sql, params } = args.query as { sql: string; params: unknown[] };

			return database.single(sql, params);
		}

		// the window's own chrome asks these as it draws; in a browser there is no window.
		if (command.startsWith('plugin:frame|') || command.startsWith('plugin:window|')) {
			return null;
		}

		throw new Error(`stage: the shell command ${command} is not staged`);
	};

	// the application's own modules reach it through `./ipc.ts`; in a browser, what Tauri's own
	// modules send reaches it through the mocks, which cannot be installed over a shell's internals.
	answerWith(answer);
	if (shell) return;

	mockWindows('main');
	mockIPC(answer, { shouldMockEvents: true });
}

function mountBar(
	states: State[],
	state: State | undefined,
	selection: Selection,
	failed: string | null
) {
	const place = () =>
		mount(Bar, { target: document.body, props: { states, current: state, selection, failed } });

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
	else place();
}
