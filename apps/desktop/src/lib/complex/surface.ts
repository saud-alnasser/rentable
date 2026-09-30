import { resolve } from '$app/paths';
import { toPaletteActs } from '$lib/act';
import { withCreateIntent } from '$lib/create';
import { defineSurface } from '$lib/feature/surface';
import HouseIcon from '@lucide/svelte/icons/house';
import host from './component/host.svelte';
import { complexActs, complexHost } from './host.svelte';
import { useSearchComplexes } from './query';

export default defineSurface({
	name: 'complex',
	record: { kind: 'complex', glyph: HouseIcon },
	places: [
		{ route: '/complexes', label: (t) => t.common.nav.complexes(), icon: HouseIcon, rail: true }
	],
	// a complex stands on its own, so it is made in its directory, where it will be listed.
	create: {
		subject: 'complex',
		label: (t) => t.common.labels.complex(),
		flags: ['createComplex'],
		kind: 'directory',
		directory: '/complexes',
		href: resolve(withCreateIntent('/complexes'))
	},
	search: [
		{
			subject: 'complex',
			kind: 'complex',
			heading: (t) => t.common.nav.complexes(),
			href: (match) => resolve(`/complexes/${match.id}`),
			find: (term, _asked, { limit }) => useSearchComplexes(term, limit)
		}
	],
	acts: [
		{
			subject: 'complex',
			kind: 'complex',
			use: () => ({
				offered: (t, isAppleKeyboard) => toPaletteActs(complexActs, t, isAppleKeyboard),
				runOn: (actId, complexId) => complexHost.runOn(actId, complexId)
			})
		}
	],
	host
});

// the unit's, which `app/` reaches through here: a sub-concept is not a home of its own.
export { default as unit } from './unit/surface';
