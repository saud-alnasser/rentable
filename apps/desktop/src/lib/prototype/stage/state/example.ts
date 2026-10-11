import type { StateFile } from '../state';

/**
 * The tour: the main screens on the mock workspace, as the owner sees them. It is what the bar
 * opens on when no effort has staged its own states, and a quick look that staging still boots.
 */
export const states: StateFile['states'] = [
	{
		id: 'example.landing',
		label: 'landing',
		look: 'the landing screen: figures, the ring and the sections, on the mock workspace.',
		route: '/'
	},
	{
		id: 'example.tenants',
		label: 'tenants',
		look: 'the tenants directory, filled.',
		route: '/tenants'
	},
	{
		id: 'example.complexes',
		label: 'complexes',
		look: 'the complexes directory, filled.',
		route: '/complexes'
	},
	{
		id: 'example.contracts',
		label: 'contracts',
		look: 'the contracts directory, with every status.',
		route: '/contracts'
	}
];
