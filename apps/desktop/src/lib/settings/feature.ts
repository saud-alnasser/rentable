import { defineFeature } from '$lib/feature/feature';
import router from './router';

export default defineFeature({
	name: 'settings',
	router,
	pages: [{ route: '/settings', trail: true }]
});
