import { defineFeature } from '$lib/feature/feature';
import router from './router';

export default defineFeature({
	name: 'tenant',
	router,
	kind: 'tenant',
	prefix: ['tenants'],
	pages: [{ route: '/tenants', trail: true, lists: 'tenant' }, { route: '/tenants/[id]' }]
});
