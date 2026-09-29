import { resolve } from '$app/paths';
import { toPaletteActs } from '$lib/act';
import { defineSurface } from '$lib/feature/surface';
import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
import { useSearchUnits } from './query';
import host from './component/host.svelte';
import { unitActs, unitHost } from './host.svelte';

export default defineSurface({
	name: 'unit',
	// the grid a complex's row in the complexes directory counts its units with.
	record: { kind: 'unit', glyph: LayoutGridIcon },
	// a unit cannot be without its complex, so the menu asks for the complex first, and the reader
	// has to be able to see complexes to choose one.
	create: {
		subject: 'unit',
		label: (t) => t.common.labels.unit(),
		flags: ['createUnit', 'viewComplex'],
		kind: 'asks',
		asks: 'complex',
		create: (complexId) => unitHost.create({ complexId })
	},
	search: [
		{
			subject: 'unit',
			kind: 'unit',
			heading: (t) => t.common.nav.units(),
			href: (match) => resolve(`/complexes/units/${match.id}`),
			find: (term, _asked, { limit }) => useSearchUnits(term, limit)
		}
	],
	acts: [
		{
			subject: 'unit',
			kind: 'unit',
			use: () => ({
				offered: (t, isAppleKeyboard) => toPaletteActs(unitActs, t, isAppleKeyboard),
				runOn: (actId, unitId) => unitHost.runOn(actId, unitId)
			})
		}
	],
	host
});
