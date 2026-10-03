import { defineFeature } from '$lib/feature/feature';
import router from './router';

// the way in: a walk on a card that says which step it is on, so the trail names neither page. A
// trail above it would name a place the reader is passing through rather than one to return to.
// A workspace's page sits under the settings area it is listed in (effort 846, ticket 49), so its
// trail runs from the settings to the workspace.
export default defineFeature({
	name: 'organization',
	router,
	pages: [
		{ route: '/organization/new' },
		{ route: '/organization/join' },
		{ route: '/settings/workspaces/[id]' }
	]
});
