import { defineSurface } from '$lib/feature/surface';
import host from './component/permissions.svelte';
import railRow from './component/rail-row.svelte';

/**
 * The workspace's host, what the reader may do to the records of the workspace open, and the row
 * naming that workspace at the top of the rail.
 */
export default defineSurface({
	name: 'workspace',
	host,
	slots: [{ slot: 'workspace-menu', component: railRow }]
});
