import { Refusal, WORKSPACE_UNAVAILABLE } from './failure.ts';

/**
 * Turso's Platform API, as this service uses it.
 *
 * **A port, not a client.** Everything below is reached through this shape, so the tests run the
 * real routes and the real database logic against a Turso that answers in memory — and the one
 * place a live account is touched is the wiring in `./main.ts`. It is the same reason
 * `verifyIdentity` is an argument: a control plane whose tests need somebody's cloud account is a
 * control plane nobody runs the tests of.
 *
 * Verified against the published API 2026-08-18, and against the decision 11 prototype, which
 * created a database and minted tokens from one Platform API credential —
 * `[[efforts/a-workspace-follows-its-user/evidence/prototypes/turso-sync-against-a-live-database]]`.
 */
export type WorkspaceDatabase = {
	/** the database's name in the organization, which is what every other call names it by. */
	name: string;
	/** what a client syncs against, without a scheme. `libsql://` is prepended by the caller. */
	hostname: string;
};

export type TursoPlatform = {
	createDatabase: (name: string) => Promise<WorkspaceDatabase>;
	/**
	 * A token for one database, expiring after `expiration` — Turso's own duration spelling,
	 * `3d` and the like. **`full-access` is the only useful authorization**: decision 01 found the
	 * Platform API's mint exposes `full-access | read-only` and nothing finer, and decision 05
	 * settled that membership grants full access to a workspace's data anyway.
	 */
	mintToken: (databaseName: string, expiration: string) => Promise<string>;
	/**
	 * best-effort cleanup, used where a database was created and the workspace it was for was not.
	 *
	 * **Best-effort is not a hedge here — it is known to fail on some accounts.** Turso refuses to
	 * delete any database inside a group that is delete-protected, and answers `403 group <name>
	 * is delete-protected and cannot be deleted` even though the database itself is not protected.
	 * Measured against a live account 2026-08-18. Where that is how the group is configured, an
	 * interrupted creation leaves a database behind and the caller sees it in the log.
	 */
	deleteDatabase: (name: string) => Promise<void>;
};

export const TURSO_PLATFORM_API = 'https://api.turso.tech';

type PlatformConfiguration = {
	apiToken: string;
	organization: string;
	/** the group the workspace databases are created in. Turso requires an existing one. */
	group: string;
	baseUrl?: string;
	fetch?: typeof fetch;
};

/**
 * Its own code rather than Google's: the cause is not Google, and a client that cannot tell them
 * apart cannot say anything useful about either.
 *
 * **Two shapes, and the live run of 2026-08-18 is why.** A network failure or a 5xx is a moment
 * that will pass. A 4xx is Turso saying no on purpose — a group that does not exist, a name
 * already taken, a group that is delete-protected — and none of those is fixed by asking again.
 * Telling somebody to retry something that cannot succeed is worse than saying nothing.
 */
const unreachable = (what: string) =>
	new Refusal(WORKSPACE_UNAVAILABLE, 503, `could not ${what} just now. try again in a moment`);

const refused = (what: string) =>
	new Refusal(WORKSPACE_UNAVAILABLE, 502, `could not ${what}. trying again will not help`);

export const tursoPlatform = ({
	apiToken,
	organization,
	group,
	baseUrl = TURSO_PLATFORM_API,
	fetch: request = fetch
}: PlatformConfiguration): TursoPlatform => {
	const organizationUrl = `${baseUrl}/v1/organizations/${organization}`;

	const call = async (what: string, url: string, init: RequestInit): Promise<unknown> => {
		let response: Response;

		try {
			response = await request(url, {
				...init,
				headers: { authorization: `Bearer ${apiToken}`, ...init.headers }
			});
		} catch {
			throw unreachable(what);
		}

		if (!response.ok) {
			// Turso's own message names a database and sometimes an organization. It goes to this
			// process's log and never to the caller, who is asking about a workspace rather than
			// about the infrastructure underneath it.
			console.error(`turso refused to ${what}`, response.status, await response.text());
			throw response.status < 500 ? refused(what) : unreachable(what);
		}

		return response.json().catch(() => ({}));
	};

	return {
		createDatabase: async (name) => {
			const body = (await call('create the workspace database', `${organizationUrl}/databases`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, group })
			})) as { database?: { Hostname?: unknown; hostname?: unknown } };

			// Both spellings are read, and only one of them is documented. Turso's reference gives
			// `Hostname` with a capital — a Go struct field showing through — which is unusual
			// enough that a change to it would be a silent total failure of the one route this
			// service exists for. Accepting either costs a `??`.
			const hostname = body.database?.Hostname ?? body.database?.hostname;

			if (typeof hostname !== 'string' || hostname.trim() === '') {
				console.error('turso created a database and named no hostname', body);
				throw unreachable('create the workspace database');
			}

			return { name, hostname };
		},

		mintToken: async (databaseName, expiration) => {
			const url = new URL(`${organizationUrl}/databases/${databaseName}/auth/tokens`);
			url.searchParams.set('expiration', expiration);
			url.searchParams.set('authorization', 'full-access');

			const body = (await call('mint a token for this workspace', url.toString(), {
				method: 'POST'
			})) as { jwt?: unknown };

			if (typeof body.jwt !== 'string' || body.jwt.trim() === '') {
				console.error('turso minted a token and returned no jwt');
				throw unreachable('mint a token for this workspace');
			}

			return body.jwt;
		},

		deleteDatabase: async (name) => {
			await call('remove the workspace database', `${organizationUrl}/databases/${name}`, {
				method: 'DELETE'
			});
		}
	};
};
