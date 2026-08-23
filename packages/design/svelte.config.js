// The package is not a SvelteKit application: no adapter, no routes, no `kit` block. What a
// config buys a library is the preprocessor, which is what lets a component here be written
// with `lang="ts"`, and a project for the shadcn-svelte CLI to read.
//
// It deliberately declares no alias. An alias in a library is rewritten by `svelte-package`
// on the way out, and this package has no build step, so a `$lib/...` specifier would reach
// the consumer unrewritten and resolve against the consumer's own library directory. The
// package names its own files with the subpath imports in `package.json` instead.
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
const config = {
	preprocess: vitePreprocess()
};

export default config;
