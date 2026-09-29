//! the in-memory adapter: a Turso that answers in memory, for every caller above the port.

use crate::error::Error;

use super::{AccessLevel, DeletionIntent, TursoPlatform, WorkspaceDatabase, turso_refused};

/// A Turso that answers in memory, for every caller above this port.
///
/// It records what it was asked so a test can assert on the calls, and it can be told to refuse
/// the next operation in any of the port's vocabulary so a caller's handling of each answer is
/// testable without a network. Names are unique, as Turso's are, and a database's protection is a
/// fact it keeps, so a caller that deletes without lifting it is refused the way Turso refuses.
#[cfg(test)]
pub(crate) struct InMemoryPlatform {
    slug: String,
    state: std::sync::Mutex<InMemoryState>,
}

#[cfg(test)]
#[derive(Default)]
struct InMemoryState {
    databases: Vec<InMemoryDatabase>,
    minted: Vec<(String, String, AccessLevel)>,
    deleted: Vec<(String, DeletionIntent)>,
    /// every rotation, by database, in order.
    rotated: Vec<String>,
    /// every copy, as `(source, copy)`, in order.
    copies: Vec<(String, String)>,
    refuse_next: Option<Error>,
    /// how many operations have been asked, so a refusal can be placed on the nth.
    asked: usize,
    refuse_at: Option<(usize, Error)>,
    /// what this account calls the consented group, where the caller said it has one to find.
    group_name: Option<String>,
}

#[cfg(test)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct InMemoryDatabase {
    pub(crate) name: String,
    pub(crate) delete_protection: bool,
    /// how many times this database's credentials have been rotated. A token minted after a
    /// rotation spells the count, so a test can tell a fresh credential from the one it replaced;
    /// before any rotation the spelling is the one every earlier test reads.
    pub(crate) rotations: usize,
}

#[cfg(test)]
impl InMemoryPlatform {
    pub(crate) fn new(slug: &str) -> Self {
        Self {
            slug: slug.to_string(),
            state: std::sync::Mutex::new(InMemoryState::default()),
        }
    }

    /// A database that exists on the account already, unprotected, as the MCP first-create leaves
    /// one, so a caller's protect-after-create is testable.
    pub(crate) fn holding_unprotected(&self, name: &str) {
        self.locked().databases.push(InMemoryDatabase {
            name: name.to_string(),
            delete_protection: false,
            rotations: 0,
        });
    }

    /// what `group_named` answers. Nothing by default, which is the account whose slug is not
    /// the owner's username and the one a first run has to find the group some other way on.
    pub(crate) fn naming_the_group(&self, name: &str) {
        self.locked().group_name = Some(name.to_string());
    }

    /// the next operation fails with `error`, and the one after it is answered normally.
    pub(crate) fn refuse_next(&self, error: Error) {
        self.locked().refuse_next = Some(error);
    }

    /// the `nth` operation asked of this fake, counting from one, fails with `error`. For a
    /// caller whose sequence is fixed and whose handling of a failure part-way through is what is
    /// under test.
    pub(crate) fn refuse_nth(&self, nth: usize, error: Error) {
        self.locked().refuse_at = Some((nth, error));
    }

    pub(crate) fn databases(&self) -> Vec<InMemoryDatabase> {
        self.locked().databases.clone()
    }

    /// every mint, as `(database, expiration, access)`, in order.
    pub(crate) fn minted(&self) -> Vec<(String, String, AccessLevel)> {
        self.locked().minted.clone()
    }

    pub(crate) fn deleted(&self) -> Vec<(String, DeletionIntent)> {
        self.locked().deleted.clone()
    }

    /// every rotation, by database, in order.
    pub(crate) fn rotated(&self) -> Vec<String> {
        self.locked().rotated.clone()
    }

    /// every copy, as `(source, copy)`, in order.
    pub(crate) fn copies(&self) -> Vec<(String, String)> {
        self.locked().copies.clone()
    }

