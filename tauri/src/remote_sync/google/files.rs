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

use super::super::store::RemoteSyncWorkspace;
use super::conflict::{
    content_hash_hex, did_remote_head_change_from_manifest, is_cryptographic_content_hash,
    normalize_content_hash,
};
use super::manifest::{
    GoogleDriveManifest, MANIFEST_FILE_TYPE, MANIFEST_FILENAME, is_canonical_snapshot_filename,
    is_tracked_manifest_file_for_folder, normalize_google_drive_manifest,
};
use super::retention::compare_drive_files_by_snapshot_recency;
use super::transport::{
    DriveFile, DriveRequest, DriveResponse, DriveTransport, FILE_TYPE_PROPERTY,
    GOOGLE_DRIVE_API_BASE_URL, parse_drive_number,
};

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

/// the `rentableType` values marking each kind of file this application owns.
const ROOT_FOLDER_TYPE: &str = "root";
const WORKSPACE_FOLDER_TYPE: &str = "workspace";
const SNAPSHOT_FILE_TYPE: &str = "snapshot";

/// the app-property naming which workspace a file belongs to.
const WORKSPACE_ID_PROPERTY: &str = "rentableWorkspaceId";

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

/// what the remote's manifest turned out to be.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoogleDriveManifestResolution {
    pub file: DriveFile,
    /// the manifest the file held, or `None` where it could not be read as one.
    /// Rebuilding it is a write, and resolution only reads, so what to do about
    /// an unreadable manifest is the caller's.
    pub manifest: Option<GoogleDriveManifest>,
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

    /// the manifest in a workspace folder, or `None` where the folder holds
    /// none.
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
            None => {
                self.find(
                    access_token,
                    &format!(
                        "{} and trashed=false and name='{MANIFEST_FILENAME}' and {}",
                        in_parents(folder_id),
                        app_property_clause(FILE_TYPE_PROPERTY, MANIFEST_FILE_TYPE)
                    ),
                    Some("modifiedTime desc"),
                )
                .await?
            }
        };

        let Some(manifest_file) = manifest_file else {
            return Ok(None);
        };

        let content = self.download_text(access_token, &manifest_file.id).await?;
        let manifest = serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|raw| normalize_google_drive_manifest(&raw).ok());

        Ok(Some(GoogleDriveManifestResolution {
            file: manifest_file,
            manifest,
        }))
    }

    /// write the manifest into the workspace folder.
    pub async fn save_manifest(
        &self,
        access_token: &str,
        folder_id: &str,
        workspace_id: &str,
        manifest: &GoogleDriveManifest,
    ) -> Result<DriveFile, Error> {
        let content = serde_json::to_vec_pretty(manifest).map_err(|error| Error::Internal {
            message: format!("could not write the google drive manifest: {error}"),
        })?;

        self.upload(
            access_token,
            &DriveUpload {
                file_id: None,
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
