// The command menu, which its host mounts once among the others (`surface.ts`), and what the frame
// reaches it by: the state its search button opens it with, what it hands the menu, and the hint
// that button prints for the menu's key. The menu itself, for a test rendering it beside a screen.
// `component/` stays private (plan, *The canonical concept shape*).
export { default as Palette, PALETTE_SHORTCUT_HINT } from './component/palette.svelte';
export { openPalette, providePalette } from './menu.svelte';
