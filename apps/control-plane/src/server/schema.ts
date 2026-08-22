import { WORKSPACE_NAME_LIMIT } from '../workspace/workspace.ts';

/**
 * What each route accepts and what each one answers with, declared.
 *
 * **This file is the answer to *what may I send* and *what will I get*, and before it there was
 * neither.** The request shapes lived in `schemaVersionIn` and `workspaceNameIn`, one function per
 * field; the response shapes lived in whatever `wire.ts` happened to build. Nothing could be read
 * off either, and a sixth route's author had to know that this was how it was done here.
 *
 * **The response declarations are enforced rather than documented**, which is the whole of why
 * they are worth having and the whole of what makes them dangerous. Fastify serializes through
 * them, so a field the declaration does not name cannot reach the wire. It also cannot warn you:
 * a field that exists, is set, and is missing from the declaration below simply does not appear.
 *
 * Two things stand between that and a broken client, and neither is a review. The 40 tests in
 * `server/tests/server.test.ts` assert the fields the client actually reads, which is criterion 4.
 * And {@link WIRE_FIELDS} at the foot of this file is the contract written out by hand, which one
 * test compares every response against. **It has to be a hand-written second copy to be a check at
 * all**, and the first version of it was derived from these declarations, which made it a
 * comparison of a thing with itself. That is recorded on `WIRE_FIELDS` rather than here.
 */

/**
 * The mint's body.
 *
 * **`schemaVersion` is required rather than defaulted**, and a default is the thing to resist
 * here: any number chosen for a client that did not say is a guess about which schema it
 * understands, and the whole of decision 06 is that guessing is what diverges a replica. A caller
 * that omits it is a caller with a defect, and it is told so.
 *
 * **The floor is one, not zero, and zero is the value that would have been dangerous.** A
 * workspace is created at `0` with an empty database, so a mint at `0` is the *equal* case: it
 * would issue a full-access token for a database with no tables in it, and a client holding that
 * would have nothing to sync and every reason to build the schema itself, which is decision 06's
 * rejected option B, arriving through the one door left open. No real client can send it either:
 * the desktop derives its version by counting migrations and there has never been a release with
 * none. So the first mint on a workspace always migrates, and a database a token exists for
 * always has a schema.
 *
 * `type: 'integer'` is what rejects `1.5`, and `minimum: 1` what rejects `-1` and `0`. Together
 * they are exactly what `schemaVersionIn` checked, which is why that function is gone rather than
 * moved.
 */
export const mintSchema = {
	body: {
		type: 'object',
		required: ['schemaVersion'],
		properties: {
			schemaVersion: { type: 'integer', minimum: 1 }
		}
	}
} as const;

/**
 * The rename's body.
 *
 * **Two of the three name rules are here and the third cannot be**, which is worth stating rather
 * than discovering. `workspaceNameIn` checked the *trimmed* string: `'   '` was refused, and the
 * limit was measured after trimming. JSON Schema has no trim, so:
 *
 * - `type: 'string'` refuses a missing name and a name that is not one
 * - `pattern: '\\S'` refuses a name that is blank once trimmed. AJV searches rather than anchors,
 *   so this reads as *contains a character that is not whitespace*
 * - **the length rule is `renameWorkspace`'s**, because it is a rule about what this service will
 *   store rather than about what a request may look like, and it is the only one of the three that
 *   a declaration cannot express
 *
 * `maxLength` here is a size bound and deliberately not the rule: it sits far above the limit so
 * that an unbounded string cannot be sent, while leaving the real answer to the domain, which can
 * trim first.
 */
export const renameSchema = {
	body: {
		type: 'object',
		required: ['name'],
		properties: {
			name: { type: 'string', pattern: '\\S', maxLength: WORKSPACE_NAME_LIMIT * 8 }
		}
	}
} as const;

/**
 * A path carrying a workspace id.
 *
 * Not decoded and not pattern-matched. A workspace id is a UUID, so there is nothing to unescape,
 * and a shape that refused anything else would turn a nonsense path into a 400 where the route it
 * reaches already answers 404 for a workspace that is not there.
 */
export const workspaceParams = {
	type: 'object',
	required: ['workspaceId'],
	properties: { workspaceId: { type: 'string' } }
} as const;

/**
 * The sentence a schema failure goes out as.
 *
 * **A schema library produces its own text and this repository writes its own**, so something has
 * to map between them. The three name refusals are the reason it is worth the code: `server.test.ts`
 * asserts all three word for word, because the caller can act on the difference. Sending no name at
 * all is a defect in the client; sending one with nothing in it is a person who pressed save on an
 * empty box; sending one too long is a person whose name will not fit. A single *that name is not
 * valid* would leave the desktop inventing which of the three it was.
 *
 * The third of those is not reachable from here, and that is not an omission: the length rule is
 * measured after trimming, so it lives in `renameWorkspace` and raises its own `Refusal`.
 *
 * Empty and whitespace-only are deliberately one answer: after trimming they are the same name,
 * and telling somebody their four spaces were not four spaces says nothing they can use.
 */
