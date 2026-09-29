import { defineFeature } from '$lib/feature/feature';
import router from './router';
import { TENANT_KIND } from './tenant';
import tenants from './transfer';

export default defineFeature({
	name: 'tenant',
	router,
	kind: TENANT_KIND,
	prefix: ['tenants'],
	transfer: [tenants],
	pages: [{ route: '/tenants', trail: true, lists: TENANT_KIND }, { route: '/tenants/[id]' }]
});
