import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { Contract } from '$lib/platform/database/schema';

import { readRefusal, type Refusal, type RefusalCode, type RefusalParams } from '$lib/api/refusal';
import { isolateDirection } from '$lib/error/message';
import { toTauriRefusalReason } from '$lib/error/tauri';
import { TRPCError } from '@trpc/server';

export { readRefusal };

/**
 * REFUSALS, READ
 *
 * A procedure refuses with a code and its values (`$lib/api/refusal`), and this is where the code
 * becomes a sentence in the reader's language and a form learns which field it belongs under.
 * Nothing here reads the message a refusal was raised with: that is a developer's description.
 *
 * **The shell refuses the same way.** A Rust refusal crosses as `refused` with a reason, and the
 * reason is read here as the code `host.<reason>` with no values, so its sentence is found and
 * checked exactly as a router's is (effort 832, requirement 23).
 */

/**
 * The shell's refusal an error carries, as a code, or `null` where it carries none or a reason this
 * side has no word for.
 */
export function readHostRefusal(error: unknown): Refusal | null {
	const reason = toTauriRefusalReason(error);

	return reason ? { code: `host.${reason}`, params: {} } : null;
}

/** whether an error is a refusal a person can read a sentence for, from a router or the shell. */
export function isRefusal(error: unknown): boolean {
	return readRefusal(error) !== null || readHostRefusal(error) !== null;
}

type Sentences = TranslationFunctions['common']['refusals'];

/** every code `common.refusals` holds a sentence for, spelled as a code is. */
type Covered = {
	[Concept in keyof Sentences]: `${Concept & string}.${keyof Sentences[Concept] & string}`;
}[keyof Sentences];

// a code with no sentence, or a sentence for no code, is a type error here rather than an English
// fallback on somebody's screen.
const everyCodeHasASentence = (code: RefusalCode): Covered => code;
const everySentenceHasACode = (code: Covered): RefusalCode => code;
void everyCodeHasASentence;
void everySentenceHasACode;

// the sentences take differently shaped values each, and `toSentenceParams` supplies what a code was
// raised with; the lookup is by the code itself, so the shapes agree by construction.
type Sentence = (params: never) => string;

/** the words for a contract's cycle, which crosses as its stored key. */
function intervalWord(interval: Contract['interval'], translations: TranslationFunctions) {
	const words = translations.contracts.intervals;

	return {
		'1m': words.monthly,
		'3m': words.quarterly,
		'6m': words.semiAnnual,
		'12m': words.annual
	}[interval]();
}

/**
 * the values a sentence is built from, ready to splice. A string is a name, an id or a phone the
 * reader did not write in their own direction, so it is isolated for the reason
 * `isolateDirection` gives; a cycle is turned into the reader's word for it.
 */
function toSentenceParams(params: RefusalParams, translations: TranslationFunctions) {
	return Object.fromEntries(
		Object.entries(params).map(([key, value]) => {
			if (key === 'interval') {
				return [key, intervalWord(value as Contract['interval'], translations)];
			}

			return [key, typeof value === 'string' ? isolateDirection(value) : value];
		})
	);
}

/**
 * The sentence for a failure a router raised that is not a refusal, or `null` where the error is
 * none of them.
 *
 * Three have one: `FORBIDDEN` and `UNAUTHORIZED` from the middlewares in `api/trpc.ts`, and a
 * `BAD_REQUEST` carrying no refusal, which is the input a procedure's own schema turned away. Their
 * messages are a developer's description, written in English for a log, so none is shown.
 */
export function toRouterFailureText(
	error: unknown,
	translations: TranslationFunctions
): string | null {
	if (!(error instanceof TRPCError)) {
		return null;
	}

	switch (error.code) {
		case 'FORBIDDEN':
			return translations.common.failures.forbidden();
		case 'UNAUTHORIZED':
			return translations.common.failures.signedOut();
		case 'BAD_REQUEST':
			return readRefusal(error) ? null : translations.common.failures.invalidInput();
		default:
			return null;
	}
}

/**
 * What a refused call says to the reader, in their language.
 *
 * A refusal raised with a code reads as that code's sentence, and so does one the shell raised
 * with a reason. A router's failure that is not a refusal reads as its own sentence
 * ({@link toRouterFailureText}). Anything else, and a refusal with nothing to say, reads as the
 * unexpected failure. No message an error was raised with is ever the text.
 */
