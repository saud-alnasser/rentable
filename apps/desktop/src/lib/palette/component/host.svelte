<script lang="ts">
	import { paletteMenu, usePalette } from '../menu.svelte';
	import Palette from './palette.svelte';

	/**
	 * The command menu's host: the menu, mounted once where `app/surfaces.ts` puts it among the
	 * hosts, bound to the state its trigger raises and handed what the frame provides
	 * (`menu.svelte.ts`).
	 */
	const { palette, destinations } = usePalette();
</script>

<Palette bind:open={paletteMenu.open} {palette} destinations={destinations()} />
