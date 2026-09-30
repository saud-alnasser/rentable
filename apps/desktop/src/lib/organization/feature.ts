import { defineFeature } from '$lib/feature/feature';
import router from './router';

// the way in: a walk on a card that says which step it is on, so the trail names neither page. A
// trail above it would name a place the reader is passing through rather than one to return to.
export default defineFeature({
	name: 'organization',
	router,
	pages: [{ route: '/organization/new' }, { route: '/organization/join' }]
});
