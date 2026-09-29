import { resolve } from '$app/paths';
import { toPaletteActs } from '$lib/act';
import { withCreateIntent } from '$lib/create';
import { defineSurface } from '$lib/feature/surface';
import UserIcon from '@lucide/svelte/icons/user';
import host from './component/host.svelte';
import { tenantActs, tenantHost } from './host.svelte';
import { useSearchTenants } from './query';

export default defineSurface({
	name: 'tenant',
	record: { kind: 'tenant', glyph: UserIcon },
	places: [{ route: '/tenants', label: (t) => t.common.nav.tenants(), icon: UserIcon, rail: true }],
	// a tenant stands on its own, so it is made in its directory, where it will be listed.
	create: {
		subject: 'tenant',
		label: (t) => t.common.labels.tenant(),
		flags: ['createTenant'],
		kind: 'directory',
		directory: '/tenants',
		href: resolve(withCreateIntent('/tenants'))
	},
	search: [
		{
			subject: 'tenant',
			kind: 'tenant',
			heading: (t) => t.common.nav.tenants(),
			href: (match) => resolve(`/tenants/${match.id}`),
			find: (term, _asked, { limit }) => useSearchTenants(term, limit)
		}
	],
	acts: [
		{
			subject: 'tenant',
			kind: 'tenant',
			use: () => ({
				offered: (t, isAppleKeyboard) => toPaletteActs(tenantActs, t, isAppleKeyboard),
				runOn: (actId, tenantId) => tenantHost.runOn(actId, tenantId)
			})
		}
	],
	host
});
