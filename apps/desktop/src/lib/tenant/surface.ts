import { defineSurface } from '$lib/feature/surface';
import UserIcon from '@lucide/svelte/icons/user';
import host from './component/host.svelte';

export default defineSurface({
	name: 'tenant',
	places: [{ route: '/tenants', label: (t) => t.common.nav.tenants(), icon: UserIcon, rail: true }],
	host
});
