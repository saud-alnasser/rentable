/**
 * FILL THE ORGANIZATION WITH ROLES, MEMBERS AND WORKSPACES, THROUGH THE RUNNING APP
 *
 * **No script can write these rows, so this one asks the app to.** A role and a member are signed
 * along the chain and a member carries a vault sealed under keys only a signed-in owner's running
 * app holds. The records seed opens the workspace replica and writes rows; here there is nothing a
 * script could write that the app would then verify. So the seed reaches the development app over
 * the webview's remote debugging port (Chrome DevTools Protocol) and calls its own commands, the
 * same `plugin:organization|...` calls the settings screens make, as the signed-in member.
 *
 * **Every workspace it makes is a real hosted database on the owner's Turso account**, made by
 * `workspace_create` exactly as the directory's own button makes one, so the list is a fixed dozen
 * rather than a number to turn up, and only the owner's machine can make them at all.
 *
 * **It never reads the vault or the keyring and carries no credential.** Everything secret stays on
 * the app's side of `invoke`.
 *
 * **Safe to run twice.** A role name, a username, a workspace name or a grant already there is
 * skipped, compared without case
 * as the app compares usernames, so a second run creates nothing and says so.
 *
 * **It never fails the records seed.** Where no app answers on the port, or nobody is signed in, or
 * the platform's webview opens no port, it says so in one sentence and returns.
 */

/** one call into the running app: `name` is the command without its `plugin:organization|`. */
export type Invoke = (name: string, args?: Record<string, unknown>) => Promise<unknown>;

/** reach the app and hand back a way to call it, or throw `Unreachable` saying why not. */
export type Connect = () => Promise<{ invoke: Invoke; close: () => void }>;

export class Unreachable extends Error {}

/** what the app refused with: its sentence, and the reason it names where it names one. */
export class Refusal extends Error {
	constructor(
		message: string,
		readonly reason?: string
	) {
		super(message);
	}
}

type RoleRow = { id: string; kind: string; name: string; mask: number; rank: number };
type MemberRow = {
	id: string;
	username: string;
	roleId: string;
	workspaces?: { id: string; access: string }[];
};
type SessionWorkspace = { id: string; name: string };
type OrganizationState = {
	session: { username: string; workspaces: SessionWorkspace[] } | null;
};

type Access = 'full-access' | 'read-only';

/** a dozen custom roles, in the order they stand below the manager. */
export const ROLE_NAMES = [
	'Regional lead',
	'Property manager',
	'Leasing agent',
	'Accountant',
	'Bookkeeper',
	'Collector',
	'Auditor',
	'Legal',
	'Maintenance lead',
	'Front desk',
	'Analyst',
	'Assistant'
] as const;

/**
 * Thirty members. `role` is `manager`, `member`, or an index into `ROLE_NAMES`; `access` is the
 * grant on the current workspace, or `null` for none.
 */
export const MEMBERS: {
	username: string;
	role: 'manager' | 'member' | number;
	access: Access | null;
}[] = [
	'aisha.rahman',
	'omar.khalid',
	'layla.hassan',
	'yusuf.nasser',
	'mariam.saleh',
	'khalid.amin',
	'noura.fahad',
	'faisal.qasim',
	'huda.mansour',
	'tariq.zaid',
	'salma.harbi',
	'hamza.otaibi',
	'reem.ghamdi',
	'ziad.mutairi',
	'dana.shehri',
	'bilal.anzi',
	'lina.dosari',
	'saad.qahtani',
	'hind.shammari',
	'majed.zahrani',
	'rana.subaie',
	'nawaf.harthi',
	'jana.malki',
	'adel.juhani',
	'ghada.rashid',
	'fahd.sulami',
	'amal.bishi',
	'samir.yami',
	'wafa.jaber',
	'rayan.asmari'
].map((username, index) => ({
	username,
	role: index < 4 ? 'manager' : index < 10 ? 'member' : (index - 10) % ROLE_NAMES.length,
	access: (['full-access', 'read-only', null] as const)[index % 3]
}));

/**
 * A dozen workspaces, each a hosted database on the owner's account. The grants below put a few
 * members in each, some read only, and leave the last with nobody but the owner.
 */
