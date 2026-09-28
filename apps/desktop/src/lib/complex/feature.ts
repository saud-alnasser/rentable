import { defineFeature } from '$lib/feature/feature';
import router from './router';
import complexes from './transfer';

// the unit's, which `app/` reaches through here: a sub-concept is not a home of its own.
export { default as unit } from './unit/feature';

export default defineFeature({
	name: 'complex',
	router,
	kind: 'complex',
	prefix: ['complexes'],
	transfer: [complexes],
	pages: [
		{ route: '/complexes', trail: true, lists: 'complex' },
		{ route: '/complexes/[id]' },
		// a unit is listed inside its complex and reached through it: its address sits under
		// `/complexes` without a page at `/complexes/units`, so its trail runs through the complex.
		{ route: '/complexes/units/[id]', parent: '/complexes/[id]' }
	]
});
