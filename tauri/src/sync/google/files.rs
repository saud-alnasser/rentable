//! the Drive operations this application issues. The Drive operation port
//! (#117) lands here.
//!
//! [`DriveTransport`] decides how a request is sent; this decides which
//! requests exist. Almost everything on Drive is a file — a snapshot, a
//! manifest, and a folder alike — so resolving a folder or a manifest is a
//! search for a particular file rather than a separate kind of thing. The
//! exception is the account behind the token, which is a property of the
//! credential rather than of anything stored.

use std::collections::{BTreeMap, HashSet};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};
use reqwest::Method;
use serde::Deserialize;
use url::Url;

use crate::error::Error;
use crate::timestamp;

use super::super::store::RemoteSyncWorkspace;
use super::conflict::{
    content_hash_hex, did_remote_head_change_from_manifest, is_cryptographic_content_hash,
    normalize_content_hash,
};
use super::manifest::{
    GoogleDriveManifest, GoogleDriveManifestEntryOverrides, MANIFEST_FILE_TYPE, MANIFEST_FILENAME,
    build_google_drive_manifest_from_snapshots, is_canonical_snapshot_filename,
    is_tracked_manifest_file_for_folder, normalize_google_drive_manifest,
};
use super::metadata::{
    DEVICE_ID_PROPERTY, DriveFile, FILE_TYPE_PROPERTY, GoogleDriveSnapshotSource,
    SNAPSHOT_APP_VERSION_PROPERTY, SNAPSHOT_CONTENT_HASH_PROPERTY, SNAPSHOT_CREATED_AT_PROPERTY,
    SNAPSHOT_SOURCE_PROPERTY, WORKSPACE_ID_PROPERTY, parse_drive_number,
};
use super::retention::{
    GoogleDriveRetainedSnapshot, choose_evictable_workspace_snapshots,
    choose_retained_workspace_snapshots, compare_drive_files_by_snapshot_recency,
};
use super::transport::{DriveRequest, DriveResponse, DriveTransport, GOOGLE_DRIVE_API_BASE_URL};

/// where content is uploaded. Drive answers metadata requests and content
/// uploads on different hosts, so an operation needs to know which it is.
const GOOGLE_DRIVE_UPLOAD_BASE_URL: &str = "https://www.googleapis.com/upload/drive/v3";

/// the fields every file request asks for. Drive returns only what was asked
/// for, so this list is what makes [`DriveFile`]'s optional fields arrive at
/// all — dropping one from here silently empties it everywhere.
const DRIVE_FILE_FIELDS: &str =
    "id,name,modifiedTime,version,size,md5Checksum,parents,appProperties";

/// the fields the account read asks for. Same rule as [`DRIVE_FILE_FIELDS`]:
/// what is not asked for does not arrive, so this list is the whole of what an
/// account read can produce.
const DRIVE_ABOUT_FIELDS: &str =
    "user(displayName,emailAddress,photoLink,permissionId),storageQuota(limit,usage)";

/// how many files a listing asks for when it wants all of them. A workspace
/// folder holds one manifest and a handful of snapshots, so a folder with more
/// than this in it holds something this application did not put there.
const MAX_LISTED_FILES: u32 = 100;

/// the folder every workspace folder is created inside, by name. The name is
/// the user's only handle on it in Drive's own interface.
const RENTABLE_ROOT_FOLDER_NAME: &str = "Rentable Sync";

const FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";

/// what a snapshot is, as Drive records it. The database file's own type rather
/// than a generic binary one, so Drive's interface describes it usefully.
const SNAPSHOT_MIME_TYPE: &str = "application/x-sqlite3";

/// the `rentableType` values marking each kind of file this application owns.
const ROOT_FOLDER_TYPE: &str = "root";
const WORKSPACE_FOLDER_TYPE: &str = "workspace";
const SNAPSHOT_FILE_TYPE: &str = "snapshot";

/// how many random bytes a multipart boundary is drawn from.
const MULTIPART_BOUNDARY_ENTROPY_BYTES: usize = 32;

/// where Drive answers.
///
/// Held as values rather than compiled in so a test can point every operation
/// at a server on loopback — which is the only reason an operation takes a base
/// URL at all.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DriveEndpoints {
    /// where metadata is read and written: everything but an upload's bytes.
    pub api_base_url: String,
    /// where an upload's bytes go. Drive answers these on a different host.
    pub upload_base_url: String,
}

impl Default for DriveEndpoints {
    fn default() -> Self {
        Self {
            api_base_url: GOOGLE_DRIVE_API_BASE_URL.to_string(),
            upload_base_url: GOOGLE_DRIVE_UPLOAD_BASE_URL.to_string(),
        }
    }
}

/// what an upload carries.
#[derive(Clone, Debug, Default)]
pub struct DriveUpload {
    /// the file to overwrite. Absent creates a new one — the whole difference
    /// between a `PATCH` a retry may replay and a `POST` it must not.
    pub file_id: Option<String>,
    /// what the file is called on the remote. Drive does not require it to be
    /// unique within a folder, so it identifies nothing.
    pub name: String,
    /// where a new file is created. Ignored when `file_id` is set, because
    /// naming a parent on an update asks Drive to move the file.
    pub parents: Vec<String>,
    /// the content type of the bytes, not of the metadata beside them.
    pub mime_type: String,
    /// this application's own metadata, which Drive stores and imposes no
    /// schema on. The keys are the whole contract with a later read.
    pub app_properties: BTreeMap<String, String>,
    pub content: Vec<u8>,
}

/// a snapshot on its way to the remote: the bytes, and everything a later read
/// has to recover from the file alone.
///
/// Every field but the content becomes an app-property, which is why they are
/// stated here rather than left to the caller to spell — the keys are the whole
/// contract with the read that follows, and a caller that spells them is a
/// caller that can misspell one.
#[derive(Clone, Debug)]
pub struct GoogleDriveSnapshotUpload {
    pub workspace_id: String,
    pub device_id: String,
    pub filename: String,
    pub created_at: i64,
    pub source: GoogleDriveSnapshotSource,
    pub app_version: String,
    /// the digest of `content`, where one was taken. Absent leaves the file
    /// undeclared rather than declared empty: a later read falls back to the
    /// bytes, and a blank property would be a claim about them.
    pub content_hash: Option<String>,
    pub content: Vec<u8>,
}

/// what the remote's manifest turned out to be.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveManifestResolution {
    pub file: DriveFile,
    /// the manifest the folder holds. `None` only where the file could not be
    /// read as one *and* the folder held no snapshot to rebuild it from — an
    /// index that could be derived always is, so an absence here means the
    /// workspace has nothing on the remote to describe.
    pub manifest: Option<GoogleDriveManifest>,
}

/// what a manifest write left on the remote.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveManifestWrite {
    pub file: DriveFile,
    /// the manifest the folder now holds — the one the caller supplied, unless
    /// it was rebuilt.
    pub manifest: GoogleDriveManifest,
    /// whether the folder's manifest had moved under the caller, so what was
    /// written is derived from the snapshots present rather than from what the
    /// caller asked to write. Not a failure, and not something to report as
    /// one; it does mean the caller's own record of the remote is behind.
    pub was_rebuilt: bool,
}

impl GoogleDriveManifestWrite {
    fn into_resolution(self) -> GoogleDriveManifestResolution {
        GoogleDriveManifestResolution {
            file: self.file,
            manifest: Some(self.manifest),
        }
    }
}

/// what the remote's current snapshot turned out to be.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveRemoteHeadState {
    pub file: DriveFile,
    /// the digest of the file's bytes, or `None` where they could not be read.
    pub content_hash: Option<String>,
    /// whether the file differs from what the manifest said about it.
    pub changed_from_manifest: bool,
}

/// who the linked account is, and how much of Drive it holds.
///
/// One value for two subjects because Drive answers both in a single request,
/// and separating them here would cost a second round trip to learn half of it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GoogleDriveAccountDetails {
    /// the address the account is held under. Blank and absent are one answer
    /// throughout: whitespace names no account and no person.
    pub email: Option<String>,
    /// the profile name Drive holds, carried with no fallback applied. What to
    /// call an account Drive named nothing for is the caller's to decide, and
    /// the two callers decide it differently — linking labels it by its
    /// address, refreshing keeps the name already recorded.
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    /// Drive's own identifier for the user, which is what survives the address
    /// being renamed.
    pub provider_user_id: Option<String>,
    /// the whole allowance, or `None` where the account has no ceiling.
    pub drive_quota_bytes: Option<i64>,
    /// how much of the allowance is spent, across the whole of Drive rather
    /// than this application's folder.
    pub drive_usage_bytes: Option<i64>,
}

/// the Drive operations, bound to one transport and one pair of endpoints.
pub struct DriveFiles {
    transport: DriveTransport,
    endpoints: DriveEndpoints,
}

impl DriveFiles {
    /// the operations against Google's own endpoints, retrying as the default
    /// policy says. Fails only where an HTTPS client could not be built.
    pub fn new() -> Result<Self, Error> {
        Ok(Self {
            transport: DriveTransport::new()?,
            endpoints: DriveEndpoints::default(),
        })
    }

    /// the operations against a transport and endpoints the caller chose. A
    /// test uses this to reach a local server with a retry policy it can afford
    /// to wait out; nothing in the application needs it.
    pub fn with_transport(transport: DriveTransport, endpoints: DriveEndpoints) -> Self {
        Self {
            transport,
            endpoints,
        }
    }

    /// who the account behind this token is, and how much of Drive it holds.
    pub async fn read_account_details(
        &self,
        access_token: &str,
    ) -> Result<GoogleDriveAccountDetails, Error> {
        let url = build_url(
            &self.endpoints.api_base_url,
            "/about",
            &[("fields", DRIVE_ABOUT_FIELDS.to_string())],
        )?;
        let about: DriveAbout = self
            .transport
            .send_json(access_token, &DriveRequest::get(url))
            .await?;

        Ok(about.into_account_details())
    }