export const WORKSPACE_NAMES = [
	'Olaya Towers',
	'Al Malqa Villas',
	'Hittin Residences',
	'Al Nakheel Plaza',
	'King Fahd Offices',
	'Al Yasmin Compound',
	'Diriyah Gate Lofts',
	'Al Wurud Apartments',
	'Granada Business Park',
	'Al Sahafa Homes',
	'Qurtubah Gardens',
	'Al Rawdah Court'
] as const;

/** the grants into the seeded workspaces: three members each, the middle one read only. */
export const GRANTS: { workspace: string; username: string; access: Access }[] =
	WORKSPACE_NAMES.slice(0, -1).flatMap((workspace, place) =>
		[0, 1, 2].map((offset) => ({
			workspace,
			username: MEMBERS[(place * 3 + offset * 7) % MEMBERS.length].username,
			access: offset === 1 ? ('read-only' as const) : ('full-access' as const)
		}))
	);

/**
 * A custom role's mask: everything the member preset carries and some of what only the manager
 * carries, so it stands between the two. Which of the manager's extra flags it takes is fixed by
 * its place, never empty and never all of them, so each role reads differently on its card.
 */
export function roleMask(memberMask: number, managerMask: number, place: number): number {
	const member = BigInt(memberMask);
	const extra = BigInt(managerMask) & ~member;
	const bits: bigint[] = [];

	for (let bit = 0n; extra >> bit > 0n; bit++) {
		if ((extra >> bit) & 1n) {
			bits.push(1n << bit);
		}
	}

	let chosen = bits.filter((_, index) => (index * 5 + place * 7) % 12 < 3 + (place % 6));

	if (chosen.length === 0 && bits.length > 0) {
		chosen = [bits[place % bits.length]];
	}

	if (chosen.length === bits.length && bits.length > 1) {
		chosen = chosen.filter((_, index) => index !== place % chosen.length);
	}

	// masks run past 2^32, so they are built as BigInt and cross as a Number, exact below 2^53
	return Number(chosen.reduce((mask, bit) => mask | bit, member));
}

export type OrganizationOutcome =
	| {
			status: 'seeded';
			rolesCreated: number;
			membersCreated: number;
			workspacesCreated: number;
			grantsMade: number;
			failures: string[];
	  }
	| { status: 'skipped'; reason: string };

/** what the app answered a refusal with, as one line. */
function describe(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'object' && error && 'message' in error) {
		return String(error.message);
	}

	return typeof error === 'string' ? error : JSON.stringify(error);
}

/**
 * Seed the organization through `invoke`: the roles first, each chained below the one before it
 * starting from the manager (a custom role is placed directly below `afterRoleId`, and below the
 * member preset is refused), then the members in their roles with their grants on the current
 * workspace, then the workspaces, then the members' grants into those.
 */
