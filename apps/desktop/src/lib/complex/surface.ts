import { defineSurface } from '$lib/feature/surface';
import host from './component/host.svelte';

export default defineSurface({ name: 'complex', host });

// the unit's, which `app/` reaches through here: a sub-concept is not a home of its own.
export { default as unit } from './unit/surface';
