import { defineFeature } from '$lib/feature/feature';
import router from './router';

// the page the application opens on, which the trail does not name: a trail starting from it
// would say the same first word on every screen.
export default defineFeature({ name: 'dashboard', router, pages: [{ route: '/' }] });
