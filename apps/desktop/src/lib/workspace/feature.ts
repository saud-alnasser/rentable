import { defineFeature } from '$lib/feature/feature';

// the workspace declares nothing that loads under Node: no router, no kind, no cache prefix and no
// page of its own. It is listed so every feature has one declaration here, as the canonical shape
// asks; what it draws, its row at the top of the rail and its permissions, is its `surface.ts`.
export default defineFeature({ name: 'workspace' });