    fn locked(&self) -> std::sync::MutexGuard<'_, InMemoryState> {
        self.state
            .lock()
            .expect("the in-memory platform lock was poisoned")
    }

    fn take_refusal(state: &mut InMemoryState) -> Result<(), Error> {
        state.asked += 1;

        if let Some((nth, _)) = &state.refuse_at
            && *nth == state.asked
            && let Some((_, error)) = state.refuse_at.take()
        {
            return Err(error);
        }

        match state.refuse_next.take() {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
impl TursoPlatform for InMemoryPlatform {
    async fn create_database(&self, name: &str) -> Result<WorkspaceDatabase, Error> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        if state.databases.iter().any(|database| database.name == name) {
            return Err(turso_refused("create the workspace database"));
        }

        state.databases.push(InMemoryDatabase {
            name: name.to_string(),
            delete_protection: true,
            rotations: 0,
        });

        Ok(WorkspaceDatabase {
            name: name.to_string(),
            hostname: format!("{name}-{}.aws-eu-west-1.turso.io", self.slug),
        })
    }

    /// A copy is a database like any other here, protected, and recorded with the one it was
    /// seeded from. Turso refuses a seed that is not on the account, and a name that is taken.
    async fn copy_database(&self, source: &str, name: &str) -> Result<(), Error> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        if !state
            .databases
            .iter()
            .any(|database| database.name == source)
            || state.databases.iter().any(|database| database.name == name)
        {
            return Err(turso_refused("copy the database"));
        }

        state.databases.push(InMemoryDatabase {
            name: name.to_string(),
            delete_protection: true,
            rotations: 0,
        });
        state.copies.push((source.to_string(), name.to_string()));

        Ok(())
    }

    async fn mint_token(
        &self,
        database_name: &str,
        expiration: &str,
        access: AccessLevel,
    ) -> Result<String, Error> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        let Some(database) = state
            .databases
            .iter()
            .find(|database| database.name == database_name)
        else {
            return Err(turso_refused("mint a token for this workspace"));
        };
        let rotations = database.rotations;

        state
            .minted
            .push((database_name.to_string(), expiration.to_string(), access));

        Ok(if rotations == 0 {
            format!("token-for-{database_name}-{expiration}-{}", access.as_str())
        } else {
            format!(
                "token-for-{database_name}-{expiration}-{}-r{rotations}",
                access.as_str()
            )
        })
    }

    /// **A name this fake has never seen is taken as a database the MCP server created**, which
    /// is the one way a database arrives on the account without passing through this port, and
    /// the only caller of `protect_database`. Turso would refuse a name that does not exist; the
    /// fake cannot tell that case from the MCP one, and the scripted MCP server in the same test
    /// is what pins the create.
    async fn protect_database(&self, name: &str) -> Result<(), Error> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        match state
            .databases
            .iter_mut()
            .find(|database| database.name == name)
        {
            Some(database) => database.delete_protection = true,
            None => state.databases.push(InMemoryDatabase {
                name: name.to_string(),
                delete_protection: true,
                rotations: 0,
            }),
        }

        Ok(())
    }

    /// **A read, and it takes no turn at the refusal hooks.** Those count the operations a
    /// caller's sequence is asserted on, and this one is asked before a first run has created
    /// anything, so counting it would move every `refuse_nth` in the crate by one.
    async fn group_named(
        &self,
        _platform_token: &str,
        _group_uuid: Option<&str>,
    ) -> Result<Option<String>, Error> {
        Ok(self.locked().group_name.clone())
    }

    async fn rotate_credentials(&self, database_name: &str) -> Result<(), Error> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        let Some(database) = state
            .databases
            .iter_mut()
            .find(|database| database.name == database_name)
        else {
            return Err(turso_refused(
                "lock the removed member out of this workspace",
            ));
        };

        database.rotations += 1;
        state.rotated.push(database_name.to_string());

        Ok(())
    }

    async fn delete_database(&self, name: &str, intent: DeletionIntent) -> Result<(), Error> {
        let mut state = self.locked();
        Self::take_refusal(&mut state)?;

        let Some(index) = state
            .databases
            .iter()
            .position(|database| database.name == name)
        else {
            return Err(turso_refused("remove the workspace database"));
        };

        state.databases.remove(index);
        state.deleted.push((name.to_string(), intent));

        Ok(())
    }
}

#[cfg(test)]
mod tests {

    use crate::turso::platform::{
        AccessLevel, DeletionIntent, InMemoryPlatform, TursoPlatform, account_refused,
        turso_refused,
    };

    const TOKEN: &str = "a-platform-token";

    /// The stand-in answers what it was told to, which is how a caller's two ways of learning
    /// the group are told apart in a test that makes no requests at all.
    #[tokio::test]
    async fn the_in_memory_platform_answers_the_group_it_was_given() {
        let platform = InMemoryPlatform::new("an-org");

        assert_eq!(
            platform.group_named(TOKEN, None).await,
            Ok(None),
            "a platform nobody named a group on answered one"
        );

        platform.naming_the_group("rentable-empty");

        assert_eq!(
            platform
                .group_named(TOKEN, Some("a-uuid"))
                .await
                .expect("the group lookup failed")
                .as_deref(),
            Some("rentable-empty")
        );
    }

    /// The in-memory port is what every caller above is tested against, so it has to keep the
    /// facts Turso keeps: names are unique, a create is protected, and a delete is recorded with
    /// its intent.
    #[tokio::test]
    async fn the_in_memory_platform_keeps_the_facts_turso_keeps() {
        let platform = InMemoryPlatform::new("an-org");

        let database = platform
            .create_database("ws-1")
            .await
            .expect("the create failed");

        assert_eq!(database.hostname, "ws-1-an-org.aws-eu-west-1.turso.io");
        assert!(platform.databases()[0].delete_protection);
        assert_eq!(
            platform.create_database("ws-1").await,
            Err(turso_refused("create the workspace database"))
        );

        assert_eq!(
            platform
                .mint_token("ws-1", "3d", AccessLevel::FullAccess)
                .await,
            Ok("token-for-ws-1-3d-full-access".to_string())
        );
        assert_eq!(
            platform
                .mint_token("ws-9", "3d", AccessLevel::FullAccess)
                .await,
            Err(turso_refused("mint a token for this workspace"))
        );

        platform.refuse_next(account_refused("mint a token for this workspace"));
        assert!(matches!(
            platform
                .mint_token("ws-1", "3d", AccessLevel::ReadOnly)
                .await,
            Err(crate::error::Error::Refused {
                reason: crate::error::RefusalReason::TursoAccountRefused,
                ..
            })
        ));
        assert_eq!(platform.minted().len(), 1, "a refused mint minted nothing");

        platform.holding_unprotected("org-1");
        assert!(!platform.databases()[1].delete_protection);
        platform
            .protect_database("org-1")
            .await
            .expect("the protect failed");
        assert!(platform.databases()[1].delete_protection);
        // a name never seen is the MCP server's database arriving, and it arrives protected.
        platform
            .protect_database("org-9")
            .await
            .expect("an unseen database was refused");
        assert!(platform.databases()[2].delete_protection);

        platform
            .delete_database("ws-1", DeletionIntent::WorkspaceDeletedByHuman)
            .await
            .expect("the delete failed");

        assert_eq!(platform.databases().len(), 2);
        assert_eq!(
            platform.deleted(),
            vec![("ws-1".to_string(), DeletionIntent::WorkspaceDeletedByHuman)]
        );
    }
}
