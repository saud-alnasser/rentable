import type { RecordRefusalCode } from '$lib/api/refusal';
import type { ComplexRefusalCode, UnitRefusalCode } from '$lib/complex';
import type { ContractRefusalCode } from '$lib/contract';
import type { HostRefusalCode } from '$lib/error/tauri';
import type { PaymentRefusalCode } from '$lib/payment';
import type { TenantRefusalCode } from '$lib/tenant';
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
