import type { Pathname } from '$app/types';
import type { OrganizationSession } from '$lib/platform/host';
import { permits, type Administration } from '@rentable/workspace-permission';

/**
 * THE SETTINGS AREA'S SEVEN SECTIONS, AND HOW ONE IS ADDRESSED
 *
 * `/settings` is one surface with seven sections, and a section is named in the address rather
 * than in a path segment: `?section=<name>`, the idiom `record-surface.svelte` established and
 * `contracts/[id]` reads. **The pathname staying `/settings` is what the choice is for**, and
 * two things depend on it. `layout/shell-surface.ts` admits exactly `/settings` while nobody is
 * signed in, matching the address rather than a prefix, so the language control is reachable on
 * the way in; and `back.ts` keys its trail by pathname, so moving between sections is not
 * leaving the page. A segment per section would need both of those to match prefixes instead,
 * which `opensSignedOut`'s own comment argues against.
 *
 * Nothing here renders. The area draws what `sectionsFor` returns and the route reads
 * `sectionOf`, so which sections a reader is offered is one answer in one place, testable
 * without a DOM.
 */

/** what names a section in the address. */
export const SECTION_PARAM = 'section';

/**
 * what names one record inside a section, where the section has records.
 *
 * The members section is a directory of cards, and a card opens its record
 * ([[rules/interface]], *Row activation*), so the card's `href` is this section's address with the
 * account named on it: `/settings?section=members&account=<id>`. A member has no page of their
 * own, so what opening one means is the section drawing that account's edit.
 */
export const RECORD_PARAM = 'account';

/**
 * what names one workspace in the workspaces section, which is a directory of cards too (effort
 * 828, requirement 21).
 *
 * A second name rather than one shared word: the two sections stand on the same address, so a
 * reader who moved from an account's card to the workspaces section would otherwise arrive
 * carrying an account id under the name a workspace is read by. The constant above keeps the
 * name it was written under, since it is the members section's and that section is not this
 * ticket's to touch.
 */
export const WORKSPACE_PARAM = 'workspace';

/** the settings area's own address, carrying no section. */
export const THE_SETTINGS_AREA = '/settings' satisfies Pathname;

/**
 * The sections, in the order the area presents them (requirement 14 of effort 826).
 *
 * The order is the requirement's and not an arrangement this module is free to make: the rail
 * draws them in it, and the palette offers them in it.
 */
export const SETTINGS_SECTIONS = [
	'general',
	'you',
	'members',
	'workspaces',
	'sync',
	'updates',
	'diagnostics'
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** `/settings` carrying one section, which is what an anchor to a section is typed as. */
export type SettingsSectionAddress =
	`${typeof THE_SETTINGS_AREA}?${typeof SECTION_PARAM}=${SettingsSection}`;

/**
 * The section a reader lands on when the address names none, and when it names one nothing here
 * has heard of.
 *
 * General rather than a refusal: a section is a view of a page that exists either way, so an
 * address somebody mistyped is answered by the page opening rather than by a screen about the
 * address.
 */
export const DEFAULT_SECTION: SettingsSection = 'general';

/**
 * The acts that make the members section worth drawing.
 *
 * `renameWorkspace` is deliberately absent: it is the workspaces section's act, and a member who
 * holds it alone has nothing to do on a list of people.
 */
const MEMBER_ACTS = [
	'inviteMember',
	'removeMember',
	'changeRole',
	'resetPassword',
	'renameMember',
	'grantWorkspace'
] as const satisfies readonly Administration[];

/**
 * `/settings`, opened at `section`.
 *
 * The result keeps the literal route and the literal section, because `resolve` reads the route
 * out of the type it is handed and cannot match a widened one. `create-intent.ts`'s
 * `withCreateIntent` is typed the same way and says so at more length.
 */
export function withSection<S extends SettingsSection>(
	section: S
): `${typeof THE_SETTINGS_AREA}?${typeof SECTION_PARAM}=${S}` {
	return `${THE_SETTINGS_AREA}?${SECTION_PARAM}=${section}`;
}

/** Which section `url` names; `general` where it names none, or one that is not a section. */
export function sectionOf(url: URL): SettingsSection {
	const named = url.searchParams.get(SECTION_PARAM);

	return SETTINGS_SECTIONS.find((section) => section === named) ?? DEFAULT_SECTION;
}

/**
 * Which record `url` names inside its section, or `null` where it names none.
 *
 * `param` is what the section names its records by, `account` where it is not said: one function
 * rather than one per section, because what a section does with the answer is the same either
 * way.
 *
 * Whether that id belongs to anything is the section's to decide, because only the section holds
 * the records: an address kept after somebody was removed names nothing, and the section draws
 * itself rather than a screen about the address, exactly as `shownSection` does above.
 */
export function recordOf(url: URL, param: string = RECORD_PARAM): string | null {
	const named = url.searchParams.get(param)?.trim();

	return named ? named : null;
}

/**
 * The section to draw, given what the address names and what this reader is offered.
 *
 * **A section a reader is not offered is not an empty body**, and an address naming one is easy
 * to arrive at honestly: a bookmark kept after a role narrowed, a link from somebody who holds
 * more acts. Both the body and the rail's mark read this, so the tab that is underlined is
 * always the section that is drawn.
 */
export function shownSection(
	section: SettingsSection,
	offered: SettingsSection[]
): SettingsSection {
	return offered.includes(section) ? section : DEFAULT_SECTION;
}

/**
 * The sections this reader is offered, in order.
 *
 * **A section with nothing to show for this member is absent, not empty** (requirement 14). So
 * the gate is what the session carries rather than what the area could draw: the members section
 * is for whoever holds one of the acts that changes a row, and the three sections that need an
 * organization at all are absent on the way in, where the area is still the one address that
 * draws with nobody signed in.
 *
 * @param holdsTursoAuthority whether this machine holds the Turso authority. It decides what the
 * sync section *contains*, the reconnect and the organization's own link, rather than whether the
 * section is offered, since a member reads the sync status either way. It is taken here because
 * the area is handed one answer about who is reading rather than two.
 */
export function sectionsFor(
	session: OrganizationSession | null,
	// taken and not read, for the reason the docstring gives: the flag decides what the sync
	// section draws rather than whether it is offered, and the area reads it from its own prop.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	holdsTursoAuthority: boolean
): SettingsSection[] {
	if (!session) {
		return ['general', 'updates', 'diagnostics'];
	}

	const administers = MEMBER_ACTS.some((act) => permits(session.permissions, act));

	return SETTINGS_SECTIONS.filter((section) => section !== 'members' || administers);
}
