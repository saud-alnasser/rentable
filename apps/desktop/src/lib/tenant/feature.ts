import { defineFeature } from '$lib/feature/feature';
import router from './router';
import tenants from './transfer';

export default defineFeature({
	name: 'tenant',
	router,
	kind: 'tenant',
	prefix: ['tenants'],
	transfer: [tenants],
	pages: [{ route: '/tenants', trail: true, lists: 'tenant' }, { route: '/tenants/[id]' }]
});
