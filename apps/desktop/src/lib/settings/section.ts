import type { Pathname } from '$app/types';
import type { OrganizationSession } from '$lib/platform/host';
import { permits, type Administration } from '@rentable/workspace-permission';

/**
 * THE SETTINGS AREA'S FOUR SECTIONS, AND HOW ONE IS ADDRESSED
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
 * The members directory is a list of cards, and a card opens its record
 * ([[rules/interface]], *Row activation*), so the card's `href` is its section's address with the
 * member named on it: `/settings?section=organization&member=<id>`. A member has no page of their
 * own, so what opening one means is the section drawing that member's edit.
 *
 * **It says member, because a member is what it names.** `account` is this application's word for
 * the Turso account and nothing else (effort 826, requirement 18), so a parameter naming a person
 * by it put the one reserved word on the one thing it is reserved against. *It read `account`
 * until ticket 21 of effort 828.*
 */
export const RECORD_PARAM = 'member';

/**
 * what names one workspace in the workspaces section, which is a directory of cards too (effort
 * 828, requirement 21).
 *
 * A second name rather than one shared word: the two directories stand on the same address, so a
 * reader who moved from a member's card to the workspaces section would otherwise arrive carrying
 * a member id under the name a workspace is read by. The constant above names its own directory's
 * records the same way, so each reads the word for what it holds.
 */
export const WORKSPACE_PARAM = 'workspace';

/** the settings area's own address, carrying no section. */
export const THE_SETTINGS_AREA = '/settings' satisfies Pathname;

/**
 * The sections, in the order the area presents them.
 *
 * **Four, each named for what it holds** (requirement 24 of effort 828). There were seven, and
 * two of them named a mechanism rather than a thing a person is looking for: somebody wanting to
 * change who may do what read *members*, *sync* and *you* and had to guess which one the answer
 * was under. General took updates and diagnostics, which nobody opens twice; account took what
 * the you section held; organization took the members directory and the Turso account.
 *
 * The order is this module's, and the rail draws them in it while the palette offers them in it.
 */
export const SETTINGS_SECTIONS = ['general', 'account', 'organization', 'workspaces'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * The names that are gone, each against the section that holds what it held.
 *
 * **An address outlives the arrangement that made it.** A bookmark, a link somebody was sent and
 * the trail a reader came back through all name a section by the word it had, so a retired name
 * opens the section that took its blocks rather than the first one. `withSection` writes the
 * live address for either word, and `sectionOf` reads either.
 *
 * Nothing is drawn from this: it is the record of one rename, and it stops mattering the day
 * every address carrying one of these words is older than anybody's bookmarks.
 */
export const SECTION_HOLDING = {
	you: 'account',
	members: 'organization',
	sync: 'organization',
	updates: 'general',
	diagnostics: 'general'
} as const satisfies Record<string, SettingsSection>;

/** what a section was called before the four (requirement 24 of effort 828). */
export type RetiredSection = keyof typeof SECTION_HOLDING;

/** what an address may name: one of the four, or a word one of them used to go by. */
export type AddressableSection = SettingsSection | RetiredSection;

/** the section holding `S`, which is `S` itself where `S` is one of the four. */
type Holding<S extends AddressableSection> = S extends RetiredSection
	? (typeof SECTION_HOLDING)[S]
	: S;

/** The section that holds what `section` named; `section` itself where it is one of the four. */
export function holdingSection<S extends AddressableSection>(section: S): Holding<S> {
	return (SECTION_HOLDING[section as RetiredSection] ?? section) as Holding<S>;
}

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
 * The acts that make the members directory worth drawing.
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
 * `/settings`, opened at `section`, which may be a name that is gone: the address is the live
 * one either way, so nothing written here sends a reader to a word the area no longer draws.
 *
 * The result keeps the literal route and the literal section, because `resolve` reads the route
 * out of the type it is handed and cannot match a widened one. `create-intent.ts`'s
 * `withCreateIntent` is typed the same way and says so at more length.
 */
export function withSection<S extends AddressableSection>(
	section: S
): `${typeof THE_SETTINGS_AREA}?${typeof SECTION_PARAM}=${Holding<S>}` {
	return `${THE_SETTINGS_AREA}?${SECTION_PARAM}=${holdingSection(section)}`;
}

/**
 * Which section `url` names: the one it names, the one holding the retired name it names, or
 * `general` where it names none and where it names nothing this module has heard of.
 */
export function sectionOf(url: URL): SettingsSection {
	const named = url.searchParams.get(SECTION_PARAM);

	return (
		SETTINGS_SECTIONS.find((section) => section === named) ??
		SECTION_HOLDING[named as RetiredSection] ??
		DEFAULT_SECTION
	);
}

/**
 * Which record `url` names inside its section, or `null` where it names none.
 *
 * `param` is what the section names its records by, `member` where it is not said: one function
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
 * Whether this reader has anything to do on a directory of people.
 *
 * It gated the members section while there was one. The directory is a block of the organization
 * section now, so the same answer gates the block, and the section itself is offered to anybody
 * signed in: what else it holds, the sync status and the way out of the organization, is read by
 * every member.
 */
export function administersMembers(session: OrganizationSession | null): boolean {
	return MEMBER_ACTS.some((act) => permits(session?.permissions ?? 0, act));
}

/**
 * The sections this reader is offered, in order.
 *
 * **A section with nothing to show for this member is absent, not empty** (requirement 14 of
 * effort 826). Signed out, general is the whole of it: the area is still the one address that
 * draws with nobody signed in, and the other three each need an organization. What general holds
 * there is the language, the ending-soon figure, updates and diagnostics, which is everything the
 * three signed-out sections held between them before the four.
 *
 * @param holdsTursoAuthority whether this machine holds the Turso authority. It decides what the
 * organization section *contains*, the reconnect in place of the account, rather than whether the
 * section is offered, since a member reads the sync status either way. It is taken here because
 * the area is handed one answer about who is reading rather than two.
 */
export function sectionsFor(
	session: OrganizationSession | null,
	// taken and not read, for the reason the docstring gives: the flag decides what the
	// organization section draws rather than whether it is offered, and the area reads it from its
	// own prop.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	holdsTursoAuthority: boolean
): SettingsSection[] {
	if (!session) {
		return ['general'];
	}

	return [...SETTINGS_SECTIONS];
}
