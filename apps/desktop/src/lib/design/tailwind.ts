/*
 * the module moved into `@rentable/design` and this file is what keeps its callers reading as
 * they did. `cn` is the one helper every packaged component needs, and the first of them crossed
 * here, so the helper had to cross with it.
 *
 * **it is temporary and #778 deletes it.** that ticket moves the 38 string-free primitive
 * families and rewrites every `$lib/design/` specifier in one substitution; rewriting them here
 * instead would edit the same lines twice and make this diff unreadable.
 *
 * two things have to happen on the day it goes, and neither is visible from the line below.
 * there are 279 import sites under `apps/desktop/src`, and **ten of them name this file without
 * an extension**, `$lib/design/tailwind` rather than `$lib/design/tailwind.js`, which a prefix
 * substitution alone leaves behind, because a specifier crossing the package boundary has to
 * name a file. and `components.json` points its `utils` alias here, so it needs repointing at
 * whatever survives or the next primitive the shadcn cli writes imports nothing.
 */
export * from '@rentable/design/tailwind.js';
