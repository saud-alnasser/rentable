import { defineFeature } from '$lib/feature/feature';
import router from './router';

export default defineFeature({
	name: 'contract',
	router,
	kind: 'contract',
	prefix: ['contracts'],
	pages: [
		{ route: '/contracts', trail: true, lists: 'contract' },
		{ route: '/contracts/[id]' },
		{ route: '/contracts/units/[id]' }
	]
});
