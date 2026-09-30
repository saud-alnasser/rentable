// Shared fixtures for the desktop shell's platform port: a host implementing the whole of it, and
// the refusing member every fake port is built from. Not a `*.test.ts` file, so the test runner
// does not pick it up directly.
//
// They live here rather than beside each caller because the port is one declaration: a fixture
// holding the two members a subject happens to read is a shape the shell never produces, and
// every test that wrote one out by hand wrote a different one.
//
// A feature's port has fixtures of its own beside it, with the payloads it speaks in
// (`organization/tests/testing.ts`, `sync/tests/testing.ts` and the rest), and `app/tests/host.ts`
// composes them with this into the whole `Host` a context is handed.

import type { PlatformHost } from '$lib/platform/host.ts';

/**
 * a member of a fake port that refuses by name, saying which capability a test reached for and
 * did not supply. Every fake port builds its members from it.
 */
export function refuse(capability: string): () => never {
	return () => {
		throw new Error(`the fake host was asked for ${capability}, which this test did not supply`);
	};
}

/**
 * The platform's part of a host, implementing the whole of it, so a fixture satisfies the
 * interface a subject is handed rather than the corner of it that subject happens to read.
 *
 * Every capability a test does not supply refuses by name. That is what the partial object
 * literals here did already — reaching one of them threw a `TypeError` about `undefined` —
 * except that this one says which capability was wanted, and the compiler can see the whole
 * surface rather than the two members that happened to be written out.
 *
 * `overrides` replaces a capability whole, never a member of one: a half-supplied `dialog` is
 * the same hole this exists to close.
 */
export function fakePlatformHost(overrides: Partial<PlatformHost> = {}): PlatformHost {
	return {
		window: {
			show: refuse('window.show'),
			hide: refuse('window.hide'),
			minimize: refuse('window.minimize'),
			maximize: refuse('window.maximize'),
			drag: refuse('window.drag'),
			close: refuse('window.close'),
			restart: refuse('window.restart')
		},
		opener: {
			openUrl: refuse('opener.openUrl'),
			revealItemInDir: refuse('opener.revealItemInDir')
		},
		dialog: {
			openFile: refuse('dialog.openFile'),
			openImage: refuse('dialog.openImage'),
			saveFile: refuse('dialog.saveFile')
		},
		diagnostics: {
			write: refuse('diagnostics.write'),
			directory: refuse('diagnostics.directory')
		},
		...overrides
	};
}
