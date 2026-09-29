/**
 * PRINT
 *
 * The print capability: one sheet the frame mounts, a page handed to it and printed on paper or to
 * a PDF, and the port it asks the shell through. What prints is the window's, so the sheet, the
 * preview and handing a page over are reached through `ui.ts`; this file holds what loads under
 * Node, which is the shape of a request and of the port.
 */
export type { PrintHost } from './host';
export type { PrintedPage, PrintRequest } from './sheet.svelte';
