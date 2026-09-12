/**
 * The two letters an avatar shows where there is no picture.
 *
 * *`signedInAccount` lived beside this until the control plane retired: an account was a row
 * the machine held for Google, and who is in is the organization session now, read where the
 * shell holds it (`organization/query.ts::useFetchOrganizationState`).*
 */
export function accountInitials(source: string | null | undefined, fallback = '?'): string {
	const initials = (source ?? '')
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

	return initials || fallback;
}