export const messageForValidation = (issues: readonly Record<string, unknown>[]): string => {
	const first = issues[0];
	const path = typeof first?.instancePath === 'string' ? first.instancePath : '';
	const params = (first?.params ?? {}) as { missingProperty?: string };
	const field = path.replace(/^\//, '') || (params.missingProperty ?? '');

	if (field === 'name') {
		return first?.keyword === 'pattern'
			? 'a workspace needs a name'
			: 'say what this workspace should be called';
	}

	if (field === 'schemaVersion') {
		return 'say which schema version this application was built against';
	}

	// A route that grows a field and does not grow a sentence here still refuses, and says which
	// field it was rather than nothing at all.
	return `that request is not shaped the way this route accepts${field ? `: ${field}` : ''}`;
};

/**
 * An account, as it goes out.
 *
 * **Nothing on the Rust side reads any of it**, checked field by field against
 * `apps/desktop/tauri/src/sync/control.rs` on 2026-08-22: `WireAnswer` declares `session`,
 * `workspace`, `token`, `url` and `expiresAt`, and no `account` at all. It is declared here anyway
 * because requirement 4 is that the wire does not change, and dropping a field nobody currently
 * reads is still dropping a field.
 *
 * `avatarUrl` is the one nullable column on the wire. Declared as two types rather than as a
 * string, because serialization would otherwise have to decide what `null` becomes and any answer
 * it picked would be wrong.
 */
const account = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		email: { type: 'string' },
		displayName: { type: 'string' },
		avatarUrl: { type: ['string', 'null'] },
		googleUserId: { type: 'string' },
		createdAt: { type: 'integer' },
		updatedAt: { type: 'integer' }
	}
} as const;

/**
 * A workspace, as it goes out.
 *
 * **`permissions` is the asking account's and never the row's**, which is a property of the caller
 * rather than of the shape, so nothing here can enforce it. `wireWorkspace` takes the number as an
 * argument for that reason and its comment is where the reasoning lives.
 *
 * The Rust client reads `id`, `name` and `permissions`. `ownerAccountId`, `createdAt` and
 * `updatedAt` are declared because they are sent today, not because anything asks for them.
 *
 * **What is deliberately absent is the pair that would matter**: `databaseName` and
 * `databaseHostname` are columns on this record and are not on this list, so a `wireWorkspace` that
 * ever grew a spread would have them removed here rather than published. That is the enforcement
 * working in the direction it is meant to.
 */
const workspace = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		ownerAccountId: { type: 'string' },
		permissions: { type: 'integer' },
		createdAt: { type: 'integer' },
		updatedAt: { type: 'integer' }
	}
} as const;

/**
 * A session, as it goes out.
 *
 * All three are read by the Rust client, which is the only shape here of which that is true.
 * `expiresAt` is the refresh window and `absoluteExpiresAt` is when the sign-in stops being
 * renewable at all; `wire.ts` is where the difference is argued.
 */
const session = {
	type: 'object',
	properties: {
		token: { type: 'string' },
		expiresAt: { type: 'integer' },
		absoluteExpiresAt: { type: 'integer' }
	}
} as const;

/** what `/health` answers. Whether the database replied, and never which database it is. */
export const healthSchema = {
	response: {
		200: { type: 'object', properties: { status: { type: 'string' } } }
	}
} as const;

/**
 * What the two identifying routes answer.
 *
 * One declaration for `/account/sign-in` and `/session/refresh` because they are one handler, for
 * the reasons `account.ts` gives. A shape invented to tell them apart would be inventing a
 * difference.
 */
export const identifySchema = {
	response: {
		200: { type: 'object', properties: { account, workspace, session } }
	}
} as const;

/**
 * What the mint answers.
 *
 * **`token`, `url` and `expiresAt` sit at the top level rather than under a key**, which is the
 * shape the client already parses: `WireAnswer` reads `expiresAt` into `replica_expires_at`, and
 * the session's own `expiresAt` is one level down. Two fields of the same name meaning different
 * clocks is not a shape anybody would design, and it is the shape that exists, so it is declared
 * rather than corrected here.
 */
export const mintResponse = {
	200: {
		type: 'object',
		properties: {
			token: { type: 'string' },
			url: { type: 'string' },
			expiresAt: { type: 'integer' },
			session
		}
	}
} as const;

/** what the rename answers: the whole workspace rather than the name that was sent. */
export const renameResponse = {
	200: { type: 'object', properties: { workspace, session } }
} as const;

/**
 * The wire contract, written out by hand, as the thing the declarations above are checked against.
 *
 * **It is a second copy on purpose, and the first version of this was derived from the schemas and
 * was therefore worthless.** Serialization guarantees that a response carries no key the
 * declaration lacks, so comparing a response to the declaration compares a thing to itself: delete
 * a field from the declaration and both sides shrink together and the check still passes. Measured
 * on 2026-08-22 by doing exactly that. What caught the deletion was two of the forty existing
 * tests, which is criterion 4 working and is not the same guard.
 *
 * So this list is independent by construction. Changing what a route answers with means changing
 * this too, which is the point: the wire is a contract with a client that is not TypeScript and
 * does not regenerate, so a change to it should cost a deliberate edit rather than happening as a
 * side effect of editing a schema.
 *
 * Kept beside the declarations rather than in the test, because the two belong to the same
 * question and a reader comparing them should not have to open a second file.
 */
export const WIRE_FIELDS = {
	account: ['id', 'email', 'displayName', 'avatarUrl', 'googleUserId', 'createdAt', 'updatedAt'],
	workspace: ['id', 'name', 'ownerAccountId', 'permissions', 'createdAt', 'updatedAt'],
	session: ['token', 'expiresAt', 'absoluteExpiresAt'],
	mint: ['token', 'url', 'expiresAt', 'session'],
	rename: ['workspace', 'session']
} as const;