export function toRefusalText(error: unknown, translations: TranslationFunctions): string {
	const refusal = readRefusal(error) ?? readHostRefusal(error);

	if (refusal) {
		const [concept, name] = refusal.code.split('.') as [keyof Sentences, string];
		const sentence = (translations.common.refusals[concept] as unknown as Record<string, Sentence>)[
			name
		];

		// a code this side holds no sentence for is never shown as its developer's description.
		return sentence
			? sentence(toSentenceParams(refusal.params, translations) as never)
			: translations.common.messages.unexpectedError();
	}

	return toRouterFailureText(error, translations) ?? translations.common.messages.unexpectedError();
}

/**
 * The field the input a procedure's schema turned away belongs under, or `null` where the error is
 * no such rejection or its first issue names no field a form places.
 *
 * Read from the schema's issue path rather than from its message: the first segment is the input's
 * own name for the field, which is the name the forms use.
 */
export function fieldOfInputRejection(error: unknown): RefusalField | null {
	if (!(error instanceof TRPCError) || error.code !== 'BAD_REQUEST' || readRefusal(error)) {
		return null;
	}

	const issues = (error.cause as { issues?: unknown } | undefined)?.issues;
	const path = Array.isArray(issues) ? (issues[0] as { path?: unknown } | undefined)?.path : null;
	const first = Array.isArray(path) ? path[0] : null;

	return typeof first === 'string' && isRefusalField(first) ? first : null;
}

/**
 * The field a failed call belongs under: a refusal's by its code, and a schema's rejection by the
 * path of its first issue. What a form asks when it places a failure beside the field to fix.
 */
export function fieldOfFailure(error: unknown): RefusalField | null {
	return fieldOfRefusal(readRefusal(error)?.code) ?? fieldOfInputRejection(error);
}

/**
 * The field a refusal belongs under, named as the form that shows it names the field, or `null`
 * where it belongs to no field and is shown as a whole.
 *
 * **A form maps a code, never a sentence.** Each form asks for the field and places the sentence
 * there if the field is one of its own.
 */
export function fieldOfRefusal(code: RefusalCode | null | undefined): RefusalField | null {
	return (code && fields[code]) ?? null;
}

/**
 * Each feature's refusals, by the field of its form they belong under. A feature names its own in
 * its `refusal.ts`, beside the codes, and the composition root hands them over as it builds the
 * root router (`$lib/app/refusal`), so nothing here spells a feature's code.
 */
let fields: Partial<Record<RefusalCode, RefusalField>> = {};

/** hand over every feature's refusal fields; called once, by the composition root. */
export function bindRefusalFields(bound: Partial<Record<RefusalCode, RefusalField>>) {
	fields = bound;
}

/** every field a refusal can belong under, across the forms that place one. */
const REFUSAL_FIELDS = [
	'amount',
	'cost',
	'end',
	'govId',
	'name',
	'nationalId',
	'phoneNumber',
	'start',
	'tenantId',
	'unitIds',
	'units'
] as const;

export type RefusalField = (typeof REFUSAL_FIELDS)[number];

function isRefusalField(name: string): name is RefusalField {
	return (REFUSAL_FIELDS as readonly string[]).includes(name);
}

/**
 * WHAT A PERSON IS TOLD WHEN THE ACCOUNT IS REFUSED
 *
 * Requirement 25, as two sentences. A member who is not the owner is told that the organization's
 * Turso account needs attention and whom to tell, and nothing about quotas, plans or usage: their
 * employer's billing state is not theirs to see. The owner is told enough to act on: Turso's own
 * sentence about which limit, and where on Turso to go, without having to know what a group is.
 *
 * Plain rather than a component, so a `node:test` pins the leak the requirement forbids: the
 * member's sentence carries no word of the detail, in either locale, whatever the detail says.
 *
 * The account's refusal arrives as a sync standing rather than as a code, and its sentence is here
 * all the same: this module is the one place a refusal becomes words.
 */
export type AccountRefusalReader = {
	/** whether the reader is the owner, which is who sees the detail. */
	isOwner: boolean;
	/** the owner's username, for the member's sentence. */
	ownerUsername: string;
	/** Turso's own sentence, read by the owner's machine alone; `null` for everybody else. */
	detail: string | null;
};

export function accountRefusalSentence(reader: AccountRefusalReader, LL: TranslationFunctions) {
	if (!reader.isOwner) {
		return LL.workspace.accountRefusedMember({
			owner: reader.ownerUsername || LL.layout.signIn.roleOwner()
		});
	}

	return reader.detail
		? LL.workspace.accountRefusedOwner({ detail: reader.detail })
		: LL.workspace.accountRefusedOwnerNoDetail();
}
