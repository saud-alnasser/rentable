import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { Contract } from '$lib/platform/database/schema';

import { readRefusal, type RefusalCode, type RefusalParams } from '$lib/api/refusal';
import { isolateDirection } from '$lib/error/message';
import { TRPCError } from '@trpc/server';

export { readRefusal };

/**
 * REFUSALS, READ
 *
 * A procedure refuses with a code and its values (`$lib/api/refusal`), and this is where the code
 * becomes a sentence in the reader's language and a form learns which field it belongs under.
 * Nothing here reads the message a refusal was raised with: that is a developer's description.
 */

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
 * What a refused call says to the reader, in their language.
 *
 * A refusal raised with a code reads as that code's sentence. A `BAD_REQUEST` carrying none is
 * the input a procedure's own schema turned away, and is shown as it was raised, since that is a
 * sentence its schema was handed. Anything else, and a refusal with nothing to say, reads as the
 * unexpected failure.
 */
export function toRefusalText(error: unknown, translations: TranslationFunctions): string {
	const refusal = readRefusal(error);

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

	if (error instanceof TRPCError && error.code === 'BAD_REQUEST' && error.message.trim()) {
		return error.message;
	}

	return translations.common.messages.unexpectedError();
}

/**
 * The field a refusal belongs under, named as the form that shows it names the field, or `null`
 * where it belongs to no field and is shown as a whole.
 *
 * **A form maps a code, never a sentence.** Each form asks for the field and places the sentence
 * there if the field is one of its own.
 */
export function fieldOfRefusal(code: RefusalCode | null | undefined): RefusalField | null {
	return (code && FIELDS[code]) ?? null;
}

const FIELDS: Partial<Record<RefusalCode, RefusalField>> = {
	'complex.nameTaken': 'name',
	'complex.nameTakenNamed': 'name',
	'contract.costNotPositive': 'cost',
	'contract.endBeforeStart': 'end',
	'contract.govIdTaken': 'govId',
	'contract.govIdTakenNamed': 'govId',
	'contract.periodOffCycle': 'end',
	'contract.renewalBeforeEnd': 'start',
	'contract.tenantMissing': 'tenantId',
	'contract.tenantMissingNamed': 'tenantId',
	// both renewal refusals are about the term, so each marks the end of it the reader has to move.
	'contract.unitsUnavailable': 'end',
	// a new contract's units are the reader's choice, so a unit already held marks that choice.
	'contract.unitsTaken': 'unitIds',
	'payment.amountNotPositive': 'amount',
	'tenant.nationalIdTaken': 'nationalId',
	'tenant.nationalIdTakenNamed': 'nationalId',
	'tenant.phoneTaken': 'phoneNumber',
	'tenant.phoneTakenNamed': 'phoneNumber',
	// a collision within the submitted list belongs to the list rather than to one name field.
	'unit.nameRepeated': 'units',
	'unit.nameTaken': 'name',
	'unit.nameTakenNamed': 'name'
};

/** every field a refusal can belong under, across the forms that place one. */
export type RefusalField =
	| 'amount'
	| 'cost'
	| 'end'
	| 'govId'
	| 'name'
	| 'nationalId'
	| 'phoneNumber'
	| 'start'
	| 'tenantId'
	| 'unitIds'
	| 'units';
