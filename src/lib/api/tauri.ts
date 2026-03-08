import { invoke } from '@tauri-apps/api/core';

/**
 * any tauri commands that are available to the API.
 */
export const tauri = {
	example: {
		greet: (name: string) => invoke<string>('greet', { name })
	},
	window: {
		show: () => invoke<void>('window_show'),
		minimize: () => invoke<void>('window_minimize'),
		toggleMaximize: () => invoke<void>('window_toggle_maximize'),
		startDragging: () => invoke<void>('window_start_dragging'),
		close: () => invoke<void>('window_close')
	},
	db: {
		exists: () => invoke<boolean>('db_does_exist'),
		ready: () => invoke<boolean>('db_is_ready'),
		connect: () => invoke<void>('db_connect'),
		disconnect: () => invoke<void>('db_disconnect'),
		purge: () => invoke<void>('db_purge')
	}
};
