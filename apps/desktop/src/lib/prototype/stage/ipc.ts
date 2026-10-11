/**
 * What `@tauri-apps/api/core`'s `invoke` is for the application's own modules under staging
 * (`./vite.js`), and what the IPC mocks answer in a browser: one answer, set by `./host.ts`.
 *
 * In the desktop window the shell's internals are read-only, so the mocks cannot stand in for
 * them there; this is what keeps every command the interface sends, there as in a browser, from
 * the shell.
 */

type Answer = (command: string, args: Record<string, unknown>) => unknown;

let answer: Answer | null = null;

/** the staged host's answer to every command, set once it is in place. */
export function answerWith(next: Answer) {
	answer = next;
}

export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
	if (!answer) throw new Error(`stage: ${command} was sent before the staged host was in place`);

	return (await answer(command, args)) as T;
}
