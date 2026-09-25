import {
	effectiveIn,
	permits,
	WRITE_FLAGS,
	type AccessLevel,
	type FAMILIES
} from '@rentable/workspace-permission';
import { createSubscriber } from 'svelte/reactivity';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * WHAT THE READER MAY DO TO THE RECORDS OF THE WORKSPACE OPEN
 *
 * The interface's half of requirement 10 of effort 838: a record control whose flag the member
 * lacks is refused, and says which flag; a kind they may not view is left out. What decides it is
 * the value the tRPC context decides by, the session's permissions folded for the workspace open
 * (`effectiveIn`, over the access `api/context.ts` reads with `accessIn`), so a control and the
 * procedure behind it answer the same question from the same number. The procedure refuses again,
 * naming the flag, and the signed row in Rust is the authority; this is the courtesy.
 *
 * **Plain rather than a rune module**, so the concepts' act lists, the create group and the undo
 * stack can read it under Node's runner, which cannot load one. It is still reactive where it is
 * read inside a component: `createSubscriber` is what makes a control drawn off it draw again when
 * a heartbeat brings a narrowed role or a workspace switch brings a read-only grant.
 */

/** A record flag: viewing, creating, editing or deleting one kind of record. */
export type RecordFlag = (typeof FAMILIES)[
	'complex' | 'unit' | 'tenant' | 'contract' | 'payment'][number];

/** The kinds of record a workspace holds. */
export type RecordKind = 'complex' | 'unit' | 'tenant' | 'contract' | 'payment';

/** The flag that lets a member see records of a kind at all. */
export const VIEW_FLAG = {
	complex: 'viewComplex',
	unit: 'viewUnit',
	tenant: 'viewTenant',
	contract: 'viewContract',
	payment: 'viewPayment'
} as const satisfies Record<RecordKind, RecordFlag>;

/**
 * What an import writes, and so what it asks for: every kind's create, as `workspace.importWhole`
 * does, since one procedure takes a file of any kind and writes it all or none.
 */
export const IMPORT_FLAGS = [
	'createComplex',
	'createUnit',
	'createTenant',
	'createContract',
	'createPayment'
] as const satisfies readonly RecordFlag[];

/**
 * Where the reader stands in the workspace open: what they may do across the organization, and how
 * their grant reaches this workspace. Both are kept, rather than the folded value alone, because
 * they give two different reasons: a flag the role and override do not carry, and a flag a
 * read-only grant took away.
 */
export type Standing = { permissions: number; accessLevel: AccessLevel };

/**
 * Why the reader may not use a flag in the workspace open, in one line, or nothing where they may.
 *
 * **A read-only grant is the reason for every write**, whatever the role says: the grant is what
 * stands in the way, and a member told their role lacks a flag would ask for the wrong thing.
 *
 * **Nothing is refused before the standing is known.** The session and the open workspace arrive
 * with the first reads after startup; refusing every record control until then would draw each
 * one refused for a moment on every launch, and the procedure refuses on the real answer anyway.
 */
export function refusalOf(
	flag: RecordFlag,
	standing: Standing | null,
	t: TranslationFunctions
): string | undefined {
	if (!standing || permits(effectiveIn(standing.permissions, standing.accessLevel), flag)) {
		return undefined;
	}

	if (standing.accessLevel === 'read-only' && WRITE_FLAGS.includes(flag)) {
		return t.common.permission.readOnly();
	}

	return t.common.permission.missing[flag]();
}

/** The first of several flags the reader may not use, with its reason, or nothing where they hold all. */
export function refusalOfEvery(
	flags: readonly RecordFlag[],
	standing: Standing | null,
	t: TranslationFunctions
): string | undefined {
	for (const flag of flags) {
		const refusal = refusalOf(flag, standing, t);

		if (refusal) {
			return refusal;
		}
	}

	return undefined;
}

/**
 * The reader's standing in the workspace open, held for the whole window.
 *
 * Set by `workspace/component/permissions.svelte`, mounted once in the frame, from the session and
 * the open workspace it reads; `null` before both have arrived, and after signing out.
 */
class MemberPermissions {
	#standing: Standing | null = null;
	#changed = new Set<() => void>();
	#subscribe = createSubscriber((update) => {
		this.#changed.add(update);

		return () => this.#changed.delete(update);
	});

	/** where the reader stands, or `null` where that is not known yet. */
	get standing(): Standing | null {
		this.#subscribe();

		return this.#standing;
	}

	/** hold a new standing, and draw again whatever was drawn off the last one. */
	hold(standing: Standing | null) {
		this.#standing = standing;

		for (const update of this.#changed) {
			update();
		}
	}

	/** why the reader may not use this flag here, or nothing where they may. */
	refusal = (flag: RecordFlag, t: TranslationFunctions) => refusalOf(flag, this.standing, t);

	/** why the reader may not use every one of these flags here, or nothing where they may. */
	refusalOfEvery = (flags: readonly RecordFlag[], t: TranslationFunctions) =>
		refusalOfEvery(flags, this.standing, t);

	/**
	 * whether the reader may see records of a kind. Where the standing is not known yet, they may,
	 * for the reason {@link refusalOf} gives.
	 */
	views = (kind: RecordKind) => {
		const standing = this.standing;

		return !standing || permits(standing.permissions, VIEW_FLAG[kind]);
	};
}

/** the window's one reader. */
export const memberPermissions = new MemberPermissions();
