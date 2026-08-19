import { connect, type DatabaseOpts } from '@tursodatabase/sync';

import type { Database } from '$lib/api/context';
import { createDatabase, type Method, type Query, type Row } from './client';

/**
 * HOSTED
 *
 * a workspace whose record of truth is remote, read and written through a replica on this
 * machine.
 *
 * It is **a third caller of `createDatabase`**, never a second kind of client
 * ([[rules/api-layer]], under *One database client type*): the two functions below carry a
 * statement to the replica and hand back rows in the shape the Rust proxy produces, so the
 * client this returns is the same `SqliteRemoteDatabase<typeof schema>` production and the
 * tests already use, running the same row mapping.
 *
 * Reads and writes both land in the replica, which is what keeps the application whole with no
 * network. Nothing here reaches the remote on the read or the write path — {@link
 * HostedReplica.push} and {@link HostedReplica.pull} are the only two calls that do, and they
 * are the caller's to make.
 */

/**
 * What the replica sends a statement through.
 *
 * Declared here rather than imported: `@tursodatabase/sync` types `prepare` as returning
 * `Promise<any>`, so naming the three members this file uses is what keeps the transport
 * annotated instead of untyped.
 */
type Statement = {
	raw(raw: boolean): Statement;
	columns(): { name: string }[];
	run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
	all(...params: unknown[]): Promise<unknown[]>;
	close(): Promise<void>;
};

type Replica = Awaited<ReturnType<typeof connect>>;

/**
 * What the replica reports about itself.
 *
 * Read off the client rather than imported: `@tursodatabase/sync` re-exports its option types
 * and not this one, and reaching past it into `@tursodatabase/sync-common` would name a package
 * this one only happens to depend on.
 */
type ReplicaStats = Awaited<ReturnType<Replica['stats']>>;

export type HostedReplicaOptions = {
	/**
	 * where the replica's files go. The engine writes several beside it — `-info`, `-wal` —
	 * so this is a prefix as much as a filename.
	 */
	path: string;
	/**
	 * the remote this replica is of, **as a function and never as a string**.
	 *
	 * Measured rather than preferred, and the type is where it is enforced. Handed a string
	 * naming a remote that cannot be reached, `connect()` throws and leaves no usable local
	 * database — so a fresh install on a disconnected machine is dead. Handed a function that
	 * answers `null` until the remote is known, the replica opens, takes writes, refuses to
	 * push with a message naming its own reason, and pushes those writes once the network
	 * arrives. It costs nothing and it is invisible until the day it matters.
	 *
	 * *Decision 11's question 3, answered against a live account at 0.7.2. The option that
	 * question was written against — `bootstrapIfEmpty` — is not in this version; the engine
	 * derives it from whether this function answers at open time.*
	 */
	url: () => string | null;
	/**
	 * the credential the remote is reached with.
	 *
	 * A function form is the one to prefer: the engine calls it per request, so a short-lived
	 * token can be renewed without the replica being rebuilt — rotation costs the same 63 bytes
	 * as not rotating, measured at 0.7.2. Absent while the workspace has no credential yet,
	 * which is the same state `url` answering `null` describes.
	 */
	authToken?: string | (() => Promise<string>);
	/** what this client calls itself to the remote; the engine appends its own unique suffix. */
	clientName?: string;
	/**
	 * every HTTP request the engine makes, where the caller wants one of its own — retries and
	 * backoff in the application, an unreachable remote in a test. Absent means the ambient
	 * `fetch`.
	 */
	fetch?: typeof fetch;
};

/**
 * a hosted workspace's replica: the one client type over it, and the three things only the
 * replica itself can answer.
 */
