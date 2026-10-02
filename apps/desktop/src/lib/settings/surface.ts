import { defineSurface } from '$lib/feature/surface';
import { SECTION_GLYPH } from './glyph';
import { withSection } from './section';

/**
 * The settings area's places: the area itself, which the trail names, and its four sections, each
 * a destination at its own address.
 *
 * **The rail draws none of these**, since 2026-08-20: its footer is the account control, and
 * settings is one row inside that control's menu. The sections stay because the command menu
 * offers them, and a person who knows what they want to change is asking for the section rather
 * than for the page it is on.
 *
 * **Four rows on one pathname**, since 2026-09-14, where there were four pathnames before: the
 * three pages this replaced retired with requirement 14 of effort 826. `withSection` is what
 * writes each address, so the parameter's name is written once. *There were seven rows until
 * requirement 24 of effort 828 named the sections for what they hold; updates, diagnostics, the
 * you section and the sync section are each part of one of these four now, so a person searching
 * for one of those words is offered the row it is on rather than a row of its own.*
 *
 * The order is `section.ts`'s, so the command menu offers them in the order the area draws them.
 * Each row's glyph is `glyph.ts`'s, which the area's section switch reads too, so the menu and the
 * switch draw a section with the same picture.
 */
export default defineSurface({
	name: 'settings',
	places: [
		{ route: '/settings', label: (t) => t.common.nav.settings() },
		{
			route: '/settings',
			url: withSection('general'),
			label: (t) => t.settings.section.general(),
			icon: SECTION_GLYPH.general
		},
		{
			route: '/settings',
			url: withSection('account'),
			label: (t) => t.settings.section.account(),
			icon: SECTION_GLYPH.account
		},
		{
			route: '/settings',
			url: withSection('organization'),
			label: (t) => t.settings.section.organization(),
			icon: SECTION_GLYPH.organization
		},
		{
			route: '/settings',
			url: withSection('workspaces'),
			label: (t) => t.settings.section.workspaces(),
			icon: SECTION_GLYPH.workspaces
		}
	]
});
