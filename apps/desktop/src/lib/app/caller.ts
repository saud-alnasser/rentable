import { bindCaller } from '$lib/api/caller';
import { caller } from '$lib/api/trpc';
import { host } from './host';
import { appRouter } from './router';

/**
 * THE BINDING
 *
 * binds the root router into `$lib/api/caller`, the caller every feature calls its procedures
 * through, with the host its context is built over. It runs once, when this module is first
 * evaluated, and the root layout imports it before anything else, so the binding is in place
 * before any component can call a procedure.
 */
bindCaller(caller(appRouter), host);
