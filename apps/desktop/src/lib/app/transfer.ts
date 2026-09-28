import { bindTransfer } from '$lib/transfer';
import { features } from './features';

/**
 * THE SHEETS
 *
 * binds every feature's sheets into `$lib/transfer`, which reads a workspace file and writes one
 * in the window as its router does behind the caller. It runs once, when this module is first
 * evaluated; the root layout imports it beside `$lib/app/caller`, before anything can open a
 * file. The router is built from the same list, in `features.ts`.
 */
bindTransfer(features);
