// The lint tests' source scanner, bound to this application's `src/`. Not a `*.test.ts` file, so
// the test runner does not pick it up directly.
//
// The scanner itself is `@rentable/testing/source`, and the design package binds the same one to
// its own tree. Only the root differs, which is all this file holds.

import { sourceTree } from '@rentable/testing/source';

export const { SRC_ROOT, sourceFiles } = sourceTree(new URL('..', import.meta.url));
