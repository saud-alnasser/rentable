import { GOOGLE_UNREACHABLE, INCOMPLETE, NOT_VERIFIED, Refusal } from './failure.ts';

/** who Google says an access token belongs to. */
export type GoogleIdentity = {
	/**
	 * Google's OpenID subject — the `sub` claim. **Not the desktop's `providerUserId`**, which
	 * is Drive's `permissionId` and identifies the same person under a different scheme
	 * (`apps/desktop/tauri/src/sync/google/files.rs`, `DriveAbout::into_account_details`).
	 * Matching on `sub` is what makes an email change harmless.
	 */
	subject: string;
	email: string;
	displayName: string;
	avatarUrl: string | null;
};

/**
 * Google's OpenID UserInfo endpoint.
 *
 * **The verification is the call itself.** An access token is opaque — nothing about it can be
 * checked locally — so asking the issuer who it belongs to is both the only way to learn that
 * and the only way to learn it is still live. A token revoked a minute ago fails here, which a
 * signature check on a self-contained ID token would not have noticed until it expired.
 */
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

export type VerifyGoogleIdentity = (accessToken: string) => Promise<GoogleIdentity>;

type UserInfo = {
	sub?: unknown;
	email?: unknown;
	name?: unknown;
	picture?: unknown;
};

const text = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * Verify a Google access token against Google, and read the identity out of the answer.
 *
 * `endpoint` and `fetch` are arguments so a test can answer as Google without a network and
 * without a credential — the same reason the desktop's host is a port rather than a call.
 */
export const verifyAgainstGoogle =
	({
		endpoint = GOOGLE_USERINFO_ENDPOINT,
		fetch: request = fetch
	}: { endpoint?: string; fetch?: typeof fetch } = {}): VerifyGoogleIdentity =>
	async (accessToken) => {
		let response: Response;

		try {
			response = await request(endpoint, {
				headers: { authorization: `Bearer ${accessToken}` }
			});
		} catch {
			// The control plane could not ask. Distinct from Google having answered *no*, and the
			// caller's next move differs: this one is worth retrying with the same token.
			throw new Refusal(
				GOOGLE_UNREACHABLE,
				503,
				'could not reach google to check who you are. try again in a moment'
			);
		}

		if (response.status === 401 || response.status === 403) {
			throw new Refusal(
				NOT_VERIFIED,
				401,
				'google would not confirm this sign-in. sign in with google again'
			);
		}

		if (!response.ok) {
			throw new Refusal(
				GOOGLE_UNREACHABLE,
				503,
				'google could not answer just now. try again in a moment'
			);
		}

		const info = (await response.json().catch(() => ({}))) as UserInfo;
		const subject = text(info.sub);
		const email = text(info.email);

		// Refused rather than worked around, and deliberately: the alternative is falling back to
		// the email as the identifier, which is the exact thing acceptance criterion 2 rules out.
		// `sub` arrives because the desktop asks for the `openid` scope; if it stops arriving,
		// that is what has broken and this is where it says so.
		if (!subject || !email) {
			throw new Refusal(
				INCOMPLETE,
				502,
				'google did not say who this sign-in belongs to. sign in with google again'
			);
		}

		return {
			subject,
			email,
			// Not everybody has set a name. The email is what a person recognises themselves by
			// when they have not, and an empty display name would render as a blank row.
			displayName: text(info.name) ?? email,
			avatarUrl: text(info.picture)
		};
	};
