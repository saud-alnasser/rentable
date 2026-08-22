import { WORKSPACE_NAME_LIMIT } from '../workspace/workspace.ts';

/**
 * What each route accepts, declared.
 *
 * **This file is the answer to *what may I send*, and before it there was none.** The shapes lived
 * in `schemaVersionIn` and `workspaceNameIn`, one function per field, so nothing could be read off
 * and a sixth route's author had to know that this was how it was done here.
 *
 * **What a route *answers* with is not declared yet.** That is #743, and until it lands the
 * response side is still `wire.ts` building bodies by hand.
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