export type HostedReplica = {
	/**
	 * the database client, which is the same type every other client in this application is.
	 */
	db: Database;
	/**
	 * take whatever the remote has that this machine does not.
	 *
	 * @returns whether anything arrived. A caller that gets `true` has a database that changed
	 * underneath every derived status and every cached read.
	 */
	pull(): Promise<boolean>;
	/**
	 * send this machine's writes to the remote.
	 *
	 * **It throws rather than recovering**, including where the remote is simply not there —
	 * the refusal names its own reason. What the application does about a push that *fails* is
	 * not answered here and is not answered by the library either: `PushStatus::Conflict` has
	 * no recovery path at 0.7.2, and inventing one belongs in a ticket of its own.
	 */
	push(): Promise<void>;
	/** what the replica holds that the remote has not seen, and what the wire has cost. */
	stats(): Promise<ReplicaStats>;
	/** let go of the replica's files. */
	close(): Promise<void>;
};

/**
 * Opens the replica and builds the one client over it.
 *
 * It opens with no network — that is the whole point of `url` being a function — so a failure
 * here is a failure of the local files rather than of the remote.
 */
export async function connectHostedReplica(options: HostedReplicaOptions): Promise<HostedReplica> {
	const opts: DatabaseOpts = {
		path: options.path,
		url: options.url,
		authToken: options.authToken,
		clientName: options.clientName,
		fetch: options.fetch
	};

	const replica = await connect(opts);

	return {
		db: buildClient(replica),
		pull: () => replica.pull(),
		push: () => replica.push(),
		stats: () => replica.stats(),
		close: () => replica.close()
	};
}

function buildClient(replica: Replica): Database {
	return createDatabase(
		(sql, params, method) => single(replica, sql, params, method),
		(queries) => batch(replica, queries)
	);
}

/**
 * one statement against the replica, answered in the shape the Rust proxy returns — the column
 * names, and this row's values — so the production row mapping runs over them unchanged.
 */
async function single(
	replica: Replica,
	sql: string,
	params: unknown[],
	method: Method
): Promise<Row[]> {
	const statement = (await replica.prepare(sql)) as Statement;

	try {
		const bound = params.map(bind);

		if (method === 'run') {
			await statement.run(...bound);
			return [];
		}

		const columns = statement.columns().map((column) => column.name);
		const rows = (await statement.raw(true).all(...bound)) as unknown[][];

		return rows.map((values) => ({ columns, rows: values.map(carry) }));
	} finally {
		await statement.close();
	}
}

/**
 * a batch, in one transaction, as the Rust layer runs one.
 *
 * `deferred` is what `sqlx`'s `pool.begin()` issues on the local path, and matching it is what
 * keeps a procedure's cost the same in both modes. The engine returns a result set per
 * statement in order, empty for the ones that return no columns, which is exactly what the
 * mapping expects of a `run`.
 */
async function batch(replica: Replica, queries: Query[]): Promise<Row[][]> {
	const results = await replica.batch(
		queries.map((query) => ({ sql: query.sql, args: query.params.map(bind) })),
		{ mode: 'deferred', raw: true }
	);

	return results.map((result) =>
		result.rows.map((values) => ({
			columns: result.columns,
			rows: (values as unknown[]).map(carry)
		}))
	);
}

/**
 * a bound value, as the engine takes it.
 *
 * A boolean is the one thing that needs saying: the Rust proxy binds it as a boolean and SQLite
 * stores the integer, and this engine wants the integer. Everything else crosses as itself.
 */
function bind(param: unknown): unknown {
	return typeof param === 'boolean' ? Number(param) : param;
}

/**
 * a returned value, in the encoding the row mapping downstream already expects.
 *
 * The Rust proxy base64-encodes a blob rather than sending bytes, so this does too — a value
 * that arrived as one shape from Tauri and another from here would be a difference the single
 * client type was supposed to remove.
 */
function carry(value: unknown): unknown {
	return value instanceof Uint8Array ? base64(value) : value;
}

/**
 * Written out rather than taken from `Buffer`, which exists in one of the two runtimes a
 * replica can open in. `btoa` is in both.
 */
function base64(bytes: Uint8Array): string {
	let binary = '';

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}
