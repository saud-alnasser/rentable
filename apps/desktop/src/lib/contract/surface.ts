import { defineSurface } from '$lib/feature/surface';
import ContractIcon from '@lucide/svelte/icons/scroll-text';
import host from './component/host.svelte';

export default defineSurface({
	name: 'contract',
	places: [
		{ route: '/contracts', label: (t) => t.common.nav.contracts(), icon: ContractIcon, rail: true }
	],
	host
});
