import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, type Client } from '@libsql/client';

import type { ConnectToWorkspaceDatabase } from '../migration.ts';

/**
 * Workspace databases that answer from files in a scratch directory, so the migration runner can
 * be driven against a real libSQL engine without a Turso account. *The control plane's own
 * fixture, kept with the runner it was written for.*
 */
export const workspaceDatabases = async () => {
	const directory = await mkdtemp(join(tmpdir(), 'workspace-databases-'));
	const clients: Client[] = [];
	const opened: string[] = [];

	// A file per url, named by it: Turso's hostnames are legal filenames once the dots are gone,
	// and two connections to one workspace have to reach one database or nothing is being tested.
	const fileFor = (url: string) => join(directory, `${url.replace(/[^a-z0-9]+/gi, '-')}.db`);

	const connect: ConnectToWorkspaceDatabase = ({ url }) => {
		opened.push(url);

		const client = createClient({ url: `file:${fileFor(url)}` });
		clients.push(client);

		return client;
	};

	return {
		connect,
		opened,
		/** what is in one of them afterwards, read with a client of the test's own. */
		open: (url: string) => {
			const client = createClient({ url: `file:${fileFor(url)}` });
			clients.push(client);

			return client;
		},
		close: async () => {
			for (const client of clients) {
				client.close();
			}

			await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
				() => {}
			);
		}
	};
};
