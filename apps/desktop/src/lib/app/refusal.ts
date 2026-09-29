import type { RecordRefusalCode } from '$lib/api/refusal';
import {
	COMPLEX_REFUSAL_FIELDS,
	UNIT_REFUSAL_FIELDS,
	type ComplexRefusalCode,
	type UnitRefusalCode
} from '$lib/complex';
import { CONTRACT_REFUSAL_FIELDS, type ContractRefusalCode } from '$lib/contract';
import type { RefusalField } from '$lib/error/refusal';
import type { HostRefusalCode } from '$lib/error/tauri';
import { PAYMENT_REFUSAL_FIELDS, type PaymentRefusalCode } from '$lib/payment';
import { TENANT_REFUSAL_FIELDS, type TenantRefusalCode } from '$lib/tenant';
import type { TransferRefusalCode } from '$lib/transfer';

/**
 * THE REFUSALS
 *
 * every code a procedure or the shell can refuse with: the union of each feature's and
 * capability's own, which it names in its `refusal.ts` and exports from its entry, with the
 * shell's (`host`) and a stated identity's (`record`). Adding a feature's refusals is a member
 * here, the one place that names every feature.
 *
 * **Read as a type from below.** `$lib/api/refusal` imports it as a type, which is erased before
 * anything runs, raises and reads a refusal by it, and hands it on to `$lib/error/refusal`, which
 * finds the sentence: the plumbing a feature raises through never loads a feature, and names none
 * ([[rules/module-layout]], under *Where a concept departs from the shape*).
 */
export type RefusalCode =
	| ComplexRefusalCode
	| ContractRefusalCode
	| HostRefusalCode
	| PaymentRefusalCode
	| RecordRefusalCode
	| TenantRefusalCode
	| TransferRefusalCode
	| UnitRefusalCode;

/**
 * the field of a form each refusal belongs under, where one does: every feature's own, from its
 * `refusal.ts`. `router.ts` binds it into `$lib/error/refusal` as it builds the root router, so a
 * form finds its field through the application's caller and through every test's alike.
 */
export const refusalFields: Partial<Record<RefusalCode, RefusalField>> = {
	...COMPLEX_REFUSAL_FIELDS,
	...CONTRACT_REFUSAL_FIELDS,
	...PAYMENT_REFUSAL_FIELDS,
	...TENANT_REFUSAL_FIELDS,
	...UNIT_REFUSAL_FIELDS
};