export async function seedOrganization(
	invoke: Invoke,
	options: { workspaceId?: string | null; log?: (line: string) => void } = {}
): Promise<OrganizationOutcome> {
	const log = options.log ?? console.log;
	const state = (await invoke('session_state_get')) as OrganizationState;

	if (!state?.session) {
		return {
			status: 'skipped',
			reason: 'nobody is signed in to the running app, so the organization was not seeded'
		};
	}

	const workspaces = state.session.workspaces ?? [];
	const workspace =
		workspaces.find((candidate) => candidate.id === options.workspaceId) ?? workspaces[0] ?? null;

	const roles = (await invoke('role_list')) as RoleRow[];
	const manager = roles.find((role) => role.kind === 'manager');
	const member = roles.find((role) => role.kind === 'member');

	if (!manager || !member) {
		return {
			status: 'skipped',
			reason: 'the role list has no manager or member preset, so no role has a place to go'
		};
	}

	const failures: string[] = [];
	const roleIds = new Map(roles.map((role) => [role.name.trim().toLowerCase(), role.id]));
	let rolesCreated = 0;
	let previous = manager.id;

	for (const [place, name] of ROLE_NAMES.entries()) {
		const existing = roleIds.get(name.toLowerCase());

		if (existing) {
			previous = existing;
			continue;
		}

		try {
			const created = (await invoke('role_create', {
				name,
				mask: roleMask(member.mask, manager.mask, place),
				afterRoleId: previous
			})) as RoleRow;

			roleIds.set(name.toLowerCase(), created.id);
			previous = created.id;
			rolesCreated++;
		} catch (error) {
			failures.push(`role ${name}: ${describe(error)}`);
		}
	}

	const taken = new Set(
		((await invoke('member_list')) as MemberRow[]).map((row) => row.username.toLowerCase())
	);
	let membersCreated = 0;

	for (const planned of MEMBERS) {
		if (taken.has(planned.username.toLowerCase())) {
			continue;
		}

		const roleId =
			planned.role === 'manager'
				? manager.id
				: planned.role === 'member'
					? member.id
					: roleIds.get(ROLE_NAMES[planned.role].toLowerCase());

		if (!roleId) {
			failures.push(`member ${planned.username}: role ${String(planned.role)} was not made`);
			continue;
		}

		try {
			await invoke('invitation_member_create', {
				username: planned.username,
				roleId,
				overrideMask: 0,
				workspaces:
					workspace && planned.access ? [{ id: workspace.id, access: planned.access }] : []
			});

			taken.add(planned.username.toLowerCase());
			membersCreated++;
		} catch (error) {
			failures.push(`member ${planned.username}: ${describe(error)}`);
		}
	}

	if (!workspace) {
		log('the signed-in member holds no workspace, so the members were made with no grant');
	}

	// the directory lists what the session holds, and the owner holds every workspace
	const workspaceIds = new Map(
		workspaces.map((candidate) => [candidate.name.trim().toLowerCase(), candidate.id])
	);
	let workspacesCreated = 0;

	for (const name of WORKSPACE_NAMES) {
		if (workspaceIds.has(name.toLowerCase())) {
			continue;
		}

		try {
			log(`making workspace ${name}, a hosted database on the owner's Turso account`);

			const created = (await invoke('workspace_create', { name })) as SessionWorkspace;

			workspaceIds.set(name.toLowerCase(), created.id);
			workspacesCreated++;
		} catch (error) {
			if (error instanceof Refusal && error.reason === 'ownerMachineOnly') {
				failures.push(`workspaces: ${error.message}`);
				break;
			}

			failures.push(`workspace ${name}: ${describe(error)}`);
		}
	}

	const roster = (await invoke('member_list')) as MemberRow[];
	const byUsername = new Map(roster.map((row) => [row.username.toLowerCase(), row]));
	let grantsMade = 0;

	for (const grant of GRANTS) {
		const workspaceId = workspaceIds.get(grant.workspace.toLowerCase());
		const row = byUsername.get(grant.username.toLowerCase());

		if (!workspaceId || !row || row.workspaces?.some((held) => held.id === workspaceId)) {
			continue;
		}

		try {
			await invoke('workspace_grant', { workspaceId, memberId: row.id, access: grant.access });

			grantsMade++;
		} catch (error) {
			failures.push(`grant ${grant.username} on ${grant.workspace}: ${describe(error)}`);
		}
	}

	return {
		status: 'seeded',
		rolesCreated,
		membersCreated,
		workspacesCreated,
		grantsMade,
		failures
	};
}

/**
 * Reach the app, seed, and say what happened. **It resolves whatever happens**, because the records
 * seed beside it must not fail on an app that is closed or signed out.
 */
