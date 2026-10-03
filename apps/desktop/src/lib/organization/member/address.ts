import { resolve } from '$app/paths';
import { RECORD_PARAM, withSection } from '$lib/settings';

/**
 * WHERE A MEMBER IS READ
 *
 * A member has no page of their own: their card is in the settings area's organization section,
 * and the section opens the member the address names (`member/component/directory.svelte`). So
 * a member's address is that section's with them named on it, which a card's `href` is and the
 * workspace page's *open member* goes to (effort 846, ticket 50).
 */

/** a member's card in the organization section, resolved. */
export const memberCardOf = (memberId: string) =>
	resolve(`${withSection('organization')}&${RECORD_PARAM}=${encodeURIComponent(memberId)}`);
