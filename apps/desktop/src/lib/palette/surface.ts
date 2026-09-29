import { defineSurface } from '$lib/feature/surface';
import host from './component/host.svelte';

/**
 * The command menu's host, which the frame mounts among the others in `app/surfaces.ts`'s order.
 * What the menu finds, creates and does to a record is every other surface's to declare.
 */
export default defineSurface({ name: 'palette', host });
