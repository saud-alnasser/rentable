/**
 * HOST
 *
 * the desktop shell as a declared interface, and the payload types it speaks in.
 *
 * The port sits here rather than beside its implementation on purpose: a client that is not
 * the Tauri shell has to be able to satisfy it, and a port declared inside the facade would
 * put that facade — and every `@tauri-apps` package it imports — into such a client's graph
 * just to read a type. Nothing in this file imports one, and that is the property to keep.
 *
 * Which of these capabilities mean anything away from the desktop is a separate question and
 * is not answered here. There is one implementation, and no second one is being built.
 *
 * **What is a feature's is the feature's.** Each feature or capability that crosses to Rust
 * declares its own port in its `host.ts` (the organization's, sync's, update's, print's,
 * transfer's, the workspace's, settings' and startup's), and `$lib/app/host` composes them with
 * this into the application's `Host`. What is left here is no feature's: the window, the
 * opener, the dialogs and diagnostics.
 */

export type DiagnosticRecord = {
	level: 'info' | 'warn' | 'error';
	event: string;
	fields: Record<string, string>;
};

/** what a listener hands back to stop listening. */
export type Unlisten = () => void;

/**
 * what the API may ask of the shell it runs in, less what a feature's own port declares.
 *
 * Declared, not read off an implementation — that is the whole of it. The Tauri facade
 * satisfies this interface and the compiler says so, so the two cannot drift quietly, and a
 * second client kind becomes an implementation of this rather than a rewrite of that.
 *
 * **Not the whole host.** A feature that crosses to Rust declares its own port in its
 * `host.ts`, and `$lib/app/host` composes the application's `Host` from this and each of those.
 */
export type PlatformHost = {
	window: {
		show: () => Promise<void>;
		hide: () => Promise<void>;
		minimize: () => Promise<void>;
		maximize: () => Promise<void>;
		drag: () => Promise<void>;
		close: () => Promise<void>;
		restart: () => Promise<void>;
	};
	opener: {
		openUrl: (url: string) => Promise<void>;
		revealItemInDir: (path: string) => Promise<void>;
	};
	dialog: {
		/** Ask the user for a file, answering its path or nothing where they walked away. */
		openFile: () => Promise<string | null>;
		/** Ask the user for an image, a PNG, JPEG or WebP, answering its path or nothing. */
		openImage: () => Promise<string | null>;
		/** Ask the user where a file goes, answering its path or nothing where they walked away. */
		saveFile: (defaultName: string) => Promise<string | null>;
	};
	diagnostics: {
		write: (record: DiagnosticRecord) => Promise<void>;
		/**
		 * The folder this machine keeps its diagnostics file in, or an empty string where it keeps
		 * none. Read off the settings the shell holds, where it has always been reported, and
		 * declared here because the screens that open it are drawn when nothing else can be relied
		 * on and are no feature's.
		 */
		directory: () => Promise<string>;
	};
};
