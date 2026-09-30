// Shared fixtures for the settings port: a port holding a settings file in memory, and the
// payload it speaks in. Not a `*.test.ts` file, so the test runner does not pick it up directly.
// `app/tests/host.ts` composes the port into the whole `Host`.

import type { Settings, SettingsHost } from '$lib/settings/host.ts';

/** The settings a fake shell reports, with only what a test cares about spelled out. */
export function fakeSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		endingSoonNoticeDays: 60,
		databasePath: 'C:/rentable/app.db',
		diagnosticsDir: 'C:/rentable/diagnostics',
		locale: 'en',
		appearance: 'system',
		version: '0.0.0-test',
		earlierRecordsSettled: false,
		...overrides
	};
}

/** The settings port over one fake settings file, as `fakeHost` hands it over. */
export function fakeSettingsHost(): SettingsHost {
	const settings = fakeSettings();

	return {
		get: async () => settings,
		// what the shell does with a changeset: a member it names is written, and one it leaves
		// out keeps what it was.
		set: async (changeset) => {
			for (const [key, value] of Object.entries(changeset)) {
				if (value !== undefined) Object.assign(settings, { [key]: value });
			}

			return settings;
		}
	};
}
