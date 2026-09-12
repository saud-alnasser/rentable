import type { TranslationFunctions } from '$lib/i18n/i18n-types';

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
 */
export type AccountRefusalReader = {
	/** whether the reader is the owner, which is who sees the detail. */
	isOwner: boolean;
	/** the owner's name, for the member's sentence. */
	ownerDisplayName: string;
	/** Turso's own sentence, read by the owner's machine alone; `null` for everybody else. */
	detail: string | null;
};

export function accountRefusalSentence(reader: AccountRefusalReader, LL: TranslationFunctions) {
	if (!reader.isOwner) {
		return LL.workspace.accountRefusedMember({
			owner: reader.ownerDisplayName || LL.layout.signIn.roleOwner()
		});
	}

	return reader.detail
		? LL.workspace.accountRefusedOwner({ detail: reader.detail })
		: LL.workspace.accountRefusedOwnerNoDetail();
}
