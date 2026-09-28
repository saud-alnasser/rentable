import { defineFeature } from '$lib/feature/feature';
import router from './router';

export default defineFeature({
	name: 'tenant',
	router,
	pages: [{ route: '/tenants', trail: true, lists: 'tenant' }, { route: '/tenants/[id]' }]
});
