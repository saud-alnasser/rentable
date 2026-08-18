// `mock.module()` takes an `exports` object on the runtime this repository runs — Node 24.18
// accepts it, and `namedExports` is the deprecated spelling that warns (see
// `.aep/references/node-test.md`). `@types/node@24.13.3` is the newest of its line and still
// declares only `namedExports`, so the option every module mock here passes is one the types
// do not know about.
//
// Declared rather than silenced: the runtime has this option, and the gap is DefinitelyTyped's.
// Delete this file when the 24.x types catch up — `exports` already appears upstream.
declare module 'node:test' {
	namespace test {
		interface MockModuleOptions {
			/** the mocked module's exports, `default` included. */
			exports?: object | undefined;
		}
	}
}

export {};
