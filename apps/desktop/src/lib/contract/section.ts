/**
 * A CONTRACT'S SECTIONS, AND HOW ONE IS ADDRESSED
 *
 * A contract's page shows one of its collections at a time, and the address names which:
 * `?section=<name>`, the idiom every record surface and the settings area read. Payments lead,
 * so a contract's own address, carrying no section, is its payments.
 *
 * Here rather than inline in the route, so that what an address opens is one answer a
 * `node:test` can ask without rendering a page.
 */

/** The sections, in the order the page draws them. */
export const CONTRACT_SECTIONS = ['payments', 'units', 'history'] as const;

export type ContractSection = (typeof CONTRACT_SECTIONS)[number];

/** what names a section in the address. */
export const SECTION_PARAM = 'section';

/**
 * Which section `url` opens: the one it names, or payments where it names none and where it
 * names one a contract does not have.
 */
export function contractSectionOf(url: URL): ContractSection {
	const named = url.searchParams.get(SECTION_PARAM);

	return CONTRACT_SECTIONS.find((section) => section === named) ?? 'payments';
}