    /// how many bytes a workspace folder occupies on Drive.
    ///
    /// Every file in the folder counts, not only the ones this application
    /// recognises: what is reported is what the folder costs the user's
    /// allowance, and a file's origin does not change that.
    pub async fn read_folder_usage_bytes(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<i64, Error> {
        let contents = self
            .list(
                access_token,
                &format!("{} and trashed=false", in_parents(folder_id)),
                MAX_LISTED_FILES,
                None,
            )
            .await?;

        Ok(contents
            .iter()
            .filter_map(|file| parse_drive_number(file.size.as_deref()))
            .sum())
    }

    /// the files matching a Drive query.
    pub async fn list(
        &self,
        access_token: &str,
        query: &str,
        page_size: u32,
        order_by: Option<&str>,
    ) -> Result<Vec<DriveFile>, Error> {
        let mut params = vec![
            ("q", query.to_string()),
            ("fields", format!("files({DRIVE_FILE_FIELDS})")),
            ("pageSize", page_size.to_string()),
            ("spaces", "drive".to_string()),
        ];

        if let Some(order_by) = order_by {
            params.push(("orderBy", order_by.to_string()));
        }

        let url = build_url(&self.endpoints.api_base_url, "/files", &params)?;
        let listing: DriveFileList = self
            .transport
            .send_json(access_token, &DriveRequest::get(url))
            .await?;

        Ok(listing.files)
    }

    /// the first file matching a query, or `None` where nothing matched.
    pub async fn find(
        &self,
        access_token: &str,
        query: &str,
        order_by: Option<&str>,
    ) -> Result<Option<DriveFile>, Error> {
        Ok(self
            .list(access_token, query, 1, order_by)
            .await?
            .into_iter()
            .next())
    }

    /// one file by identifier, or `None` where it is gone or was never ours to
    /// read. Both are answers about the file rather than failures of the
    /// request, and every caller here does the same thing about them.
    pub async fn try_get(
        &self,
        access_token: &str,
        file_id: &str,
    ) -> Result<Option<DriveFile>, Error> {
        let url = build_url(
            &self.endpoints.api_base_url,
            &format!("/files/{file_id}"),
            &[("fields", DRIVE_FILE_FIELDS.to_string())],
        )?;
        let response = self
            .transport
            .send(access_token, &DriveRequest::get(url))
            .await?;

        if response.status == 404 || (response.status == 403 && response.file_access_was_denied()) {
            return Ok(None);
        }

        read_drive_file(response).map(Some)
    }

    /// remove a file, treating one that is already gone as success: a delete is
    /// issued to reach a state, and that state is already reached.
    pub async fn delete(&self, access_token: &str, file_id: &str) -> Result<(), Error> {
        let url = format!("{}/files/{file_id}", self.endpoints.api_base_url);
        let response = self
            .transport
            .send(access_token, &DriveRequest::delete(url))
            .await?;

        if response.status == 404 {
            return Ok(());
        }

        response.into_success().map(|_| ())
    }

    /// create a file that has no content of its own — which is what a folder is
    /// on Drive.
    pub async fn create_metadata_file(
        &self,
        access_token: &str,
        metadata: &serde_json::Value,
    ) -> Result<DriveFile, Error> {
        let url = build_url(
            &self.endpoints.api_base_url,
            "/files",
            &[("fields", DRIVE_FILE_FIELDS.to_string())],
        )?;
        let body = serde_json::to_vec(metadata).map_err(|error| Error::Internal {
            message: format!("could not write google drive file metadata: {error}"),
        })?;

        self.transport
            .send_json(access_token, &DriveRequest::json(Method::POST, url, body))
            .await
    }

    /// send a file's metadata and its bytes together.
    pub async fn upload(
        &self,
        access_token: &str,
        upload: &DriveUpload,
    ) -> Result<DriveFile, Error> {
        let boundary = multipart_boundary()?;
        let body = multipart_body(&boundary, upload)?;
        let (method, path) = match &upload.file_id {
            Some(file_id) => (Method::PATCH, format!("/files/{file_id}")),
            None => (Method::POST, "/files".to_string()),
        };
        let url = build_url(
            &self.endpoints.upload_base_url,
            &path,
            &[
                ("uploadType", "multipart".to_string()),
                ("fields", DRIVE_FILE_FIELDS.to_string()),
            ],
        )?;

        self.transport
            .send_json(
                access_token,
                &DriveRequest::multipart(method, url, boundary, body),
            )
            .await
    }

    /// a file's bytes.
    pub async fn download(&self, access_token: &str, file_id: &str) -> Result<Vec<u8>, Error> {
        let url = build_url(
            &self.endpoints.api_base_url,
            &format!("/files/{file_id}"),
            &[("alt", "media".to_string())],
        )?;

        self.transport
            .send(access_token, &DriveRequest::get(url))
            .await?
            .into_success()
    }

    /// a file's bytes as text, for the files this application writes as text.
    pub async fn download_text(&self, access_token: &str, file_id: &str) -> Result<String, Error> {
        let bytes = self.download(access_token, file_id).await?;

        Ok(String::from_utf8_lossy(&bytes).to_string())
    }

    /// put a snapshot in a workspace folder, declaring everything a later read
    /// needs to recognise and categorise it.
    ///
    /// Always a create, never a replace: a snapshot is a point in time, and
    /// overwriting one would destroy the copy it is meant to sit beside. Which
    /// snapshots survive afterwards is retention's, not this call's.
    pub async fn upload_workspace_snapshot(
        &self,
        access_token: &str,
        folder_id: &str,
        snapshot: &GoogleDriveSnapshotUpload,
    ) -> Result<DriveFile, Error> {
        let mut app_properties = BTreeMap::from([
            (
                FILE_TYPE_PROPERTY.to_string(),
                SNAPSHOT_FILE_TYPE.to_string(),
            ),
            (
                WORKSPACE_ID_PROPERTY.to_string(),
                snapshot.workspace_id.clone(),
            ),
            (DEVICE_ID_PROPERTY.to_string(), snapshot.device_id.clone()),
            (
                SNAPSHOT_CREATED_AT_PROPERTY.to_string(),
                snapshot.created_at.to_string(),
            ),
            (
                SNAPSHOT_SOURCE_PROPERTY.to_string(),
                snapshot.source.as_str().to_string(),
            ),
            (
                SNAPSHOT_APP_VERSION_PROPERTY.to_string(),
                snapshot.app_version.clone(),
            ),
        ]);

        if let Some(content_hash) = normalize_content_hash(snapshot.content_hash.as_deref()) {
            app_properties.insert(SNAPSHOT_CONTENT_HASH_PROPERTY.to_string(), content_hash);
        }

        self.upload(
            access_token,
            &DriveUpload {
                file_id: None,
                name: snapshot.filename.clone(),
                parents: vec![folder_id.to_string()],
                mime_type: SNAPSHOT_MIME_TYPE.to_string(),
                app_properties,
                content: snapshot.content.clone(),
            },
        )
        .await
    }

    /// this workspace's folder on the remote, or `None` where it has none yet.
    ///
    /// Four ways of finding it, tried in falling order of confidence: the
    /// identifier the workspace recorded, the folder holding a file it
    /// recorded, a folder declaring this workspace's identifier, and finally
    /// the most recently touched workspace folder under the root. The last is a
    /// guess, and it is what recovers a workspace whose local record of the
    /// remote was lost.
    pub async fn resolve_existing_workspace_folder(
        &self,
        access_token: &str,
        workspace: &RemoteSyncWorkspace,
    ) -> Result<Option<DriveFile>, Error> {
        let recorded_folder = match trimmed(workspace.remote_folder_id.as_deref()) {
            Some(folder_id) => self.try_get(access_token, folder_id).await?,
            None => None,
        };

        if recorded_folder.is_some() {
            return Ok(recorded_folder);
        }

        if let Some(folder) = self
            .resolve_workspace_folder_from_tracked_files(access_token, workspace)
            .await?
        {
            return Ok(Some(folder));
        }

        let Some(root_folder) = self.find_root_folder(access_token).await? else {
            return Ok(None);
        };

        let by_workspace_id = self
            .find(
                access_token,
                &format!(
                    "{} and mimeType='{FOLDER_MIME_TYPE}' and trashed=false and {}",
                    in_parents(&root_folder.id),
                    app_property_clause(WORKSPACE_ID_PROPERTY, &workspace.id)
                ),
                None,
            )
            .await?;

        if by_workspace_id.is_some() {
            return Ok(by_workspace_id);
        }

        self.find(
            access_token,
            &format!(
                "{} and mimeType='{FOLDER_MIME_TYPE}' and trashed=false and {}",
                in_parents(&root_folder.id),
                app_property_clause(FILE_TYPE_PROPERTY, WORKSPACE_FOLDER_TYPE)
            ),
            Some("modifiedTime desc"),
        )
        .await
    }

    /// this workspace's folder, creating it — and the root folder above it —
    /// where there is none.
    pub async fn ensure_workspace_folder(
        &self,
        access_token: &str,
        workspace: &RemoteSyncWorkspace,
    ) -> Result<DriveFile, Error> {
        if let Some(existing) = self
            .resolve_existing_workspace_folder(access_token, workspace)
            .await?
        {
            return Ok(existing);
        }

        let root_folder = match self.find_root_folder(access_token).await? {
            Some(root_folder) => root_folder,
            None => {
                self.create_metadata_file(
                    access_token,
                    &folder_metadata(
                        RENTABLE_ROOT_FOLDER_NAME,
                        None,
                        &[(FILE_TYPE_PROPERTY, ROOT_FOLDER_TYPE)],
                    ),
                )
                .await?
            }
        };

        self.create_metadata_file(
            access_token,
            &folder_metadata(
                &workspace.name,
                Some(&root_folder.id),
                &[
                    (FILE_TYPE_PROPERTY, WORKSPACE_FOLDER_TYPE),
                    (WORKSPACE_ID_PROPERTY, &workspace.id),
                ],
            ),
        )
        .await
    }

    /// every snapshot in a workspace folder, newest first.
    ///
    /// Asked for twice, because the two questions catch different files: the
    /// property is what this application writes now, and the filename is what
    /// identifies a snapshot written before it did. A file answering only the
    /// second is taken only when its name is one this application would have
    /// produced.
    pub async fn list_workspace_snapshot_files(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<Vec<DriveFile>, Error> {
        let declared = self
            .list(
                access_token,
                &format!(
                    "{} and trashed=false and {}",
                    in_parents(folder_id),
                    app_property_clause(FILE_TYPE_PROPERTY, SNAPSHOT_FILE_TYPE)
                ),
                MAX_LISTED_FILES,
                Some("modifiedTime desc"),
            )
            .await?;

        let named = self
            .list(
                access_token,
                &format!(
                    "{} and trashed=false and name contains 'snapshot-'",
                    in_parents(folder_id)
                ),
                MAX_LISTED_FILES,
                Some("modifiedTime desc"),
            )
            .await?;

        let mut seen_ids: HashSet<String> = HashSet::new();
        let mut snapshots: Vec<DriveFile> = Vec::new();

        for file in declared.into_iter().chain(
            named
                .into_iter()
                .filter(|file| is_canonical_snapshot_filename(Some(&file.name))),
        ) {
            if seen_ids.insert(file.id.clone()) {
                snapshots.push(file);
            }
        }

        snapshots.sort_by(compare_drive_files_by_snapshot_recency);

        Ok(snapshots)
    }

    /// the manifest in a workspace folder, rebuilt from the snapshots present
    /// where the folder holds none or holds one that cannot be read.
    ///
    /// `None` only where there is nothing to read and nothing to rebuild from.
    ///
    /// The identifier the workspace recorded is used only where the file it
    /// names is still a manifest of *this* folder — a workspace relinked to a
    /// different remote otherwise reads the old one.
    pub async fn resolve_manifest(
        &self,
        access_token: &str,
        workspace: &RemoteSyncWorkspace,
        folder_id: &str,
    ) -> Result<Option<GoogleDriveManifestResolution>, Error> {
        let tracked = match trimmed(workspace.remote_manifest_file_id.as_deref()) {
            Some(file_id) => self.try_get(access_token, file_id).await?,
            None => None,
        };

        let manifest_file = match tracked
            .filter(|file| is_tracked_manifest_file_for_folder(Some(file), folder_id))
        {
            Some(file) => Some(file),
            None => self.find_manifest_file(access_token, folder_id).await?,
        };

        let Some(manifest_file) = manifest_file else {
            return Ok(self
                .rebuild_manifest(access_token, workspace, folder_id, None, None)
                .await?
                .map(GoogleDriveManifestWrite::into_resolution));
        };

        let content = self.download_text(access_token, &manifest_file.id).await?;
        let manifest = serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|raw| normalize_google_drive_manifest(&raw).ok());

        if manifest.is_some() {
            return Ok(Some(GoogleDriveManifestResolution {
                file: manifest_file,
                manifest,
            }));
        }

        let rebuilt = self
            .rebuild_manifest(
                access_token,
                workspace,
                folder_id,
                Some(&manifest_file),
                None,
            )
            .await?;

        Ok(Some(match rebuilt {
            Some(write) => write.into_resolution(),
            None => GoogleDriveManifestResolution {
                file: manifest_file,
                manifest: None,
            },
        }))
    }

    /// write the manifest into the workspace folder, over the one already
    /// there.
    ///
    /// `expected_file` is the manifest file the caller read before deciding
    /// what to write. Where the folder's manifest is no longer that one,
    /// another client has written since: the index is rebuilt from the
    /// snapshots present and that is written instead of what was asked for.
    ///
    /// Refusing would be the alternative, and it is the wrong one. Drive offers
    /// no compare-and-set, so the race cannot be closed — and the index is
    /// derived from snapshots that a concurrent write cannot destroy, so losing
    /// it is recoverable. Refusing would turn that into a failure the user has
    /// to act on.
    pub async fn save_manifest(
        &self,
        access_token: &str,
        workspace: &RemoteSyncWorkspace,
        folder_id: &str,
        expected_file: Option<&DriveFile>,
        manifest: &GoogleDriveManifest,
    ) -> Result<GoogleDriveManifestWrite, Error> {
        let latest = self.find_manifest_file(access_token, folder_id).await?;

        if manifest_file_moved_on(expected_file, latest.as_ref()) {
            // a folder with no snapshot left to derive an index from cannot be
            // repaired, and what the caller computed is then the only account
            // of the workspace there is.
            if let Some(rebuilt) = self
                .rebuild_manifest(
                    access_token,
                    workspace,
                    folder_id,
                    latest.as_ref(),
                    Some(manifest),
                )
                .await?
            {
                return Ok(rebuilt);
            }
        }

        let file = self
            .write_manifest_file(
                access_token,
                folder_id,
                &workspace.id,
                latest.as_ref().map(|file| file.id.as_str()),
                manifest,
            )
            .await?;

        Ok(GoogleDriveManifestWrite {
            file,
            manifest: manifest.clone(),
            was_rebuilt: false,
        })
    }

    /// what the remote's current snapshot is now, against what the manifest
    /// says it was. `None` where the head named by the manifest is gone.
    pub async fn resolve_remote_head_state(
        &self,
        access_token: &str,
        manifest: &GoogleDriveManifest,
    ) -> Result<Option<GoogleDriveRemoteHeadState>, Error> {
        let Some(file) = self.try_get(access_token, &manifest.head.file_id).await? else {
            return Ok(None);
        };

        let changed_from_manifest = did_remote_head_change_from_manifest(&manifest.head, &file);

        if !changed_from_manifest
            && is_cryptographic_content_hash(manifest.head.content_hash.as_deref())
        {
            return Ok(Some(GoogleDriveRemoteHeadState {
                file,
                content_hash: normalize_content_hash(manifest.head.content_hash.as_deref()),
                changed_from_manifest,
            }));
        }

        // the bytes are the authority wherever the manifest's word about them
        // is stale or was never a digest. Failing to read them leaves the hash
        // unknown rather than failing the operation: that the head exists is
        // still an answer, and it is a different one from having no head.
        let content_hash = self
            .download(access_token, &file.id)
            .await
            .ok()
            .map(|bytes| content_hash_hex(&bytes));

        Ok(Some(GoogleDriveRemoteHeadState {
            file,
            content_hash,
            changed_from_manifest,
        }))
    }

    /// apply the remote retention policy to a workspace folder: the newest
    /// snapshot of each source survives, and every other snapshot this
    /// application wrote is deleted. Returns what survived, which is what an
    /// index describing the folder is then built from.
    pub async fn apply_workspace_snapshot_retention(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<Vec<GoogleDriveRetainedSnapshot>, Error> {
        let snapshot_files = self
            .list_workspace_snapshot_files(access_token, folder_id)
            .await?;
        let retained = choose_retained_workspace_snapshots(&snapshot_files);
        let retained_file_ids = retained
            .iter()
            .map(|entry| entry.file.id.as_str())
            .collect::<Vec<_>>();

        self.delete_evictable_snapshots(access_token, &snapshot_files, &retained_file_ids)
            .await?;

        Ok(retained)
    }

    /// delete the snapshots this application wrote, but the ones named. A file
    /// declaring no source it recognises is not among them, however the folder
    /// is listed.
    ///
    /// For the caller that has already chosen what to keep — a repair picks its
    /// head and builds an index around it, and deciding again from a second
    /// listing could pick a different one and orphan the index just written.
    pub async fn delete_workspace_snapshots_except(
        &self,
        access_token: &str,
        folder_id: &str,
        retained_file_ids: &[&str],
    ) -> Result<(), Error> {
        let snapshot_files = self
            .list_workspace_snapshot_files(access_token, folder_id)
            .await?;

        self.delete_evictable_snapshots(access_token, &snapshot_files, retained_file_ids)
            .await
    }

    /// delete every manifest the folder holds but the one named. `None` keeps
    /// none of them.
    ///
    /// A folder holds more than one manifest whenever a write created rather
    /// than replaced — which is what a concurrent client, or a workspace whose
    /// record of the remote was lost, leaves behind.
    pub async fn delete_workspace_manifests_except(
        &self,
        access_token: &str,
        folder_id: &str,
        retained_file_id: Option<&str>,
    ) -> Result<(), Error> {
        let manifest_files = self
            .list(
                access_token,
                &manifest_file_query(folder_id),
                MAX_LISTED_FILES,
                Some("modifiedTime desc"),
            )
            .await?;

        for file in manifest_files
            .iter()
            .filter(|file| Some(file.id.as_str()) != retained_file_id)
        {
            self.delete(access_token, &file.id).await?;
        }

        Ok(())
    }

    /// empty a workspace folder of the files this application wrote.
    ///
    /// Of those, and nothing else. The folder is a place in the user's own
    /// Drive rather than private storage, so a file this application cannot
    /// account for was put there by somebody and is not ours to remove — the
    /// same judgement retention already makes about a snapshot it does not
    /// recognise.
    pub async fn purge_workspace_folder(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<(), Error> {
        self.delete_workspace_snapshots_except(access_token, folder_id, &[])
            .await?;
        self.delete_workspace_manifests_except(access_token, folder_id, None)
            .await
    }

    /// delete the snapshots a cleanup may take, which are fewer than the ones
    /// it did not keep — which those are is
    /// [`choose_evictable_workspace_snapshots`]'s to say.
    async fn delete_evictable_snapshots(
        &self,
        access_token: &str,
        snapshot_files: &[DriveFile],
        retained_file_ids: &[&str],
    ) -> Result<(), Error> {
        for file in choose_evictable_workspace_snapshots(snapshot_files, retained_file_ids) {
            self.delete(access_token, &file.id).await?;
        }

        Ok(())
    }

    /// the folder's manifest as Drive reports it now, whatever this workspace
    /// last recorded about it.
    async fn find_manifest_file(
        &self,
        access_token: &str,
        folder_id: &str,
    ) -> Result<Option<DriveFile>, Error> {
        self.find(
            access_token,
            &manifest_file_query(folder_id),
            Some("modifiedTime desc"),
        )
        .await
    }

    /// derive the manifest from the snapshots the folder holds and write it,
    /// over `existing_file` where there is one.
    ///
    /// `None` where the folder holds no snapshot this application recognises:
    /// there is nothing to describe, and an index naming a head that is not
    /// there is worse than no index.
    ///
    /// `previous` is the index the rebuild replaces, where the caller still
    /// has it. A folder listing does not say which version of this application
    /// wrote a snapshot or what Drive computed for its checksum, so a rebuild
    /// with nothing to read those off loses them.
    async fn rebuild_manifest(
        &self,
        access_token: &str,
        workspace: &RemoteSyncWorkspace,
        folder_id: &str,
        existing_file: Option<&DriveFile>,
        previous: Option<&GoogleDriveManifest>,
    ) -> Result<Option<GoogleDriveManifestWrite>, Error> {
        let snapshot_files = self
            .list_workspace_snapshot_files(access_token, folder_id)
            .await?;
        let retained = choose_retained_workspace_snapshots(&snapshot_files);

        let Some(head) = retained.first() else {
            return Ok(None);
        };

        let content_hash = self
            .resolve_snapshot_content_hash(access_token, &head.file)
            .await;
        let manifest = build_google_drive_manifest_from_snapshots(
            &workspace.id,
            &workspace.name,
            &retained,
            &head.file,
            &GoogleDriveManifestEntryOverrides {
                content_hash,
                ..GoogleDriveManifestEntryOverrides::default()
            },
            previous,
            timestamp::now(),
        )?;
        let file = self
            .write_manifest_file(
                access_token,
                folder_id,
                &workspace.id,
                existing_file.map(|file| file.id.as_str()),
                &manifest,
            )
            .await?;

        Ok(Some(GoogleDriveManifestWrite {
            file,
            manifest,
            was_rebuilt: true,
        }))
    }

    /// put the manifest document into the folder, over `file_id` where one was
    /// given.
    async fn write_manifest_file(
        &self,
        access_token: &str,
        folder_id: &str,
        workspace_id: &str,
        file_id: Option<&str>,
        manifest: &GoogleDriveManifest,
    ) -> Result<DriveFile, Error> {
        let content = serde_json::to_vec_pretty(manifest).map_err(|error| Error::Internal {
            message: format!("could not write the google drive manifest: {error}"),
        })?;

        self.upload(
            access_token,
            &DriveUpload {
                file_id: file_id.map(str::to_string),
                name: MANIFEST_FILENAME.to_string(),
                parents: vec![folder_id.to_string()],
                mime_type: "application/json".to_string(),
                app_properties: BTreeMap::from([
                    (
                        FILE_TYPE_PROPERTY.to_string(),
                        MANIFEST_FILE_TYPE.to_string(),
                    ),
                    (WORKSPACE_ID_PROPERTY.to_string(), workspace_id.to_string()),
                ]),
                content,
            },
        )
        .await
    }

    /// the digest of a snapshot's bytes, downloading them only where nothing
    /// already recorded against the file is one.
    ///
    /// `None` where the bytes could not be read. A rebuilt index that records
    /// no hash for its head is one a later read fingerprints for itself;
    /// failing here would instead leave the folder with no index at all.
    async fn resolve_snapshot_content_hash(
        &self,
        access_token: &str,
        file: &DriveFile,
    ) -> Option<String> {
        let recorded = normalize_content_hash(file.app_property(SNAPSHOT_CONTENT_HASH_PROPERTY));

        if is_cryptographic_content_hash(recorded.as_deref()) {
            return recorded;
        }

        self.download(access_token, &file.id)
            .await
            .ok()
            .map(|bytes| content_hash_hex(&bytes))
    }

    async fn find_root_folder(&self, access_token: &str) -> Result<Option<DriveFile>, Error> {
        self.find(
            access_token,
            &format!(
                "mimeType='{FOLDER_MIME_TYPE}' and trashed=false and name='{}' and {}",
                escape_drive_query(RENTABLE_ROOT_FOLDER_NAME),
                app_property_clause(FILE_TYPE_PROPERTY, ROOT_FOLDER_TYPE)
            ),
            None,
        )
        .await
    }

    /// the folder holding a file the workspace already tracks. This is what
    /// survives a folder being renamed or moved: the snapshot and the manifest
    /// keep their identifiers wherever their folder ends up.
    async fn resolve_workspace_folder_from_tracked_files(
        &self,
        access_token: &str,
        workspace: &RemoteSyncWorkspace,
    ) -> Result<Option<DriveFile>, Error> {
        let tracked_file_ids = [
            workspace.remote_manifest_file_id.as_deref(),
            workspace.remote_head_file_id.as_deref(),
        ];

        for tracked_file_id in tracked_file_ids.into_iter().flat_map(trimmed) {
            let Some(tracked_file) = self.try_get(access_token, tracked_file_id).await? else {
                continue;
            };

            let Some(folder_id) = tracked_file
                .parents
                .as_ref()
                .and_then(|parents| parents.first())
                .map(String::as_str)
                .and_then(trimmed_str)
            else {
                continue;
            };

            if let Some(folder) = self.try_get(access_token, folder_id).await? {
                return Ok(Some(folder));
            }
        }

        Ok(None)
    }
}

/// a value placed inside a Drive query's string literal.
///
/// The backslash is escaped first: escaping the quote introduces backslashes of
/// its own, and doubling those afterwards would corrupt every quote that had
/// just been escaped.
pub fn escape_drive_query(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

/// whether the folder's manifest is no longer the one a caller read before
/// deciding what to write.
///
/// A manifest that has gone since is not a divergence — the write puts one
/// back, which is the state the caller wanted. One that appeared where the
/// caller saw none, or whose identity or revision changed under it, is another
/// client having written in between.
fn manifest_file_moved_on(expected: Option<&DriveFile>, latest: Option<&DriveFile>) -> bool {
    match (expected, latest) {
        (_, None) => false,
        (None, Some(_)) => true,
        (Some(expected), Some(latest)) => {
            latest.id != expected.id
                || latest.version != expected.version
                || latest.modified_time != expected.modified_time
        }
    }
}

/// the query matching every manifest a folder holds.
///
/// One query for finding the current one and for finding the superseded ones,
/// so a manifest a read would take for the folder's own cannot be one a cleanup
/// walks past.
fn manifest_file_query(folder_id: &str) -> String {
    format!(
        "{} and trashed=false and name='{MANIFEST_FILENAME}' and {}",
        in_parents(folder_id),
        app_property_clause(FILE_TYPE_PROPERTY, MANIFEST_FILE_TYPE)
    )
}

/// the clause matching one of this application's own app-properties.
fn app_property_clause(key: &str, value: &str) -> String {
    format!(
        "appProperties has {{ key='{}' and value='{}' }}",
        escape_drive_query(key),
        escape_drive_query(value)
    )
}

/// the clause restricting a query to one folder's contents.
fn in_parents(folder_id: &str) -> String {
    format!("'{}' in parents", escape_drive_query(folder_id))
}

/// the metadata a folder is created from.
fn folder_metadata(
    name: &str,
    parent_id: Option<&str>,
    properties: &[(&str, &str)],
) -> serde_json::Value {
    let mut metadata = serde_json::Map::new();

    metadata.insert("name".to_string(), name.into());
    metadata.insert("mimeType".to_string(), FOLDER_MIME_TYPE.into());

    if let Some(parent_id) = parent_id {
        metadata.insert(
            "parents".to_string(),
            serde_json::Value::Array(vec![parent_id.into()]),
        );
    }

    metadata.insert(
        "appProperties".to_string(),
        serde_json::Value::Object(
            properties
                .iter()
                .map(|(key, value)| ((*key).to_string(), (*value).into()))
                .collect(),
        ),
    );

    serde_json::Value::Object(metadata)
}

/// a delimiter that cannot appear inside the parts it separates. Drawn at
/// random rather than fixed because the second part is an arbitrary snapshot,
/// and a boundary occurring inside it would truncate the upload at that byte.
fn multipart_boundary() -> Result<String, Error> {
    let mut bytes = [0_u8; MULTIPART_BOUNDARY_ENTROPY_BYTES];

    getrandom::fill(&mut bytes).map_err(|error| Error::Internal {
        message: format!("failed to draw random bytes for a drive upload boundary: {error}"),
    })?;

    Ok(format!("rentable-{}", BASE64URL.encode(bytes)))
}

fn multipart_body(boundary: &str, upload: &DriveUpload) -> Result<Vec<u8>, Error> {
    let mut metadata = serde_json::Map::new();

    metadata.insert("name".to_string(), upload.name.as_str().into());

    if !upload.app_properties.is_empty() {
        metadata.insert(
            "appProperties".to_string(),
            serde_json::Value::Object(
                upload
                    .app_properties
                    .iter()
                    .map(|(key, value)| (key.clone(), value.as_str().into()))
                    .collect(),
            ),
        );
    }

    if upload.file_id.is_none() {
        metadata.insert(
            "parents".to_string(),
            serde_json::Value::Array(
                upload
                    .parents
                    .iter()
                    .map(|parent| parent.as_str().into())
                    .collect(),
            ),
        );
    }

    let metadata = serde_json::to_vec(&serde_json::Value::Object(metadata)).map_err(|error| {
        Error::Internal {
            message: format!("could not write google drive upload metadata: {error}"),
        }
    })?;

    let mut body = Vec::new();

    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(&metadata);
    body.extend_from_slice(
        format!(
            "\r\n--{boundary}\r\nContent-Type: {}\r\n\r\n",
            upload.mime_type
        )
        .as_bytes(),
    );
    body.extend_from_slice(&upload.content);
    body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());

    Ok(body)
}

fn build_url(base_url: &str, path: &str, params: &[(&str, String)]) -> Result<String, Error> {
    Url::parse_with_params(&format!("{base_url}{path}"), params)
        .map(String::from)
        .map_err(|error| Error::Internal {
            message: format!("could not build a google drive url: {error}"),
        })
}

fn read_drive_file(response: DriveResponse) -> Result<DriveFile, Error> {
    let body = response.into_success()?;

    serde_json::from_slice(&body).map_err(|error| Error::Integrity {
        message: format!("google drive sent a file this app could not read: {error}"),
    })
}

/// a value that still says something once its surrounding whitespace is
/// discarded. An identifier recorded as blank names no file, and asking Drive
/// about one wastes a request to be told so.
fn trimmed(value: Option<&str>) -> Option<&str> {
    value.and_then(trimmed_str)
}

fn trimmed_str(value: &str) -> Option<&str> {
    let value = value.trim();

    (!value.is_empty()).then_some(value)
}

#[derive(Debug, Default, Deserialize)]
struct DriveFileList {
    #[serde(default)]
    files: Vec<DriveFile>,
}

/// Drive's answer about the token's own account, exactly as it arrives.
/// Everything is optional twice over — the object and each field inside it —
/// because Drive returns only what the query asked for and omits what the
/// account has not set.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveAbout {
    #[serde(default)]
    user: Option<DriveAboutUser>,
    #[serde(default)]
    storage_quota: Option<DriveAboutStorageQuota>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveAboutUser {
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    email_address: Option<String>,
    #[serde(default)]
    photo_link: Option<String>,
    #[serde(default)]
    permission_id: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveAboutStorageQuota {
    #[serde(default)]
    limit: Option<String>,
    #[serde(default)]
    usage: Option<String>,
}

impl DriveAbout {
    fn into_account_details(self) -> GoogleDriveAccountDetails {
        let user = self.user.unwrap_or_default();
        let quota = self.storage_quota.unwrap_or_default();

        GoogleDriveAccountDetails {
            email: trimmed(user.email_address.as_deref()).map(str::to_string),
            display_name: trimmed(user.display_name.as_deref()).map(str::to_string),
            avatar_url: user.photo_link,
            provider_user_id: user.permission_id,
            drive_quota_bytes: parse_drive_number(quota.limit.as_deref()),
            drive_usage_bytes: parse_drive_number(quota.usage.as_deref()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::{BTreeMap, HashMap},
        time::Duration,
    };

    use serde_json::json;

    use super::{
        DriveEndpoints, DriveFiles, DriveUpload, GoogleDriveAccountDetails,
        GoogleDriveSnapshotUpload, escape_drive_query,
    };
    use crate::{
        error::Error,
        sync::{
            google::{
                conflict::content_hash_hex,
                manifest::{
                    GoogleDriveManifest, GoogleDriveManifestEntryOverrides,
                    build_google_drive_manifest_from_snapshots, normalize_google_drive_manifest,
                },
                metadata::{DriveFile, GoogleDriveSnapshotSource},
                retention::choose_retained_workspace_snapshots,
                test::server::{RecordedRequest, ScriptedResponse, TestDriveServer},
                transport::{DriveRetryPolicy, DriveTransport},
            },
            store::RemoteSyncWorkspace,
        },
    };
    /// a policy that retries as production does but waits in milliseconds, so a
    /// test asserting that backoff happened does not pay seconds for the answer.
    fn fast_retry_policy(attempts: u32) -> DriveRetryPolicy {
        DriveRetryPolicy {
            attempts,
            base_delay: Duration::from_millis(150),
            max_delay: Duration::from_millis(600),
        }
    }

    fn transport(attempts: u32) -> DriveTransport {
        DriveTransport::with_retry_policy(fast_retry_policy(attempts))
            .expect("failed to build the drive transport")
    }

    fn json_response(status: u16, body: serde_json::Value) -> ScriptedResponse {
        ScriptedResponse::new(status, body.to_string())
    }
    fn drive_file(id: &str) -> DriveFile {
        DriveFile {
            id: id.to_string(),
            name: format!("snapshot-{id}.db"),
            modified_time: None,
            version: None,
            size: None,
            md5_checksum: None,
            parents: None,
            app_properties: None,
        }
    }

    fn with_properties(mut file: DriveFile, properties: &[(&str, &str)]) -> DriveFile {
        file.app_properties = Some(
            properties
                .iter()
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect::<HashMap<_, _>>(),
        );

        file
    }

    fn snapshot(id: &str, source: &str, created_at: i64) -> DriveFile {
        with_properties(
            drive_file(id),
            &[
                ("rentableSource", source),
                ("rentableCreatedAt", &created_at.to_string()),
            ],
        )
    }

    fn manifest_entry_json(file_id: &str, revision: &str, created_at: i64) -> serde_json::Value {
        json!({
            "fileId": file_id,
            "filename": format!("snapshot-{file_id}.db"),
            "createdAt": created_at,
            "source": "autosave",
            "appVersion": "1.0.0",
            "revision": revision,
            "modifiedTime": null,
            "sizeBytes": null,
            "md5Checksum": null,
            "contentHash": null,
        })
    }

    fn manifest_metadata_json() -> serde_json::Value {
        json!({
            "version": 1,
            "provider": "googleDrive",
            "workspaceId": "workspace-1",
            "workspaceName": "Primary workspace",
            "updatedAt": 1_700_000_000_000i64,
        })
    }
    fn drive_files(server: &TestDriveServer) -> DriveFiles {
        DriveFiles::with_transport(
            transport(1),
            DriveEndpoints {
                api_base_url: server.url(""),
                upload_base_url: server.url("/upload"),
            },
        )
    }

    /// the multipart body of an upload, as the metadata part and the content part.
    /// Both are what a later read depends on, and neither is visible in the
    /// arguments the caller passed.
    fn upload_parts(request: &RecordedRequest) -> (serde_json::Value, String) {
        let body = request.body_as_text();
        let metadata_start = body.find('{').expect("the upload carried no metadata");
        let metadata_end = body[metadata_start..]
            .rfind('}')
            .expect("the upload's metadata was not closed")
            + metadata_start;
        let metadata = serde_json::from_str(&body[metadata_start..=metadata_end])
            .expect("the upload's metadata was not json");

        let tail = &body[metadata_end + 1..];
        let content_start = tail
            .find("\r\n\r\n")
            .expect("the upload carried no content part")
            + 4;
        let content = &tail[content_start..];
        let content_end = content
            .rfind("\r\n--")
            .expect("the upload's content part was not closed");

        (metadata, content[..content_end].to_string())
    }
    fn drive_workspace() -> RemoteSyncWorkspace {
        RemoteSyncWorkspace {
            id: "workspace-1".to_string(),
            name: "Primary workspace".to_string(),
            ..RemoteSyncWorkspace::default()
        }
    }

    fn file_json(id: &str, name: &str) -> serde_json::Value {
        json!({ "id": id, "name": name })
    }

    fn snapshot_json(id: &str, name: &str, created_at: i64) -> serde_json::Value {
        json!({
            "id": id,
            "name": name,
            "appProperties": {
                "rentableType": "snapshot",
                "rentableSource": "autosave",
                "rentableCreatedAt": created_at.to_string(),
            },
        })
    }

    /// a snapshot as Drive would answer with it, declaring the source it was taken
    /// for. `source` is left as text so a test can hand over one this application
    /// does not recognise.
    fn sourced_snapshot_json(id: &str, source: &str, created_at: i64) -> serde_json::Value {
        json!({
            "id": id,
            "name": format!("snapshot-{id}.db"),
            "appProperties": {
                "rentableType": "snapshot",
                "rentableSource": source,
                "rentableCreatedAt": created_at.to_string(),
            },
        })
    }

    fn manifest_file_json(id: &str) -> serde_json::Value {
        json!({
            "id": id,
            "name": "manifest.json",
            "appProperties": { "rentableType": "manifest" },
        })
    }

    fn listing(files: Vec<serde_json::Value>) -> ScriptedResponse {
        json_response(200, json!({ "files": files }))
    }

    /// the files a run deleted, in the order the deletes were issued.
    fn deleted_file_ids(server: &TestDriveServer) -> Vec<String> {
        (0..server.request_count())
            .map(|index| server.request(index))
            .filter(|request| request.method == "DELETE")
            .map(|request| request.target.trim_start_matches("/files/").to_string())
            .collect()
    }

    fn manifest_json() -> serde_json::Value {
        json!({
            "metadata": manifest_metadata_json(),
            "entries": [manifest_entry_json("head-1", "7", 3000)],
            "head": manifest_entry_json("head-1", "7", 3000),
        })
    }

    fn fixture_manifest() -> GoogleDriveManifest {
        normalize_google_drive_manifest(&manifest_json())
            .expect("the fixture manifest is not valid")
    }
    /// the empty success Drive answers a delete with.
    fn deleted() -> ScriptedResponse {
        ScriptedResponse::new(204, Vec::new())
    }
    #[tokio::test]
    async fn a_snapshot_is_uploaded_declaring_everything_a_later_read_needs() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({ "id": "snapshot-new", "name": "snapshot-1700000000000.db" }),
        )])
        .await;

        drive_files(&server)
            .upload_workspace_snapshot(
                "token",
                "folder-1",
                &GoogleDriveSnapshotUpload {
                    workspace_id: "workspace-remote".to_string(),
                    device_id: "device-1".to_string(),
                    filename: "snapshot-1700000000000.db".to_string(),
                    created_at: 1_700_000_000_000,
                    source: GoogleDriveSnapshotSource::Manual,
                    app_version: "1.0.0".to_string(),
                    content_hash: Some("ABC123".to_string()),
                    content: b"sqlite".to_vec(),
                },
            )
            .await
            .expect("uploading the snapshot failed");

        let request = server.request(0);
        assert_eq!(
            request.method, "POST",
            "a snapshot was uploaded as a replacement rather than a new file"
        );

        let (metadata, content) = upload_parts(&request);
        let properties = &metadata["appProperties"];

        assert_eq!(content, "sqlite");
        assert_eq!(metadata["parents"], json!(["folder-1"]));
        assert_eq!(properties["rentableType"], "snapshot");
        assert_eq!(properties["rentableWorkspaceId"], "workspace-remote");
        assert_eq!(properties["rentableDeviceId"], "device-1");
        assert_eq!(properties["rentableCreatedAt"], "1700000000000");
        assert_eq!(properties["rentableSource"], "manual");
        assert_eq!(properties["rentableAppVersion"], "1.0.0");
        assert_eq!(
            properties["rentableContentHash"], "abc123",
            "the digest was not normalised on the way out, so a later read compares against a different spelling"
        );
    }

    #[tokio::test]
    async fn a_snapshot_taken_with_no_digest_declares_none() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({ "id": "snapshot-new", "name": "snapshot-1.db" }),
        )])
        .await;

        drive_files(&server)
            .upload_workspace_snapshot(
                "token",
                "folder-1",
                &GoogleDriveSnapshotUpload {
                    workspace_id: "workspace-1".to_string(),
                    device_id: "device-1".to_string(),
                    filename: "snapshot-1.db".to_string(),
                    created_at: 1,
                    source: GoogleDriveSnapshotSource::Autosave,
                    app_version: "1.0.0".to_string(),
                    content_hash: None,
                    content: b"sqlite".to_vec(),
                },
            )
            .await
            .expect("uploading the snapshot failed");

        let (metadata, _) = upload_parts(&server.request(0));

        assert!(
            metadata["appProperties"]
                .get("rentableContentHash")
                .is_none(),
            "a snapshot with no digest declared one anyway, which a later read would compare against"
        );
    }
    #[test]
    fn a_quote_in_a_query_value_cannot_close_the_literal_it_sits_in() {
        assert_eq!(escape_drive_query("o'brien"), "o\\'brien");
        assert_eq!(escape_drive_query("'"), "\\'");
        assert_eq!(escape_drive_query("nothing to escape"), "nothing to escape");
    }

    #[test]
    fn a_backslash_is_doubled_before_the_ones_quote_escaping_adds() {
        assert_eq!(escape_drive_query("a\\b"), "a\\\\b");

        // the pair together is what the other escaping order corrupts: the value's
        // own backslash would be read as escaping the escape, leaving the quote
        // free to close the literal and the rest of the value read as a query.
        assert_eq!(escape_drive_query("a\\'b"), "a\\\\\\'b");
    }

    #[test]
    fn the_default_endpoints_are_googles_own() {
        let endpoints = DriveEndpoints::default();

        assert!(
            endpoints
                .api_base_url
                .starts_with("https://www.googleapis.com/drive/"),
            "the default api endpoint was {}",
            endpoints.api_base_url
        );
        assert!(
            endpoints
                .upload_base_url
                .starts_with("https://www.googleapis.com/upload/drive/"),
            "the default upload endpoint was {}",
            endpoints.upload_base_url
        );
    }

    #[tokio::test]
    async fn a_listing_asks_for_the_fields_it_reads_and_answers_with_the_files() {
        let server = TestDriveServer::start(vec![listing(vec![
            file_json("file-1", "snapshot-1.db"),
            file_json("file-2", "snapshot-2.db"),
        ])])
        .await;

        let listed = drive_files(&server)
            .list("token", "trashed=false", 25, Some("modifiedTime desc"))
            .await
            .expect("the listing failed");

        assert_eq!(
            listed
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            ["file-1", "file-2"]
        );

        let request = server.request(0);

        assert_eq!(request.method, "GET");
        assert!(request.target.starts_with("/files?"));
        assert!(request.target.contains("pageSize=25"));
        assert!(request.target.contains("spaces=drive"));
        assert!(request.target.contains("orderBy=modifiedTime+desc"));
        assert!(
            request.target.contains("md5Checksum") && request.target.contains("appProperties"),
            "the listing did not ask for the fields it reads: {}",
            request.target
        );
    }

    #[tokio::test]
    async fn a_listing_orders_only_when_it_was_asked_to() {
        let server = TestDriveServer::start(vec![listing(vec![])]).await;

        drive_files(&server)
            .list("token", "trashed=false", 10, None)
            .await
            .expect("the listing failed");

        assert!(!server.request(0).target.contains("orderBy"));
    }

    #[tokio::test]
    async fn finding_a_file_asks_the_remote_for_one() {
        let server =
            TestDriveServer::start(vec![listing(vec![file_json("file-1", "manifest.json")])]).await;

        let found = drive_files(&server)
            .find("token", "name='manifest.json'", None)
            .await
            .expect("the search failed");

        assert_eq!(found.map(|file| file.id), Some("file-1".to_string()));
        assert!(server.request(0).target.contains("pageSize=1"));
    }

    #[tokio::test]
    async fn finding_nothing_is_an_answer_rather_than_a_failure() {
        let server = TestDriveServer::start(vec![listing(vec![])]).await;

        let found = drive_files(&server)
            .find("token", "name='manifest.json'", None)
            .await
            .expect("the search failed");

        assert!(found.is_none());
    }

    #[tokio::test]
    async fn getting_a_file_asks_for_every_field_this_app_reads() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            file_json("file-1", "snapshot-1.db"),
        )])
        .await;

        let file = drive_files(&server)
            .try_get("token", "file-1")
            .await
            .expect("the read failed");

        assert_eq!(
            file.map(|file| file.name),
            Some("snapshot-1.db".to_string())
        );

        let target = server.request(0).target;

        assert!(target.starts_with("/files/file-1?"));
        assert!(target.contains("appProperties"));
    }

    #[tokio::test]
    async fn a_file_that_is_gone_reads_as_absent_rather_than_as_a_failure() {
        let server = TestDriveServer::start(vec![json_response(
            404,
            json!({ "error": { "message": "File not found: file-1." } }),
        )])
        .await;

        let file = drive_files(&server)
            .try_get("token", "file-1")
            .await
            .expect("a missing file was reported as a failure");

        assert!(file.is_none());
    }

    #[tokio::test]
    async fn a_file_this_app_was_never_granted_reads_as_absent() {
        let server = TestDriveServer::start(vec![json_response(
            403,
            json!({
                "error": {
                    "message": "The user has not granted the app 000 read access to the file 111."
                }
            }),
        )])
        .await;

        let file = drive_files(&server)
            .try_get("token", "file-1")
            .await
            .expect("an ungranted file was reported as a failure");

        assert!(file.is_none());
    }

    #[tokio::test]
    async fn a_refusal_that_is_not_about_this_apps_grant_stays_a_refusal() {
        let server = TestDriveServer::start(vec![json_response(
            403,
            json!({ "error": { "message": "The user's Drive storage quota has been exceeded." } }),
        )])
        .await;

        assert!(matches!(
            drive_files(&server).try_get("token", "file-1").await,
            Err(Error::Forbidden { .. })
        ));
    }

    #[tokio::test]
    async fn deleting_a_file_that_is_already_gone_is_success() {
        let server = TestDriveServer::start(vec![json_response(404, json!({}))]).await;

        drive_files(&server)
            .delete("token", "file-1")
            .await
            .expect("deleting an absent file was reported as a failure");

        let request = server.request(0);

        assert_eq!(request.method, "DELETE");
        assert_eq!(request.target, "/files/file-1");
        assert!(request.body.is_empty());
    }

    #[tokio::test]
    async fn a_delete_the_remote_refuses_reaches_the_caller() {
        let server = TestDriveServer::start(vec![json_response(
            403,
            json!({ "error": { "message": "insufficient permissions" } }),
        )])
        .await;

        assert!(matches!(
            drive_files(&server).delete("token", "file-1").await,
            Err(Error::Forbidden { .. })
        ));
    }

    #[tokio::test]
    async fn a_download_asks_for_the_media_and_yields_the_bytes() {
        let server =
            TestDriveServer::start(vec![ScriptedResponse::new(200, b"sqlite bytes".to_vec())])
                .await;

        let bytes = drive_files(&server)
            .download("token", "file-1")
            .await
            .expect("the download failed");

        assert_eq!(bytes, b"sqlite bytes".to_vec());
        assert!(server.request(0).target.contains("alt=media"));
    }

    #[tokio::test]
    async fn creating_a_folder_posts_its_metadata_as_json() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            file_json("folder-1", "Rentable Sync"),
        )])
        .await;

        let created = drive_files(&server)
            .create_metadata_file("token", &json!({ "name": "Rentable Sync" }))
            .await
            .expect("the folder was not created");

        assert_eq!(created.id, "folder-1");

        let request = server.request(0);

        assert_eq!(request.method, "POST");
        assert_eq!(
            request.header("content-type"),
            Some("application/json; charset=UTF-8")
        );
        assert_eq!(request.body_as_text(), "{\"name\":\"Rentable Sync\"}");
    }

    #[tokio::test]
    async fn an_upload_sends_its_metadata_and_its_bytes_in_one_multipart_body() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            file_json("file-1", "snapshot-1.db"),
        )])
        .await;

        drive_files(&server)
            .upload(
                "token",
                &DriveUpload {
                    file_id: None,
                    name: "snapshot-1.db".to_string(),
                    parents: vec!["folder-1".to_string()],
                    mime_type: "application/x-sqlite3".to_string(),
                    app_properties: BTreeMap::from([(
                        "rentableType".to_string(),
                        "snapshot".to_string(),
                    )]),
                    content: b"sqlite bytes".to_vec(),
                },
            )
            .await
            .expect("the upload failed");

        let request = server.request(0);

        assert_eq!(request.method, "POST");
        assert!(request.target.starts_with("/upload/files?"));
        assert!(request.target.contains("uploadType=multipart"));

        let boundary = request
            .header("content-type")
            .and_then(|value| value.strip_prefix("multipart/related; boundary="))
            .expect("the upload declared no boundary")
            .to_string();
        let body = request.body_as_text();

        assert!(body.starts_with(&format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
        )));
        assert!(body.contains("\"name\":\"snapshot-1.db\""));
        assert!(body.contains("\"parents\":[\"folder-1\"]"));
        assert!(body.contains("\"rentableType\":\"snapshot\""));
        assert!(body.contains("\r\nContent-Type: application/x-sqlite3\r\n\r\nsqlite bytes"));
        assert!(body.ends_with(&format!("\r\n--{boundary}--")));
    }

    #[tokio::test]
    async fn an_upload_naming_a_file_updates_it_and_does_not_move_it() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            file_json("file-1", "snapshot-1.db"),
        )])
        .await;

        drive_files(&server)
            .upload(
                "token",
                &DriveUpload {
                    file_id: Some("file-1".to_string()),
                    name: "snapshot-1.db".to_string(),
                    parents: vec!["folder-1".to_string()],
                    mime_type: "application/x-sqlite3".to_string(),
                    app_properties: BTreeMap::new(),
                    content: b"sqlite bytes".to_vec(),
                },
            )
            .await
            .expect("the upload failed");

        let request = server.request(0);

        assert_eq!(request.method, "PATCH");
        assert!(request.target.starts_with("/upload/files/file-1?"));
        assert!(
            !request.body_as_text().contains("parents"),
            "an update named a parent, which asks drive to move the file"
        );
    }

    #[tokio::test]
    async fn a_workspace_folder_is_found_by_the_identifier_it_recorded() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            file_json("folder-1", "Primary workspace"),
        )])
        .await;
        let workspace = RemoteSyncWorkspace {
            remote_folder_id: Some("folder-1".to_string()),
            ..drive_workspace()
        };

        let folder = drive_files(&server)
            .resolve_existing_workspace_folder("token", &workspace)
            .await
            .expect("the folder was not resolved");

        assert_eq!(folder.map(|folder| folder.id), Some("folder-1".to_string()));
        assert_eq!(
            server.request_count(),
            1,
            "a folder the workspace already names should not be searched for"
        );
    }

    #[tokio::test]
    async fn a_forgotten_folder_is_recovered_through_a_file_the_workspace_still_tracks() {
        let server = TestDriveServer::start(vec![
            json_response(404, json!({})),
            json_response(
                200,
                json!({ "id": "manifest-1", "name": "manifest.json", "parents": ["folder-1"] }),
            ),
            json_response(200, file_json("folder-1", "Primary workspace")),
        ])
        .await;
        let workspace = RemoteSyncWorkspace {
            remote_folder_id: Some("folder-gone".to_string()),
            remote_manifest_file_id: Some("manifest-1".to_string()),
            ..drive_workspace()
        };

        let folder = drive_files(&server)
            .resolve_existing_workspace_folder("token", &workspace)
            .await
            .expect("the folder was not resolved");

        assert_eq!(folder.map(|folder| folder.id), Some("folder-1".to_string()));
    }

    #[tokio::test]
    async fn a_workspace_folder_is_found_by_its_workspace_property_under_the_root() {
        let server = TestDriveServer::start(vec![
            listing(vec![file_json("root-1", "Rentable Sync")]),
            listing(vec![file_json("folder-1", "Primary workspace")]),
        ])
        .await;

        let folder = drive_files(&server)
            .resolve_existing_workspace_folder("token", &drive_workspace())
            .await
            .expect("the folder was not resolved");

        assert_eq!(folder.map(|folder| folder.id), Some("folder-1".to_string()));

        let workspace_query = server.request(1).target;

        assert!(
            workspace_query.contains("rentableWorkspaceId") && workspace_query.contains("root-1"),
            "the workspace folder was not looked for under the root: {workspace_query}"
        );
    }

    #[tokio::test]
    async fn the_most_recently_touched_workspace_folder_is_the_last_resort() {
        let server = TestDriveServer::start(vec![
            listing(vec![file_json("root-1", "Rentable Sync")]),
            listing(vec![]),
            listing(vec![file_json("folder-2", "Some other workspace")]),
        ])
        .await;

        let folder = drive_files(&server)
            .resolve_existing_workspace_folder("token", &drive_workspace())
            .await
            .expect("the folder was not resolved");

        assert_eq!(folder.map(|folder| folder.id), Some("folder-2".to_string()));
        assert!(
            server
                .request(2)
                .target
                .contains("orderBy=modifiedTime+desc")
        );
    }

    #[tokio::test]
    async fn no_root_folder_means_this_workspace_has_no_folder_yet() {
        let server = TestDriveServer::start(vec![listing(vec![])]).await;

        let folder = drive_files(&server)
            .resolve_existing_workspace_folder("token", &drive_workspace())
            .await
            .expect("resolving reported a failure rather than an absence");

        assert!(folder.is_none());
    }

    #[tokio::test]
    async fn ensuring_a_folder_creates_the_root_before_the_workspace_folder() {
        let server = TestDriveServer::start(vec![
            listing(vec![]),
            listing(vec![]),
            json_response(200, file_json("root-1", "Rentable Sync")),
            json_response(200, file_json("folder-1", "Primary workspace")),
        ])
        .await;

        let folder = drive_files(&server)
            .ensure_workspace_folder("token", &drive_workspace())
            .await
            .expect("the folder was not created");

        assert_eq!(folder.id, "folder-1");

        let root_creation = server.request(2).body_as_text();

        assert!(root_creation.contains("\"name\":\"Rentable Sync\""));
        assert!(root_creation.contains("application/vnd.google-apps.folder"));
        assert!(root_creation.contains("\"rentableType\":\"root\""));

        let folder_creation = server.request(3).body_as_text();

        assert!(folder_creation.contains("\"name\":\"Primary workspace\""));
        assert!(folder_creation.contains("\"parents\":[\"root-1\"]"));
        assert!(folder_creation.contains("\"rentableWorkspaceId\":\"workspace-1\""));
    }

    #[tokio::test]
    async fn ensuring_a_folder_reuses_a_root_that_already_exists() {
        let server = TestDriveServer::start(vec![
            listing(vec![file_json("root-1", "Rentable Sync")]),
            listing(vec![]),
            listing(vec![]),
            listing(vec![file_json("root-1", "Rentable Sync")]),
            json_response(200, file_json("folder-1", "Primary workspace")),
        ])
        .await;

        let folder = drive_files(&server)
            .ensure_workspace_folder("token", &drive_workspace())
            .await
            .expect("the folder was not created");

        assert_eq!(folder.id, "folder-1");
        assert_eq!(
            server.request_count(),
            5,
            "a root folder that already exists was created a second time"
        );
    }

    #[tokio::test]
    async fn snapshots_are_listed_by_property_and_by_name_without_repeating_one() {
        let server = TestDriveServer::start(vec![
            listing(vec![snapshot_json("file-1", "snapshot-new.db", 3000)]),
            listing(vec![
                snapshot_json("file-1", "snapshot-new.db", 3000),
                snapshot_json("file-2", "snapshot-old.db", 1000),
                file_json("file-3", "notes.txt"),
            ]),
        ])
        .await;

        let snapshots = drive_files(&server)
            .list_workspace_snapshot_files("token", "folder-1")
            .await
            .expect("the snapshots were not listed");

        assert_eq!(
            snapshots
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            ["file-1", "file-2"],
            "a file was repeated, dropped, or ordered wrongly"
        );
    }

    #[tokio::test]
    async fn a_file_named_unlike_a_snapshot_is_not_taken_for_one() {
        let server = TestDriveServer::start(vec![
            listing(vec![]),
            listing(vec![
                file_json("file-1", "holiday-snapshot-photos.zip"),
                file_json("file-2", "snapshot-1.txt"),
            ]),
        ])
        .await;

        let snapshots = drive_files(&server)
            .list_workspace_snapshot_files("token", "folder-1")
            .await
            .expect("the snapshots were not listed");

        assert!(
            snapshots.is_empty(),
            "a file this application never wrote was taken for a snapshot"
        );
    }

    #[tokio::test]
    async fn a_manifest_is_found_in_the_folder_and_read() {
        let server = TestDriveServer::start(vec![
            listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
            ScriptedResponse::new(200, manifest_json().to_string()),
        ])
        .await;

        let resolved = drive_files(&server)
            .resolve_manifest("token", &drive_workspace(), "folder-1")
            .await
            .expect("resolving the manifest failed")
            .expect("no manifest was resolved");

        assert_eq!(resolved.file.id, "manifest-1");
        assert_eq!(
            resolved.manifest.map(|manifest| manifest.head.file_id),
            Some("head-1".to_string())
        );
        assert!(server.request(0).target.contains("manifest.json"));
    }

    #[tokio::test]
    async fn a_tracked_manifest_of_this_folder_is_read_without_a_search() {
        let server = TestDriveServer::start(vec![
            json_response(
                200,
                json!({
                    "id": "manifest-1",
                    "name": "manifest.json",
                    "parents": ["folder-1"],
                    "appProperties": { "rentableType": "manifest" },
                }),
            ),
            ScriptedResponse::new(200, manifest_json().to_string()),
        ])
        .await;
        let workspace = RemoteSyncWorkspace {
            remote_manifest_file_id: Some("manifest-1".to_string()),
            ..drive_workspace()
        };

        let resolved = drive_files(&server)
            .resolve_manifest("token", &workspace, "folder-1")
            .await
            .expect("resolving the manifest failed")
            .expect("no manifest was resolved");

        assert_eq!(resolved.file.id, "manifest-1");
        assert_eq!(
            server.request_count(),
            2,
            "a manifest the workspace already names was searched for anyway"
        );
    }

    #[tokio::test]
    async fn a_tracked_manifest_belonging_to_another_folder_is_not_this_folders_manifest() {
        let server = TestDriveServer::start(vec![
            json_response(
                200,
                json!({
                    "id": "manifest-elsewhere",
                    "name": "manifest.json",
                    "parents": ["folder-other"],
                    "appProperties": { "rentableType": "manifest" },
                }),
            ),
            listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
            ScriptedResponse::new(200, manifest_json().to_string()),
        ])
        .await;
        let workspace = RemoteSyncWorkspace {
            remote_manifest_file_id: Some("manifest-elsewhere".to_string()),
            ..drive_workspace()
        };

        let resolved = drive_files(&server)
            .resolve_manifest("token", &workspace, "folder-1")
            .await
            .expect("resolving the manifest failed")
            .expect("no manifest was resolved");

        assert_eq!(resolved.file.id, "manifest-1");
    }

    #[tokio::test]
    async fn content_that_is_not_a_manifest_and_no_snapshots_to_rebuild_from_resolves_to_the_file_alone()
     {
        let server = TestDriveServer::start(vec![
            listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
            ScriptedResponse::new(200, b"not json at all".to_vec()),
            listing(vec![]),
            listing(vec![]),
        ])
        .await;

        let resolved = drive_files(&server)
            .resolve_manifest("token", &drive_workspace(), "folder-1")
            .await
            .expect("resolving the manifest failed")
            .expect("no manifest file was resolved");

        assert_eq!(resolved.file.id, "manifest-1");
        assert!(
            resolved.manifest.is_none(),
            "unreadable content was read as a manifest"
        );
    }

    #[tokio::test]
    async fn a_folder_holding_no_manifest_and_no_snapshots_resolves_to_nothing() {
        let server =
            TestDriveServer::start(vec![listing(vec![]), listing(vec![]), listing(vec![])]).await;

        let resolved = drive_files(&server)
            .resolve_manifest("token", &drive_workspace(), "folder-1")
            .await
            .expect("resolving reported a failure rather than an absence");

        assert!(resolved.is_none());
    }

    #[tokio::test]
    async fn a_folder_whose_manifest_is_gone_has_one_rebuilt_from_the_snapshots_present() {
        let server = TestDriveServer::start(vec![
            listing(vec![]),
            listing(vec![snapshot_json("snap-1", "snapshot-1.db", 5_000)]),
            listing(vec![]),
            ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
            json_response(200, file_json("manifest-9", "manifest.json")),
        ])
        .await;

        let resolved = drive_files(&server)
            .resolve_manifest("token", &drive_workspace(), "folder-1")
            .await
            .expect("resolving the manifest failed")
            .expect("no manifest was rebuilt");

        assert_eq!(resolved.file.id, "manifest-9");
        assert_eq!(
            resolved
                .manifest
                .as_ref()
                .map(|manifest| manifest.head.file_id.as_str()),
            Some("snap-1")
        );
        assert_eq!(
            resolved
                .manifest
                .and_then(|manifest| manifest.head.content_hash),
            Some(content_hash_hex(b"the snapshot bytes")),
            "the rebuilt head was not fingerprinted from the bytes actually there"
        );

        let write = server.request(4);

        assert_eq!(write.method, "POST");
        assert!(write.body_as_text().contains("\"parents\":[\"folder-1\"]"));
    }

    #[tokio::test]
    async fn a_manifest_that_cannot_be_read_is_rebuilt_over_rather_than_left_beside_a_new_one() {
        let server = TestDriveServer::start(vec![
            listing(vec![json!({ "id": "manifest-1", "name": "manifest.json" })]),
            ScriptedResponse::new(200, b"not json at all".to_vec()),
            listing(vec![snapshot_json("snap-1", "snapshot-1.db", 5_000)]),
            listing(vec![]),
            ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
            json_response(200, file_json("manifest-1", "manifest.json")),
        ])
        .await;

        let resolved = drive_files(&server)
            .resolve_manifest("token", &drive_workspace(), "folder-1")
            .await
            .expect("resolving the manifest failed")
            .expect("no manifest was rebuilt");

        assert_eq!(resolved.file.id, "manifest-1");

        let write = server.request(5);

        assert_eq!(write.method, "PATCH");
        assert!(
            write.target.contains("/files/manifest-1"),
            "the rebuild was written somewhere other than the unreadable manifest: {}",
            write.target
        );
    }

    #[tokio::test]
    async fn saving_a_manifest_writes_it_into_the_folder_as_json() {
        let server = TestDriveServer::start(vec![
            listing(vec![]),
            json_response(200, file_json("manifest-2", "manifest.json")),
        ])
        .await;

        let saved = drive_files(&server)
            .save_manifest(
                "token",
                &drive_workspace(),
                "folder-1",
                None,
                &fixture_manifest(),
            )
            .await
            .expect("the manifest was not saved");

        assert_eq!(saved.file.id, "manifest-2");
        assert!(!saved.was_rebuilt);

        let body = server.request(1).body_as_text();

        assert!(body.contains("\"name\":\"manifest.json\""));
        assert!(body.contains("\"parents\":[\"folder-1\"]"));
        assert!(body.contains("\"rentableType\":\"manifest\""));
        assert!(body.contains("\"rentableWorkspaceId\":\"workspace-1\""));
        assert!(
            body.contains("\"fileId\": \"head-1\""),
            "the manifest itself never reached the body"
        );
    }

    #[tokio::test]
    async fn saving_a_manifest_twice_leaves_the_folder_holding_one() {
        let server = TestDriveServer::start(vec![
            listing(vec![]),
            json_response(200, file_json("manifest-1", "manifest.json")),
            listing(vec![file_json("manifest-1", "manifest.json")]),
            json_response(200, file_json("manifest-1", "manifest.json")),
        ])
        .await;
        let files = drive_files(&server);
        let workspace = drive_workspace();

        let first = files
            .save_manifest("token", &workspace, "folder-1", None, &fixture_manifest())
            .await
            .expect("the first save failed");
        let second = files
            .save_manifest(
                "token",
                &workspace,
                "folder-1",
                Some(&first.file),
                &fixture_manifest(),
            )
            .await
            .expect("the second save failed");

        assert_eq!(second.file.id, first.file.id);
        assert!(!second.was_rebuilt);

        let rewrite = server.request(3);

        // a create is a POST, and Drive answers one by adding a file rather than by
        // replacing the one already there. Naming the file is the whole difference.
        assert_eq!(rewrite.method, "PATCH");
        assert!(
            rewrite.target.contains("/files/manifest-1"),
            "the second save did not name the first: {}",
            rewrite.target
        );
        assert!(
            !rewrite.body_as_text().contains("parents"),
            "an update named a parent, which asks drive to move the file"
        );
    }

    #[tokio::test]
    async fn a_manifest_another_client_replaced_is_rebuilt_and_the_write_still_succeeds() {
        let server = TestDriveServer::start(vec![
            listing(vec![json!({
                "id": "manifest-1",
                "name": "manifest.json",
                "version": "9",
            })]),
            listing(vec![snapshot_json("snap-2", "snapshot-2.db", 6_000)]),
            listing(vec![]),
            ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
            json_response(200, file_json("manifest-1", "manifest.json")),
        ])
        .await;
        let expected = DriveFile {
            version: Some("3".to_string()),
            ..drive_file("manifest-1")
        };

        let saved = drive_files(&server)
            .save_manifest(
                "token",
                &drive_workspace(),
                "folder-1",
                Some(&expected),
                &fixture_manifest(),
            )
            .await
            .expect("a concurrent overwrite was reported as a failure");

        // drive offers no compare-and-set, so refusing the write would trade a
        // recoverable event for one the user has to act on. The snapshots are the
        // source of truth and the index is derived from them, so it is rebuilt and
        // the write goes through.
        assert!(saved.was_rebuilt);
        assert_eq!(saved.manifest.head.file_id, "snap-2");
        assert_eq!(saved.file.id, "manifest-1");

        // the index the caller was about to write is stale, not worthless: a folder
        // listing does not say which version of this application wrote a snapshot,
        // so a rebuild that ignored it would report "unknown" for something already
        // recorded.
        assert_eq!(saved.manifest.head.app_version, "1.0.0");
    }

    #[tokio::test]
    async fn a_rebuilt_manifest_is_the_one_the_builder_would_have_produced_from_the_same_files() {
        let server = TestDriveServer::start(vec![
            listing(vec![]),
            listing(vec![snapshot_json("snap-1", "snapshot-1.db", 5_000)]),
            listing(vec![]),
            ScriptedResponse::new(200, b"the snapshot bytes".to_vec()),
            json_response(200, file_json("manifest-9", "manifest.json")),
        ])
        .await;

        let rebuilt = drive_files(&server)
            .resolve_manifest("token", &drive_workspace(), "folder-1")
            .await
            .expect("resolving the manifest failed")
            .and_then(|resolved| resolved.manifest)
            .expect("no manifest was rebuilt");

        let mut file = snapshot("snap-1", "autosave", 5_000);
        file.name = "snapshot-1.db".to_string();
        let expected = build_google_drive_manifest_from_snapshots(
            "workspace-1",
            "Primary workspace",
            &choose_retained_workspace_snapshots(&[file.clone()]),
            &file,
            &GoogleDriveManifestEntryOverrides {
                content_hash: Some(content_hash_hex(b"the snapshot bytes")),
                ..GoogleDriveManifestEntryOverrides::default()
            },
            None,
            rebuilt.metadata.updated_at,
        )
        .expect("the comparison manifest should build");

        assert_eq!(rebuilt, expected);
    }

    #[tokio::test]
    async fn a_head_the_remote_no_longer_holds_has_no_state() {
        let server = TestDriveServer::start(vec![json_response(404, json!({}))]).await;

        let state = drive_files(&server)
            .resolve_remote_head_state("token", &fixture_manifest())
            .await
            .expect("resolving reported a failure rather than an absence");

        assert!(state.is_none());
    }

    #[tokio::test]
    async fn an_unchanged_head_carrying_a_digest_is_taken_at_the_manifests_word() {
        let digest = "a".repeat(64);
        let mut manifest = fixture_manifest();
        manifest.head.content_hash = Some(digest.clone());

        let server = TestDriveServer::start(vec![json_response(
            200,
            file_json("head-1", "snapshot-head-1.db"),
        )])
        .await;

        let state = drive_files(&server)
            .resolve_remote_head_state("token", &manifest)
            .await
            .expect("resolving the head failed")
            .expect("the head was reported as gone");

        assert!(!state.changed_from_manifest);
        assert_eq!(state.content_hash, Some(digest));
        assert_eq!(
            server.request_count(),
            1,
            "a head that had not moved was downloaded to be hashed again"
        );
    }

    #[tokio::test]
    async fn a_head_that_moved_on_is_hashed_from_the_bytes_the_remote_now_holds() {
        let bytes = b"the newer snapshot".to_vec();
        let server = TestDriveServer::start(vec![
            json_response(
                200,
                json!({ "id": "head-1", "name": "snapshot-head-1.db", "version": "9" }),
            ),
            ScriptedResponse::new(200, bytes.clone()),
        ])
        .await;

        let state = drive_files(&server)
            .resolve_remote_head_state("token", &fixture_manifest())
            .await
            .expect("resolving the head failed")
            .expect("the head was reported as gone");

        assert!(state.changed_from_manifest);
        assert_eq!(state.content_hash, Some(content_hash_hex(&bytes)));
    }

    #[tokio::test]
    async fn a_head_whose_bytes_cannot_be_read_is_still_reported_as_present() {
        let server = TestDriveServer::start(vec![
        json_response(
            200,
            json!({ "id": "head-1", "name": "snapshot-head-1.db", "version": "9" }),
        ),
        json_response(
            403,
            json!({ "error": { "message": "The user's Drive storage quota has been exceeded." } }),
        ),
    ])
    .await;

        let state = drive_files(&server)
            .resolve_remote_head_state("token", &fixture_manifest())
            .await
            .expect("resolving the head failed")
            .expect("a head whose bytes could not be read was reported as gone");

        assert!(state.changed_from_manifest);
        assert!(state.content_hash.is_none());
    }

    #[tokio::test]
    async fn the_account_read_asks_for_the_fields_it_maps_and_answers_with_them() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({
                "user": {
                    "displayName": "Amal Nasser",
                    "emailAddress": "amal@example.com",
                    "photoLink": "https://lh3.example.com/a/amal",
                    "permissionId": "17420938475",
                },
                "storageQuota": { "limit": "16106127360", "usage": "4294967296" },
            }),
        )])
        .await;

        let account = drive_files(&server)
            .read_account_details("ya29.the-access-token")
            .await
            .expect("the account read failed");

        assert_eq!(
            account,
            GoogleDriveAccountDetails {
                email: Some("amal@example.com".to_string()),
                display_name: Some("Amal Nasser".to_string()),
                avatar_url: Some("https://lh3.example.com/a/amal".to_string()),
                provider_user_id: Some("17420938475".to_string()),
                drive_quota_bytes: Some(16_106_127_360),
                drive_usage_bytes: Some(4_294_967_296),
            }
        );

        let request = server.request(0);

        assert_eq!(request.method, "GET");
        assert!(request.target.starts_with("/about?"));
        assert_eq!(
            request.header("authorization"),
            Some("Bearer ya29.the-access-token")
        );
        assert!(
            ["displayName", "emailAddress", "photoLink", "permissionId"]
                .iter()
                .all(|field| request.target.contains(field)),
            "the account read did not ask for the identity it maps: {}",
            request.target
        );
        assert!(
            request.target.contains("storageQuota"),
            "the account read did not ask for the storage figures: {}",
            request.target
        );
    }

    /// a name Drive omitted has to stay distinguishable from one it sent, because
    /// the two callers of this read disagree about what to do with the absence —
    /// linking labels the account by its address, refreshing keeps the name already
    /// recorded. A fallback applied here would settle that for both of them.
    #[tokio::test]
    async fn a_name_or_address_that_is_only_whitespace_reads_as_absent() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({
                "user": { "displayName": "   ", "emailAddress": "  amal@example.com  " },
                "storageQuota": { "limit": "16106127360", "usage": "0" },
            }),
        )])
        .await;

        let account = drive_files(&server)
            .read_account_details("token")
            .await
            .expect("the account read failed");

        assert_eq!(account.email, Some("amal@example.com".to_string()));
        assert_eq!(account.display_name, None);
        assert_eq!(account.drive_usage_bytes, Some(0));
    }

    #[tokio::test]
    async fn an_account_drive_described_nothing_about_reads_as_empty_rather_than_failing() {
        let server = TestDriveServer::start(vec![json_response(200, json!({}))]).await;

        let account = drive_files(&server)
            .read_account_details("token")
            .await
            .expect("the account read failed");

        assert_eq!(account, GoogleDriveAccountDetails::default());
    }

    /// an unlimited allowance is reported by omitting the limit, so an absent
    /// figure has to stay absent — a zero here would read as a full disk.
    #[tokio::test]
    async fn a_storage_figure_that_is_not_a_whole_byte_count_is_absent_rather_than_zero() {
        let server = TestDriveServer::start(vec![json_response(
            200,
            json!({
                "user": { "emailAddress": "amal@example.com" },
                "storageQuota": { "usage": "not a number" },
            }),
        )])
        .await;

        let account = drive_files(&server)
            .read_account_details("token")
            .await
            .expect("the account read failed");

        assert_eq!(account.drive_quota_bytes, None);
        assert_eq!(account.drive_usage_bytes, None);
    }

    #[tokio::test]
    async fn retention_deletes_the_snapshots_it_did_not_keep() {
        let server = TestDriveServer::start(vec![
            listing(vec![
                sourced_snapshot_json("manual-2", "manual", 5_000),
                sourced_snapshot_json("auto-3", "autosave", 4_000),
                sourced_snapshot_json("auto-1", "autosave", 2_000),
            ]),
            listing(vec![]),
            deleted(),
        ])
        .await;

        let retained = drive_files(&server)
            .apply_workspace_snapshot_retention("token", "folder-1")
            .await
            .expect("applying retention failed");

        assert_eq!(
            retained
                .iter()
                .map(|entry| entry.file.id.as_str())
                .collect::<Vec<_>>(),
            ["manual-2", "auto-3"]
        );
        assert_eq!(deleted_file_ids(&server), ["auto-1"]);
    }

    /// the policy keeps one snapshot per source, so the two newest of *different*
    /// sources both survive and neither evicts the other.
    #[tokio::test]
    async fn retention_evicts_within_a_source_and_never_across_two() {
        let server = TestDriveServer::start(vec![
            listing(vec![
                sourced_snapshot_json("auto-2", "autosave", 9_000),
                sourced_snapshot_json("auto-1", "autosave", 8_000),
                sourced_snapshot_json("manual-1", "manual", 1_000),
            ]),
            listing(vec![]),
            deleted(),
        ])
        .await;

        let retained = drive_files(&server)
            .apply_workspace_snapshot_retention("token", "folder-1")
            .await
            .expect("applying retention failed");

        assert_eq!(
            retained
                .iter()
                .map(|entry| entry.file.id.as_str())
                .collect::<Vec<_>>(),
            ["auto-2", "manual-1"]
        );
        assert_eq!(deleted_file_ids(&server), ["auto-1"]);
    }

    /// a snapshot declaring a source this application does not recognise is never
    /// retained, and it is not therefore stale: retention has no opinion about it,
    /// and a file this application cannot account for is not its to remove.
    #[tokio::test]
    async fn a_snapshot_of_an_unrecognised_origin_is_left_where_it_is() {
        let server = TestDriveServer::start(vec![
            listing(vec![
                sourced_snapshot_json("foreign-1", "some-other-tool", 9_000),
                sourced_snapshot_json("auto-1", "autosave", 5_000),
            ]),
            listing(vec![]),
        ])
        .await;

        let retained = drive_files(&server)
            .apply_workspace_snapshot_retention("token", "folder-1")
            .await
            .expect("applying retention failed");

        assert_eq!(
            retained
                .iter()
                .map(|entry| entry.file.id.as_str())
                .collect::<Vec<_>>(),
            ["auto-1"]
        );
        assert!(
            deleted_file_ids(&server).is_empty(),
            "a file this application did not write was deleted: {:?}",
            deleted_file_ids(&server)
        );
    }

    #[tokio::test]
    async fn deleting_every_snapshot_but_the_named_ones_spares_exactly_those() {
        let server = TestDriveServer::start(vec![
            listing(vec![
                sourced_snapshot_json("auto-3", "autosave", 5_000),
                sourced_snapshot_json("auto-2", "autosave", 3_000),
                sourced_snapshot_json("manual-1", "manual", 1_000),
            ]),
            listing(vec![]),
            deleted(),
            deleted(),
        ])
        .await;

        drive_files(&server)
            .delete_workspace_snapshots_except("token", "folder-1", &["auto-3"])
            .await
            .expect("deleting the snapshots failed");

        assert_eq!(deleted_file_ids(&server), ["auto-2", "manual-1"]);
    }

    #[tokio::test]
    async fn superseded_manifests_are_deleted_and_the_named_one_survives() {
        let server = TestDriveServer::start(vec![
            listing(vec![
                manifest_file_json("manifest-3"),
                manifest_file_json("manifest-2"),
                manifest_file_json("manifest-1"),
            ]),
            deleted(),
            deleted(),
        ])
        .await;

        drive_files(&server)
            .delete_workspace_manifests_except("token", "folder-1", Some("manifest-3"))
            .await
            .expect("deleting the superseded manifests failed");

        assert_eq!(deleted_file_ids(&server), ["manifest-2", "manifest-1"]);

        let query = server.request(0).target;

        assert!(
            query.contains("folder-1") && query.contains("manifest.json"),
            "the cleanup did not ask for this folder's manifests: {query}"
        );

        // the name is not reserved, so it is the declared type that separates a
        // manifest this application wrote from a file the user happened to call
        // manifest.json. Asking without it turns the cleanup into a purge.
        assert!(
            query.contains("rentableType") && query.contains("manifest"),
            "the cleanup asked by name alone, which would take a stranger's file: {query}"
        );
    }

    #[tokio::test]
    async fn purging_a_workspace_folder_removes_the_snapshots_and_the_manifest_it_wrote() {
        let server = TestDriveServer::start(vec![
            listing(vec![
                sourced_snapshot_json("auto-1", "autosave", 5_000),
                sourced_snapshot_json("manual-1", "manual", 4_000),
            ]),
            listing(vec![]),
            deleted(),
            deleted(),
            listing(vec![manifest_file_json("manifest-1")]),
            deleted(),
        ])
        .await;

        drive_files(&server)
            .purge_workspace_folder("token", "folder-1")
            .await
            .expect("purging the folder failed");

        assert_eq!(
            deleted_file_ids(&server),
            ["auto-1", "manual-1", "manifest-1"],
            "a purge left something this application wrote behind"
        );
    }

    /// a workspace folder is a place in the user's own Drive, and emptying it of
    /// this application's files is not the same as emptying it. Nothing here
    /// declares an origin this application can account for, so nothing goes.
    ///
    /// `named-1` is the file that matters: it is named exactly as this application
    /// names a snapshot, so the listing takes it — and it declares no source, so
    /// the deletion rule leaves it. Being recognisable enough to read is not being
    /// owned enough to destroy.
    #[tokio::test]
    async fn purging_leaves_every_file_this_application_did_not_write() {
        let server = TestDriveServer::start(vec![
            listing(vec![sourced_snapshot_json(
                "foreign-1",
                "some-other-tool",
                9_000,
            )]),
            listing(vec![
                file_json("named-1", "snapshot-2024-05-01.db"),
                file_json("notes-1", "snapshot-notes.txt"),
                file_json("photos-1", "holiday-snapshot-photos.zip"),
            ]),
            listing(vec![]),
        ])
        .await;

        drive_files(&server)
            .purge_workspace_folder("token", "folder-1")
            .await
            .expect("purging the folder failed");

        assert!(
            deleted_file_ids(&server).is_empty(),
            "a purge deleted a file this application never wrote: {:?}",
            deleted_file_ids(&server)
        );
    }
}