export async function runOrganizationSeed(
	connect: Connect,
	options: { workspaceId?: string | null; log?: (line: string) => void } = {}
): Promise<OrganizationOutcome> {
	const log = options.log ?? console.log;
	let outcome: OrganizationOutcome;
	let close = () => {};

	try {
		const reached = await connect();

		close = reached.close;
		outcome = await seedOrganization(reached.invoke, { ...options, log });
	} catch (error) {
		outcome = {
			status: 'skipped',
			reason:
				error instanceof Unreachable
					? error.message
					: `the organization was not seeded: ${describe(error)}`
		};
	} finally {
		close();
	}

	if (outcome.status === 'skipped') {
		log(outcome.reason);
	} else if (
		outcome.rolesCreated +
			outcome.membersCreated +
			outcome.workspacesCreated +
			outcome.grantsMade ===
		0
	) {
		log(
			`the organization already holds the ${ROLE_NAMES.length} roles, ${MEMBERS.length} members, ` +
				`${WORKSPACE_NAMES.length} workspaces and their grants, so nothing new was made`
		);
	} else {
		log(
			`seeded the organization with ${outcome.rolesCreated} role(s), ` +
				`${outcome.membersCreated} member(s), ${outcome.workspacesCreated} workspace(s), each a ` +
				`hosted database on the owner's Turso account, and ${outcome.grantsMade} grant(s); ` +
				'the rest were already there'
		);
	}

	for (const failure of outcome.status === 'seeded' ? outcome.failures : []) {
		log(`refused: ${failure}`);
	}

	return outcome;
}

type Target = { type: string; url: string; webSocketDebuggerUrl?: string };

/**
 * Reach the development app's webview on `port` over the DevTools protocol. Each call evaluates
 * `window.__TAURI_INTERNALS__.invoke` in the page and brings back its answer or its refusal.
 */
export function connectOverDebugPort(port: number, platform = process.platform): Connect {
	return async () => {
		if (platform !== 'win32') {
			throw new Unreachable(
				`the webview on ${platform} opens no debugging port, so the organization is seeded ` +
					'by hand in the app there'
			);
		}

		const unreachable = new Unreachable(
			`no app answered on debugging port ${port}, so the organization was not seeded; ` +
				'start it with `pnpm dev` and sign in as the owner'
		);

		let targets: Target[];

		try {
			const response = await fetch(`http://127.0.0.1:${port}/json`);

			targets = (await response.json()) as Target[];
		} catch {
			throw unreachable;
		}

		const page = targets.find(
			(target) =>
				target.type === 'page' && target.webSocketDebuggerUrl && !target.url.startsWith('devtools:')
		);

		if (!page?.webSocketDebuggerUrl) {
			throw unreachable;
		}

		const socket = new WebSocket(page.webSocketDebuggerUrl);
		const pending = new Map<number, (message: CdpReply) => void>();
		let next = 0;

		await new Promise<void>((resolve, reject) => {
			socket.addEventListener('open', () => resolve(), { once: true });
			socket.addEventListener('error', () => reject(unreachable), { once: true });
		});

		socket.addEventListener('message', (event) => {
			const message = JSON.parse(String(event.data)) as CdpReply;

			pending.get(message.id)?.(message);
			pending.delete(message.id);
		});

		const invoke: Invoke = async (name, args = {}) => {
			const id = ++next;
			const expression =
				`(async () => { try { return { ok: true, value: await window.__TAURI_INTERNALS__.invoke(` +
				`${JSON.stringify(`plugin:organization|${name}`)}, ${JSON.stringify(args)}) }; } ` +
				`catch (error) { return { ok: false, error: error instanceof Error ? error.message : error }; } })()`;

			const reply = await new Promise<CdpReply>((resolve) => {
				pending.set(id, resolve);
				socket.send(
					JSON.stringify({
						id,
						method: 'Runtime.evaluate',
						params: { expression, awaitPromise: true, returnByValue: true }
					})
				);
			});

			if (reply.error || reply.result?.exceptionDetails) {
				throw new Unreachable(
					`the page on port ${port} is not the app: ` +
						(reply.error?.message ?? reply.result?.exceptionDetails?.text ?? 'no answer')
				);
			}

			const answer = reply.result?.result?.value as
				{ ok: true; value: unknown } | { ok: false; error: unknown };

			if (!answer.ok) {
				const reason =
					typeof answer.error === 'object' && answer.error && 'reason' in answer.error
						? String(answer.error.reason)
						: undefined;

				throw new Refusal(describe(answer.error), reason);
			}

			return answer.value;
		};

		return { invoke, close: () => socket.close() };
	};
}

type CdpReply = {
	id: number;
	error?: { message: string };
	result?: { result?: { value?: unknown }; exceptionDetails?: { text: string } };
};
