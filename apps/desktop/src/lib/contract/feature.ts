import { defineFeature } from '$lib/feature/feature';
import router from './router';
import contracts from './transfer';

export default defineFeature({
	name: 'contract',
	router,
	kind: 'contract',
	prefix: ['contracts'],
	transfer: [contracts],
	pages: [
		{ route: '/contracts', trail: true, lists: 'contract' },
		{ route: '/contracts/[id]' },
		{ route: '/contracts/units/[id]' }
	]
});
