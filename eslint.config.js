import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './apps/desktop/svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	{
		// `includeIgnoreFile` reads only the root .gitignore, which covers neither the Rust
		// build output nor the typesafe-i18n generated modules. Both are machine-written, so
		// anything reported in them is unfixable at the source and `tauri/target` alone is
		// over a hundred files of build output to walk.
		//
		// `.aep/scripts` is the same case for a different reason: the protocol ships those
		// files and every `/aep:update` replaces them, so a fix applied here is gone on the
		// next upgrade and reads as a local edit to the one after that.
		ignores: ['**/tauri/**', '**/src/lib/i18n/i18n-*.ts', '.aep/scripts/**']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
