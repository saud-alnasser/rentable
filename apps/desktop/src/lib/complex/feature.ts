import { defineFeature } from '$lib/feature/feature';
import router from './router';

export default defineFeature({
	name: 'complex',
	router,
	pages: [
		{ route: '/complexes', trail: true, lists: 'complex' },
		{ route: '/complexes/[id]' },
		// a unit is listed inside its complex and reached through it: its address sits under
		// `/complexes` without a page at `/complexes/units`, so its trail runs through the complex.
		{ route: '/complexes/units/[id]', parent: '/complexes/[id]' }
	]
});
