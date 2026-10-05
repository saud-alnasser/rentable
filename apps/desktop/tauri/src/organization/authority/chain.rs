//! the walk from a row's certificate to the pinned key, and the judgement of the row at its end:
//! what a certificate covers, and the one verifier that answers for a row.

use std::{
    cell::{OnceCell, RefCell},
    collections::{HashMap, HashSet},
};

use ed25519_dalek::{Signature, VerifyingKey};

use crate::{error::Error, turso::platform::AccessLevel};

use super::{
    ABOVE_ITS_ISSUERS_CEILING, Authority, BEYOND_ITS_CERTIFICATE, CYCLE, Certificate,
    FORGED_BY_ISSUER, FORGED_CERTIFICATE, FORGED_ROW, ISSUER_ADMINISTERS_NOBODY, MAXIMUM_DEPTH,
    MemberAuthority, NOT_BELOW_ITS_ISSUER, REVOKED_CERTIFICATE, Revocation, TOO_DEEP,
    UNKNOWN_ISSUER, VERIFYING_KEY_BYTES, certificate_preimage, preimage, revocation_preimage,
};
use crate::organization::role::permission::{self, Flag, MEMBER_ADMINISTRATION, OWNER_ROLE};

/// What a reader makes of a member row whose signature and chain verify ([`Chain::read_member`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reading {
    /// Its certificate covers it: it grants what its role and its override give.
    Covered,
    /// Its certificate may sign rows like it and no longer covers this one, because the role it
    /// names has moved to or above the certificate's rank or stands no more, or the member it is
    /// about is certified at or above it: it grants nothing, its content is never carried forward
    /// as authority, and it is removed rather than saved.
    Uncovered,
}

/// Whether a certificate may sign a row of this kind: the row-kind table (effort 838, the plan's
/// *Architecture*, as corrected at the review and again on the human's decision after it).
///
/// | Row | The signing certificate must |
/// | --- | --- |
/// | `member` | hold a flag that administers members, outrank the role the row names and every live certificate the member holds, hold every flag the row's override switches, and not be the row's own member's; or be the root |
/// | `role` | hold `manageRoles`, outrank the role, and hold every flag its mask carries |
/// | `grant` | hold `grantWorkspace`; a read-only grant, be the root |
/// | `workspace` | hold `renameWorkspace` or `grantWorkspace` |
/// | `invitation` | hold `inviteMember` or `resetPassword` |
/// | `mark` | hold `manageMark` |
/// | `organization_name` | be the root: the owner, which no flag stands for (effort 851, requirement 29) |
/// | `workspace_override` | pin record flags alone and grant none it does not pin, be about a member who is in and is not the certificate's own, and hold `overrideMember`, outrank that member as a member row's signer does, and hold every flag it pins; or be the root |
///
/// Certificates and revocations are judged by the walk, and a succession by the organization key,
/// so neither is here. **The root is not waved through** except where the table says so: it holds
/// every flag and outranks every rank, so it passes every row on its own terms.
///
/// **A row gives nobody more than its signer chose within their ceiling.** A member row's signer
/// chooses two things, the role and the override, and the role's mask is vouched for by the role
/// row's own signer and bounded by theirs; so the override sits inside the member row's signer's
/// ceiling, and a role row's mask inside its signer's. A member holding the database's credential
/// cannot sign a wider override onto anybody, and a manager cannot sign a role carrying a flag
/// they lack. **And a delegated certificate never signs its own member's row**, so nobody widens
/// themselves, and no later re-issue reads a width back off a row its holder wrote (requirement
/// 7, criterion 9). Giving somebody a role wider than oneself is refused at the command, where
/// requirement 7's "only flags you hold" is asked. *The table bounded a member row by its whole
/// effective permissions until review round two found that it judged the row by the role's mask
/// as it stands now, so the owner widening the member role on one machine while a lead invited on
/// another refused every member read on both.*
///
/// **A member row naming the owner's role is the root's, about its own holder, with no override**
/// (requirements 3, 5 and 6): the owner's role is held by exactly one member, and nobody else signs
/// it onto a row, the owner's own included.
///
/// **Outranking the member is outranking them as they are certified, too.** The rank a member
/// row's signer stands above is the higher of the role the row names and every live certificate
/// the member holds, so nobody below a member writes them a lower role: a lead holding the
/// credential who signs the owner's row, or a manager's, naming the member role is refused, where
/// judging the named role alone read the demotion back as a member. A member holding no live
/// certificate, removed or not yet certified, is judged by the named role alone. *The review of
/// effort 838, round two, found the named role alone was all a reader asked.*
///
/// `standing_of_role` answers for a role id with its `(mask, rank)`: the verified role row's for
/// any role but the owner's, and `None` for a role nobody holds, which covers nothing. Only the
/// rank is read. `certified_rank_of` answers for a member id with the highest rank of the live
/// certificates they hold, and `None` for a member who holds none. `rank_of_member` answers for a
/// member id with the rank of the role their verified row names, and `None` for a member who is
/// not in, removed or granted nothing by their row: only a workspace override reads it.
///
/// **A workspace override is judged as the override on a member row is** (effort 838, requirement
/// 12 as amended a third time): its signer outranks the member, as they stand by their role and as
/// they are certified, holds `overrideMember` and every flag it pins, and is not the member. It
/// pins record flags alone and grants none it does not pin, whoever signs it, the root included,
/// and it is about a member who is in: a row about anybody else grants nothing and is covered by
/// nobody.
pub fn covers(
    certificate: &Certificate,
    authority: Authority<'_>,
    standing_of_role: impl Fn(&str) -> Option<(i64, i64)>,
    certified_rank_of: impl Fn(&str) -> Option<i64>,
    rank_of_member: impl Fn(&str) -> Option<i64>,
) -> bool {
    let holds = |flag: Flag| permission::permits(certificate.ceiling, flag);
    let holds_any = |flags: &[Flag]| flags.iter().any(|flag| holds(*flag));

    match authority {
        Authority::Member(member) => {
            covers_whatever_its_role_stands_at(certificate, member)
                && (member.role_id == permission::OWNER
                    || standing_of_role(member.role_id).is_some_and(|(_, rank)| {
                        certificate.is_root()
                            || (certificate.rank > rank
                                && certified_rank_of(member.id)
                                    .is_none_or(|certified| certificate.rank > certified))
                    }))
        }
        Authority::Role(role) => {
            holds(Flag::ManageRoles)
                && certificate.rank > role.rank
                && role.mask & !certificate.ceiling == 0
        }
        Authority::Grant(grant) => {
            if AccessLevel::parse(grant.access_level) == Some(AccessLevel::FullAccess) {
                holds(Flag::GrantWorkspace)
            } else {
                certificate.is_root()
            }
        }
        Authority::Workspace(_) => holds_any(&[Flag::RenameWorkspace, Flag::GrantWorkspace]),
        Authority::Invitation(_) => holds_any(&[Flag::InviteMember, Flag::ResetPassword]),
        Authority::Mark(_) => holds(Flag::ManageMark),
        Authority::OrganizationName { .. } => certificate.is_root(),
        Authority::WorkspaceOverride(workspace_override) => {
            permission::first_beyond_records(workspace_override.pinned).is_none()
                && workspace_override.granted & !workspace_override.pinned == 0
                && certificate.member_id != workspace_override.member_id
                && (certificate.is_root()
                    || (holds(Flag::OverrideMember)
                        && workspace_override.pinned & !certificate.ceiling == 0))
                && rank_of_member(workspace_override.member_id).is_some_and(|rank| {
                    certificate.is_root()
                        || (certificate.rank > rank
                            && certified_rank_of(workspace_override.member_id)
                                .is_none_or(|certified| certificate.rank > certified))
                })
        }
    }
}

/// The half of [`covers`] for a member row that the row and the certificate settle between them,
/// whatever the role it names stands at now: the owner's role the root's about its holder with no
/// override, and any other a flag that administers members, every flag the override switches, and
/// not the certificate's own member's row; or the root.
///
/// **What a row fails here it fails for good**, since nothing another machine does changes it; a
/// row that passes here and fails [`covers`] fails on rank alone: the role it names moved above
/// its signer or went, or the member it is about stands certified at or above the signer, which
/// a role moved or a certificate re-issued on another machine changes under it. That is the row a
/// reader grants nothing rather than refusing ([`Chain::read_member`]), and never grants the role
/// it names.
fn covers_whatever_its_role_stands_at(
    certificate: &Certificate,
    member: MemberAuthority<'_>,
) -> bool {
    if member.role_id == permission::OWNER {
        return certificate.is_root()
            && certificate.member_id == member.id
            && member.override_mask == 0
            && member.removed_at.is_none();
    }

    certificate.is_root()
        || (MEMBER_ADMINISTRATION
            .iter()
            .any(|flag| permission::permits(certificate.ceiling, *flag))
            && member.override_mask & !certificate.ceiling == 0
            && certificate.member_id != member.id)
}

/// What a certificate needs to sign a row like this one, as a refusal names it: the act that is
/// refused because the actor could not sign or re-sign a row names this (effort 838).
pub fn needed_for(authority: Authority<'_>) -> &'static str {
    match authority {
        Authority::Member(member) if member.role_id == permission::OWNER => {
            "the owner's own certificate"
        }
        Authority::Member(_) => {
            "a flag that administers members, a rank above the member, every flag their override \
             switches, and not to be the member's own"
        }
        Authority::Role(_) => "manageRoles, a rank above the role, and every flag the role carries",
        Authority::Grant(grant)
            if AccessLevel::parse(grant.access_level) == Some(AccessLevel::FullAccess) =>
        {
            "grantWorkspace"
        }
        Authority::Grant(_) => "the owner's certificate, for a read-only grant",
        Authority::Workspace(_) => "renameWorkspace or grantWorkspace",
        Authority::Invitation(_) => "inviteMember or resetPassword",
        Authority::Mark(_) => "manageMark",
        Authority::OrganizationName { .. } => "the owner's certificate",
        Authority::WorkspaceOverride(_) => {
            "overrideMember, a rank above the member, every flag the override pins, record flags \
             alone, and not to be the member's own"
        }
    }
}

/// The certificates and revocations one read judges its rows by, against the key the caller
/// pinned.
///
/// **Built once per read and dropped with it**, so a walk is made once per certificate however
/// many rows name it, and no answer outlives the rows it was computed from.
///
/// `organization_verifying_key` is an input because it has to be. It arrives pinned in the join
/// link and is stored on the machine; reading it out of the database being verified would let
/// whoever rewrote the rows rewrite the key that judges them, and every signature would check out.
pub struct Chain<'a> {
    organization_verifying_key: &'a [u8; VERIFYING_KEY_BYTES],
    certificates: HashMap<&'a str, &'a Certificate>,
    revocations: &'a [Revocation],
    roles: HashMap<String, (i64, i64)>,
    members: HashMap<String, i64>,
    walked: RefCell<HashMap<String, Result<(), Error>>>,
    revoked: OnceCell<HashSet<String>>,
}

impl<'a> Chain<'a> {
    /// The chain one read judges by: the key the caller pinned, and every certificate and
    /// revocation the replica holds, read raw. Nothing is walked until a row asks.
    pub fn new(
        organization_verifying_key: &'a [u8; VERIFYING_KEY_BYTES],
        certificates: &'a [Certificate],
        revocations: &'a [Revocation],
    ) -> Self {
        Self {
            organization_verifying_key,
            certificates: certificates
                .iter()
                .map(|certificate| (certificate.id.as_str(), certificate))
                .collect(),
            revocations,
            roles: HashMap::new(),
            members: HashMap::new(),
            walked: RefCell::new(HashMap::new()),
            revoked: OnceCell::new(),
        }
    }

    /// The same chain, knowing each role's mask and rank, as `(mask, rank)` by id: what a member
    /// row is judged by, since whom it is about stands at its role's rank, and a row naming a role
    /// that does not stand is covered by nobody. The mask judges no member row (its role row's
    /// signer vouched for it), and is here beside the rank because it is what a reader holds of a
    /// role. The standings are the caller's to have verified, from the role rows this chain judged
    /// first; the owner's is a constant and needs no row.
    pub fn with_roles(mut self, roles: HashMap<String, (i64, i64)>) -> Self {
        self.roles = roles;
        self
    }

    /// The same chain, knowing the rank each member in stands at by the role their verified row
    /// names, by id: what a workspace override is judged by, since whom it is about stands there
    /// (effort 838, requirement 12 as amended a third time). The ranks are the caller's to have
    /// read from member rows this chain judged; a member removed, or whose row grants nothing, is
    /// left out, and a workspace override about them is covered by nobody.
    pub fn with_members(mut self, members: HashMap<String, i64>) -> Self {
        self.members = members;
        self
    }

    /// The rank a member in stands at by their role, where the chain knows it.
    pub fn rank_of_member(&self, member_id: &str) -> Option<i64> {
        self.members.get(member_id).copied()
    }

    /// The mask and the rank of a role, where the chain knows it.
    pub fn standing_of_role(&self, role_id: &str) -> Option<(i64, i64)> {
        if role_id == permission::OWNER {
            Some((OWNER_ROLE.mask, OWNER_ROLE.rank))
        } else {
            self.roles.get(role_id).copied()
        }
    }

    /// Whether a certificate may sign this row, by the row-kind table, the roles this chain knows
    /// and the live certificates it holds ([`covers`]).
    pub fn covers(&self, certificate: &Certificate, authority: Authority<'_>) -> bool {
        covers(
            certificate,
            authority,
            |role_id| self.standing_of_role(role_id),
            |member_id| self.certified_rank_of(member_id),
            |member_id| self.rank_of_member(member_id),
        )
    }

    /// The highest rank a member stands at as certified: of every live certificate they hold, and
    /// `None` where they hold none.
    pub fn certified_rank_of(&self, member_id: &str) -> Option<i64> {
        self.live_certificates_of(member_id)
            .iter()
            .map(|certificate| certificate.rank)
            .max()
    }

    /// Verifies a row against the chain: `Ok` where [`Chain::judge`] finds it covered, and a
    /// refusal for anything else.
    pub fn verify(
        &self,
        certificate_id: &str,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        match self.judge(certificate_id, authority, signature)? {
            Reading::Covered => Ok(()),
            Reading::Uncovered => Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            }),
        }
    }

    /// Reads a member row against the chain: [`Reading::Covered`] where [`Chain::verify`] would
    /// accept it, [`Reading::Uncovered`] for a genuine row its certificate stopped covering, and a
    /// refusal for anything else (effort 838, the human's decision after review round two).
    ///
    /// **A member row alone reads uncovered**, because it alone is judged by rows another machine
    /// changes: the rank of the role it names, and whether that role still stands. A role moved
    /// above the row's signer, or deleted, on another machine while this one wrote the row leaves
    /// a genuine row nobody forged, and refusing it would refuse the directory to everybody with
    /// no act in the application able to repair it. So the reader grants it nothing instead, and
    /// the commands refuse every act on the member but their removal
    /// (`session::refuse_unsettled`), since nothing says which of its fields are genuine.
    /// Everything the row and
    /// its certificate settle between them is asked as [`Chain::verify`] asks it: a forged row, a
    /// broken or revoked walk, an override wider than the ceiling, the certificate's own member's
    /// row and the owner's role signed by anybody but the root about its holder are refused.
    pub fn read_member(
        &self,
        certificate_id: &str,
        member: MemberAuthority<'_>,
        signature: &[u8],
    ) -> Result<Reading, Error> {
        self.judge(certificate_id, Authority::Member(member), signature)
    }

    /// Judges a row against the chain. **The only place a row's signature is checked.**
    ///
    /// Four checks, in this order and with no path to a reading that misses one: the row's own
    /// signature, the walk from its certificate to the pinned key, that nothing on that walk has
    /// been revoked, and that the certificate may sign a row of this kind ([`covers`]). The last
    /// reads [`Reading::Uncovered`] for a member row whose only failure is its role's standing
    /// ([`Chain::read_member`]) and refuses every other row that fails it.
    fn judge(
        &self,
        certificate_id: &str,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<Reading, Error> {
        let certificate = self.find(certificate_id)?;

        // 1. the row, against the key its certificate names.
        verify_signature(
            &certificate.signing_public_key,
            &preimage(&certificate.id, authority),
            signature,
            FORGED_ROW,
        )?;

        // 2 and 3. that certificate, walked to the pinned key, and unrevoked all the way up.
        self.live(certificate_id)?;

        // 4. and that it is a certificate for this row. Last, and the only readings in this
        //    function are below it.
        if self.covers(certificate, authority) {
            return Ok(Reading::Covered);
        }

        match authority {
            Authority::Member(member)
                if covers_whatever_its_role_stands_at(certificate, member) =>
            {
                Ok(Reading::Uncovered)
            }
            _ => Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            }),
        }
    }

    /// Whether the pinned key signed a root among these certificates, revoked or not: what only an
    /// organization of this format holds, since nothing but the holder of that key writes one
    /// (effort 838, ticket 25, where the owner's upgrade asks it before transforming anything).
    pub fn holds_a_root(&self) -> bool {
        self.certificates
            .values()
            .any(|certificate| certificate.is_root() && self.walk(&certificate.id).is_ok())
    }

    /// A certificate that walks to the pinned key and that nothing has revoked: what a row is
    /// signed under, and what a member signs and issues with.
    pub fn live(&self, certificate_id: &str) -> Result<&'a Certificate, Error> {
        let certificate = self.walk(certificate_id)?;
        let revoked = self.revoked();
        let mut current = certificate;

        // the walk has already bounded this path and refused a cycle on it.
        loop {
            if revoked.contains(&current.id) {
                return Err(Error::Integrity {
                    message: REVOKED_CERTIFICATE.to_string(),
                });
            }

            match &current.issuer_certificate_id {
                Some(issuer) => current = self.find(issuer)?,
                None => return Ok(certificate),
            }
        }
    }

    /// The live certificate a member signs with under this key, the newest where a half-written
    /// re-issue left two.
    pub fn live_certificate_of(
        &self,
        member_id: &str,
        signing_public_key: &[u8; VERIFYING_KEY_BYTES],
    ) -> Option<&'a Certificate> {
        self.certificates
            .values()
            .copied()
            .filter(|certificate| {
                certificate.member_id == member_id
                    && &certificate.signing_public_key == signing_public_key
                    && self.live(&certificate.id).is_ok()
            })
            .max_by(|one, other| {
                issued_at_order(&one.issued_at, &other.issued_at)
                    .then_with(|| one.id.cmp(&other.id))
            })
    }

    /// Every certificate a member holds that is live, whatever key it names.
    pub fn live_certificates_of(&self, member_id: &str) -> Vec<&'a Certificate> {
        let mut live: Vec<&Certificate> = self
            .certificates
            .values()
            .copied()
            .filter(|certificate| {
                certificate.member_id == member_id && self.live(&certificate.id).is_ok()
            })
            .collect();

        live.sort_by(|one, other| one.id.cmp(&other.id));

        live
    }

    /// The certificate a row or a link names, or the refusal for one nobody issued.
    fn find(&self, id: &str) -> Result<&'a Certificate, Error> {
        self.certificates
            .get(id)
            .copied()
            .ok_or_else(|| Error::Integrity {
                message: format!("the certificate {id} was issued by nobody"),
            })
    }

    /// The walk from one certificate to the pinned key, without asking about revocations: every
    /// link's signature and every link inside its issuer.
    ///
    /// **What a revocation's revoker is judged by**, as well as the first half of [`Chain::live`].
    /// Remembered per certificate for the life of the read.
    fn walk(&self, certificate_id: &str) -> Result<&'a Certificate, Error> {
        if let Some(verdict) = self.walked.borrow().get(certificate_id) {
            return match verdict {
                Ok(()) => self.find(certificate_id),
                Err(error) => Err(error.clone()),
            };
        }

        let verdict = self.walk_uncached(certificate_id);

        self.walked.borrow_mut().insert(
            certificate_id.to_string(),
            verdict.as_ref().map(|_| ()).map_err(Clone::clone),
        );

        verdict
    }

    fn walk_uncached(&self, certificate_id: &str) -> Result<&'a Certificate, Error> {
        let refuse = |message: &str| Error::Integrity {
            message: message.to_string(),
        };
        let certificate = self.find(certificate_id)?;
        let mut current = certificate;
        let mut seen = HashSet::new();

        loop {
            if !seen.insert(current.id.as_str()) {
                return Err(refuse(CYCLE));
            }

            if seen.len() > MAXIMUM_DEPTH {
                return Err(refuse(TOO_DEEP));
            }

            let Some(issuer_id) = &current.issuer_certificate_id else {
                // the root: the one certificate the pinned key signs.
                verify_signature(
                    self.organization_verifying_key,
                    &certificate_preimage(current),
                    &current.signature,
                    FORGED_CERTIFICATE,
                )?;

                return Ok(certificate);
            };

            let issuer = self
                .certificates
                .get(issuer_id.as_str())
                .copied()
                .ok_or_else(|| refuse(UNKNOWN_ISSUER))?;

            verify_signature(
                &issuer.signing_public_key,
                &certificate_preimage(current),
                &current.signature,
                FORGED_BY_ISSUER,
            )?;

            if let Some(refusal) = link_refusal(issuer, current) {
                return Err(refuse(refusal));
            }

            current = issuer;
        }
    }

    /// The certificates a revocation that verifies names.
    ///
    /// **A revocation counts when its revoker walks to the pinned key, signed it, and is the root
    /// or outranks what it revokes.** Whether the revoker has since been revoked is not asked:
    /// removing a manager would otherwise reinstate every certificate they retired, the old ones
    /// of everybody they narrowed included. What that leaves a revoked manager able to do is
    /// revoke somebody below them, which takes nothing a holder of the credential cannot already
    /// take by deleting a row.
    ///
    /// **One that does not verify is passed over, not refused.** It is a row anybody could have
    /// written, and it revokes nothing; refusing the read on it would let any member stop the
    /// directory being read by writing one.
    fn revoked(&self) -> &HashSet<String> {
        self.revoked.get_or_init(|| {
            self.revocations
                .iter()
                .filter(|revocation| self.revocation_counts(revocation))
                .map(|revocation| revocation.certificate_id.clone())
                .collect()
        })
    }

    fn revocation_counts(&self, revocation: &Revocation) -> bool {
        let (Ok(revoker), Some(revoked)) = (
            self.walk(&revocation.revoker_certificate_id),
            self.certificates
                .get(revocation.certificate_id.as_str())
                .copied(),
        ) else {
            return false;
        };

        verify_signature(
            &revoker.signing_public_key,
            &revocation_preimage(revocation),
            &revocation.signature,
            REVOKED_CERTIFICATE,
        )
        .is_ok()
            && (revoker.is_root() || revoker.rank > revoked.rank)
    }
}

/// Whether one certificate sits inside the one that issued it, and the refusal where it does not.
///
/// The three checks of a link that are not a signature: the ceiling within the issuer's, the rank
/// below it, and the issuer holding a flag that administers members. Shared by the issue and the
/// walk, so a certificate is refused on the way in for exactly what a reader refuses it for.
pub(super) fn link_refusal(
    issuer: &Certificate,
    certificate: &Certificate,
) -> Option<&'static str> {
    if certificate.ceiling & !issuer.ceiling != 0 {
        return Some(ABOVE_ITS_ISSUERS_CEILING);
    }

    if certificate.rank >= issuer.rank {
        return Some(NOT_BELOW_ITS_ISSUER);
    }

    if !MEMBER_ADMINISTRATION
        .iter()
        .any(|flag| permission::permits(issuer.ceiling, *flag))
    {
        return Some(ISSUER_ADMINISTERS_NOBODY);
    }

    None
}

/// Orders two issue times. They are milliseconds written as text, so a longer one is later; two
/// of one length compare as they read.
fn issued_at_order(one: &str, other: &str) -> std::cmp::Ordering {
    one.len().cmp(&other.len()).then_with(|| one.cmp(other))
}

/// One signature check. Private, and it stays private: a caller able to reach this
/// could check a row and skip the certificate, which is the whole failure mode
/// this module is shaped to prevent.
pub(super) fn verify_signature(
    verifying_key: &[u8; VERIFYING_KEY_BYTES],
    message: &[u8],
    signature: &[u8],
    refusal: &str,
) -> Result<(), Error> {
    let refuse = || Error::Integrity {
        message: refusal.to_string(),
    };

    let verifying_key = VerifyingKey::from_bytes(verifying_key).map_err(|_| refuse())?;
    let signature = Signature::from_slice(signature).map_err(|_| refuse())?;

    // `verify_strict` rather than `verify`: it refuses a small-order key and a
    // non-canonical point, so one signature has one verdict everywhere rather than
    // a verdict that depends on which implementation asked.
    verifying_key
        .verify_strict(message, &signature)
        .map_err(|_| refuse())
}

// format 1: what an organization made before effort 838 signed, read once by the upgrade

/// An `administrator_certificate` row, as an organization of format 1 carries it (effort 838,
/// ticket 22): signed by the organization key every time, and revoked by a column nobody signed.
///
/// **Read by the upgrade and by nothing else.** An organization of this format is upgraded by its
/// owner's machine before anything else reads it (`upgrade/format/chain/`), and what the
/// upgrade needs from these rows is which of the rows they sign are genuine; the certificates
/// themselves are not carried. Here rather than beside that format's verifier
/// (`upgrade/format/signature.rs`) because the store reads it off format 1's table, and the store
/// names nothing of `upgrade`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FormatOneCertificate {
    pub id: String,
    pub member_id: String,
    pub signing_public_key: [u8; VERIFYING_KEY_BYTES],
    pub signature_by_organization_key: Vec<u8>,
    pub issued_at: String,
    /// unsigned, so a null here proves nothing; set, it retires the certificate as it did then.
    pub revoked_at: Option<String>,
}

/// A row of an organization of an older format, judged as that format judged one: its signature
/// against the key its certificate names, that certificate's signature against the key the caller
/// pinned, and the certificate not revoked, in that order. Each pair is what was signed and the
/// signature over it, built by the older format's own verifier (`upgrade/format/signature.rs`,
/// [`verify_format_one`](crate::upgrade::format::signature::verify_format_one)), which is the one
/// caller.
///
/// **One call, so the certificate behind a row cannot be skipped.** That is why this is reachable
/// from outside this module and [`verify_signature`] is not: a caller of this checks the row and
/// its certificate together, or checks nothing.
pub(crate) fn verify_older_row(
    organization_verifying_key: &[u8; VERIFYING_KEY_BYTES],
    certificate_signing_key: &[u8; VERIFYING_KEY_BYTES],
    (row_preimage, row_signature): (&[u8], &[u8]),
    (certificate_preimage, certificate_signature): (&[u8], &[u8]),
    revoked: bool,
) -> Result<(), Error> {
    verify_signature(
        certificate_signing_key,
        row_preimage,
        row_signature,
        FORGED_ROW,
    )?;
    verify_signature(
        organization_verifying_key,
        certificate_preimage,
        certificate_signature,
        FORGED_CERTIFICATE,
    )?;

    if revoked {
        return Err(Error::Integrity {
            message: REVOKED_CERTIFICATE.to_string(),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::Error;
    use crate::organization::authority::*;
    use crate::organization::authority::{
        ABOVE_ITS_ISSUERS_CEILING, AdministratorKey, Authority, BEYOND_ITS_CERTIFICATE, CYCLE,
        Certificate, FORGED_BY_ISSUER, FORGED_CERTIFICATE, FORGED_ROW, ISSUER_ADMINISTERS_NOBODY,
        InvitationAuthority, Issue, MAXIMUM_DEPTH, MarkAuthority, MemberAuthority,
        NOT_BELOW_ITS_ISSUER, REVOKED_CERTIFICATE, Revocation, SIGNATURE_BYTES, TOO_DEEP,
        UNKNOWN_ISSUER, WorkspaceOverrideAuthority, certificate_preimage, issue_certificate,
        revocation_preimage, revoke, sign,
    };
    use crate::organization::role::permission::{self, MANAGER_ROLE, MEMBER_ROLE, mask_of};
    use ed25519_dalek::Signer;
    use std::collections::HashMap;

    fn hex(text: &str) -> Vec<u8> {
        assert!(text.len().is_multiple_of(2), "odd-length hex: {text}");

        (0..text.len() / 2)
            .map(|index| {
                u8::from_str_radix(&text[index * 2..index * 2 + 2], 16)
                    .unwrap_or_else(|_| panic!("not hex: {text}"))
            })
            .collect()
    }

    const CHECKED_IN_MEMBER_ID: &str = "member-1";

    const CHECKED_IN_MEMBER_PUBLIC_KEY: &str =
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

    const CHECKED_IN_DATABASE_NAME: &str = "rentable-acme-ledger";

    const CHECKED_IN_DATABASE_HOSTNAME: &str = "acme-ledger-rentable.aws-eu-west-1.turso.io";

    const CHECKED_IN_SEALED_CREDENTIAL: &str = "a1b2c3d4";

    const CHECKED_IN_WORKSPACE_ID: &str = "workspace-1";

    const CHECKED_IN_ACCESS_LEVEL: &str = "full-access";

    const CHECKED_IN_EXPIRES_AT: &str = "2026-09-30T00:00:00Z";

    /// An override switching `inviteMember`, `removeMember` and `assignRole`, bits 0, 1 and 2.
    /// Written out rather than imported, because this module signs whatever the column holds and
    /// never reads it.
    const CHECKED_IN_OVERRIDE: i64 = 7;

    /// The signing key a member row names. It is the administrator key above, because that is
    /// what the column holds: a certificate names the key the member derives from their own
    /// vault secret, and the row carries its verifying half so there is something to certify
    /// (effort 826, requirement 6).
    fn member_authority<'a>(public_key: &'a [u8], role_id: &'a str) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            id: CHECKED_IN_MEMBER_ID,
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id,
            override_mask: CHECKED_IN_OVERRIDE,
            removed_at: None,
            owner_seed_sealed: None,
        })
    }

    fn role_authority<'a>(name_sealed: &'a [u8], mask: i64, rank: i64) -> Authority<'a> {
        Authority::Role(RoleAuthority {
            id: "role-1",
            kind: "custom",
            name_sealed,
            mask,
            rank,
        })
    }

    fn workspace_authority<'a>(
        database_name: &'a str,
        database_hostname: &'a str,
    ) -> Authority<'a> {
        Authority::Workspace(WorkspaceAuthority {
            database_name,
            database_hostname,
        })
    }

    fn grant_authority(sealed_credential: &[u8]) -> Authority<'_> {
        grant_authority_at(sealed_credential, CHECKED_IN_ACCESS_LEVEL)
    }

    fn grant_authority_at<'a>(sealed_credential: &'a [u8], access_level: &'a str) -> Authority<'a> {
        Authority::Grant(GrantAuthority {
            member_id: CHECKED_IN_MEMBER_ID,
            workspace_id: CHECKED_IN_WORKSPACE_ID,
            sealed_credential,
            access_level,
            credential_expires_at: Some(CHECKED_IN_EXPIRES_AT),
        })
    }

    fn checked_in_member_public_key() -> Vec<u8> {
        hex(CHECKED_IN_MEMBER_PUBLIC_KEY)
    }

    /// The verifying half of the key the checked-in member signs with, as the row holds it.
    /// Drawn once here so every vector and every rewrite below names the same bytes.
    static CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY: &[u8] = &[
        0x3d, 0x40, 0x17, 0xc3, 0xe8, 0x43, 0x89, 0x5a, 0x92, 0xb7, 0x0a, 0xa7, 0x4d, 0x1b, 0x7e,
        0xbc, 0x9c, 0x98, 0x2c, 0xcf, 0x2e, 0xc4, 0x96, 0x8c, 0xc0, 0xcd, 0x55, 0xf1, 0x2a, 0xf4,
        0x66, 0x0c,
    ];

    /// One organization: its key, the owner's signing key, and the root that joins them. Drawn
    /// rather than checked in, so a test using it exercises the chain and not a vector.
    struct Organization {
        verifying_key: [u8; VERIFYING_KEY_BYTES],
        administrator_key: AdministratorKey,
        certificate: Certificate,
    }

    fn an_organization() -> Organization {
        an_organization_rooted_at("certificate-a")
    }

    /// The same, with the root under an id of the caller's choosing, for a test that holds two
    /// organizations' certificates in one chain.
    fn an_organization_rooted_at(root_id: &str) -> Organization {
        let organization_key = OrganizationKey::generate().expect("failed to generate");
        let administrator_key = AdministratorKey::generate().expect("failed to generate");
        let certificate = issue_root_certificate(
            &organization_key,
            root_id,
            "member-a",
            &administrator_key.verifying_key(),
            "2026-08-30T09:00:00Z",
        );

        Organization {
            verifying_key: organization_key.verifying_key(),
            administrator_key,
            certificate,
        }
    }

    /// A certificate `issuer` issues to a fresh key, and that key.
    fn delegate(
        issuer_key: &AdministratorKey,
        issuer: &Certificate,
        id: &str,
        ceiling: i64,
        rank: i64,
    ) -> (AdministratorKey, Certificate) {
        let key = AdministratorKey::generate().expect("failed to generate");
        let certificate = issue_certificate(
            issuer_key,
            issuer,
            Issue {
                id,
                member_id: &format!("member-{id}"),
                signing_public_key: &key.verifying_key(),
                ceiling,
                rank,
                issued_at: "2026-08-31T09:00:00Z",
            },
        )
        .expect("failed to issue");

        (key, certificate)
    }

    /// The masks and the ranks of the two built-in roles that are rows, as a reader holds them
    /// once it has verified the role rows.
    fn built_in_roles() -> HashMap<String, (i64, i64)> {
        HashMap::from([
            (
                permission::MANAGER.to_string(),
                (MANAGER_ROLE.mask, MANAGER_ROLE.rank),
            ),
            (
                permission::MEMBER.to_string(),
                (MEMBER_ROLE.mask, MEMBER_ROLE.rank),
            ),
        ])
    }

    /// A row's verdict against the chain these certificates and revocations make.
    fn verify(
        verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificates: &[Certificate],
        revocations: &[Revocation],
        certificate: &Certificate,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        Chain::new(verifying_key, certificates, revocations)
            .with_roles(built_in_roles())
            .verify(&certificate.id, authority, signature)
    }

    /// The same, for a row signed under the root and nothing else in the chain.
    fn verify_under(
        verifying_key: &[u8; VERIFYING_KEY_BYTES],
        certificate: &Certificate,
        authority: Authority<'_>,
        signature: &[u8],
    ) -> Result<(), Error> {
        verify(
            verifying_key,
            std::slice::from_ref(certificate),
            &[],
            certificate,
            authority,
            signature,
        )
    }

    /// The owner's own row: the owner's role, no override, and the id of the member the root
    /// names.
    fn owner_authority<'a>(id: &'a str, public_key: &'a [u8]) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            id,
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id: permission::OWNER,
            override_mask: 0,
            removed_at: None,
            owner_seed_sealed: None,
        })
    }

    fn invitation_authority() -> Authority<'static> {
        Authority::Invitation(InvitationAuthority {
            id: "invitation-1",
            member_id: CHECKED_IN_MEMBER_ID,
            expires_at: 1_757_000_000_000,
        })
    }

    fn mark_authority(image_sealed: &[u8]) -> Authority<'_> {
        Authority::Mark(MarkAuthority {
            image_sealed,
            media_type: "image/png",
            updated_by: CHECKED_IN_MEMBER_ID,
            updated_at: 1_757_000_000_000,
        })
    }

    /// A certificate signed by `signer` over whatever fields it is given: what somebody holding
    /// the credential writes around every check the issue makes.
    fn forged(signer: &AdministratorKey, certificate: Certificate) -> Certificate {
        Certificate {
            signature: signer
                .0
                .sign(&certificate_preimage(&certificate))
                .to_bytes()
                .to_vec(),
            ..certificate
        }
    }

    // a row the root signed verifies against the chain

    #[test]
    fn a_member_row_signed_by_the_root_verifies() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    #[test]
    fn a_workspace_row_and_a_grant_row_signed_by_the_root_verify() {
        let organization = an_organization();
        let sealed_credential = hex(CHECKED_IN_SEALED_CREDENTIAL);

        for authority in [
            workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
            grant_authority(&sealed_credential),
        ] {
            let signature = sign(
                &organization.administrator_key,
                &organization.certificate,
                authority,
            )
            .expect("failed to sign");

            assert_eq!(
                verify_under(
                    &organization.verifying_key,
                    &organization.certificate,
                    authority,
                    &signature
                ),
                Ok(()),
                "{authority:?}"
            );
        }
    }

    // the attack criterion 16 names, performed

    #[test]
    fn a_member_row_rewritten_by_another_member_is_rejected() {
        // exactly criterion 16. A member holds a full-access credential to the
        // organization database, so this row is theirs to write. All three fields
        // are here because forging any of them is the same attack wearing a
        // different field, and the one that matters is `role`.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let signed = member_authority(&public_key, "member");

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            signed,
        )
        .expect("failed to sign");

        // the member promotes themselves
        let promoted = member_authority(&public_key, "manager");
        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                promoted,
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            }),
            "a rewritten role was accepted"
        );

        // the member points the row at a key they hold the secret half of
        let their_own_key = hex(&"22".repeat(32));
        let taken_over = member_authority(&their_own_key, "member");
        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                taken_over,
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            }),
            "a rewritten public key was accepted"
        );

        // the member points the row at a different certificate, which is what
        // rewriting `certificate_id` does to whoever reads the row
        let elsewhere = an_organization();
        assert_eq!(
            verify_under(
                &elsewhere.verifying_key,
                &elsewhere.certificate,
                signed,
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            }),
            "a rewritten certificate id was accepted"
        );
    }

    // a revoked certificate, tested apart from a forged row

    #[test]
    fn a_row_signed_by_a_certificate_that_was_later_revoked_is_rejected() {
        // the failure mode the plan names by name: a client that verifies the row
        // and forgets the certificate accepts a revoked certificate. Every byte
        // of this row is genuine and it is still refused.
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");
        let signature = sign(&manager_key, &manager, authority).expect("failed to sign");
        let certificates = [organization.certificate.clone(), manager.clone()];
        let revocation = revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-08-30T12:00:00Z",
        )
        .expect("failed to revoke");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &manager,
                authority,
                &signature
            ),
            Ok(())
        );
        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[revocation],
                &manager,
                authority,
                &signature
            ),
            Err(Error::Integrity {
                message: REVOKED_CERTIFICATE.to_string(),
            })
        );
    }

    #[test]
    fn every_kind_of_row_is_rejected_under_a_revoked_certificate() {
        // one verifier, and no kind of row reaches an Ok without the revocation. A
        // second verifier written at a call site is what breaks this.
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let public_key = checked_in_member_public_key();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let certificates = [organization.certificate.clone(), manager.clone()];
        let revocations = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-08-30T12:00:00Z",
        )
        .expect("failed to revoke")];

        for authority in [
            member_authority(&public_key, "member"),
            role_authority(&sealed, 0, 1),
            workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
            grant_authority(&sealed),
            invitation_authority(),
            mark_authority(&sealed),
        ] {
            let signature = sign(&manager_key, &manager, authority).expect("failed to sign");

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &[],
                    &manager,
                    authority,
                    &signature
                ),
                Ok(()),
                "the manager could not sign {authority:?} to begin with"
            );
            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &revocations,
                    &manager,
                    authority,
                    &signature
                ),
                Err(Error::Integrity {
                    message: REVOKED_CERTIFICATE.to_string(),
                }),
                "a revoked certificate authorised {authority:?}"
            );
        }
    }

    // the organization's verifying key is an input, never a column

    #[test]
    fn a_database_re_signed_under_another_organization_key_is_still_rejected() {
        // the whole database is the attacker's to rewrite, `organization
        // .verifying_key` included. So they mint an organization key of their own,
        // issue themselves a root under it, and re-sign the row. A verifier that
        // read the key out of the database would accept every byte of this. The
        // one that was handed the key pinned from the join link does not.
        let genuine = an_organization();
        let theirs = an_organization();
        let public_key = checked_in_member_public_key();
        let promoted = member_authority(&public_key, "manager");
        let their_signature =
            sign(&theirs.administrator_key, &theirs.certificate, promoted).expect("failed to sign");

        // against the key they put in the database, everything checks out
        assert_eq!(
            verify_under(
                &theirs.verifying_key,
                &theirs.certificate,
                promoted,
                &their_signature
            ),
            Ok(()),
            "the rewritten chain was not internally consistent, so this proves nothing"
        );

        // against the key the machine holds, it does not
        assert_eq!(
            verify_under(
                &genuine.verifying_key,
                &theirs.certificate,
                promoted,
                &their_signature
            ),
            Err(Error::Integrity {
                message: FORGED_CERTIFICATE.to_string(),
            })
        );
    }

    #[test]
    fn a_row_signed_under_one_certificate_does_not_verify_under_another() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "manager");
        let renamed = Certificate {
            id: "certificate-b".to_string(),
            ..organization.certificate.clone()
        };

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify_under(&organization.verifying_key, &renamed, authority, &signature),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );
    }

    #[test]
    fn a_row_naming_a_certificate_nobody_issued_is_rejected() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            Chain::new(&organization.verifying_key, &[], &[]).verify(
                &organization.certificate.id,
                authority,
                &signature
            ),
            Err(Error::Integrity {
                message: "the certificate certificate-a was issued by nobody".to_string(),
            })
        );
    }

    // the walk (criterion 9, the chain's half): one test per check

    #[test]
    fn a_delegated_certificate_verifies_through_its_issuer_to_the_pinned_key() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (member_key, member) = delegate(
            &manager_key,
            &manager,
            "member",
            mask_of(&[Flag::InviteMember]),
            MEMBER_ROLE.rank + 1,
        );
        let certificates = [organization.certificate.clone(), manager, member.clone()];
        let authority = invitation_authority();
        let signature = sign(&member_key, &member, authority).expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &member,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    #[test]
    fn a_link_its_issuer_did_not_sign_is_refused() {
        let organization = an_organization();
        let (_, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let stranger = AdministratorKey::generate().expect("failed to generate");
        let signed_by_somebody_else = forged(&stranger, manager.clone());

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                &[organization.certificate.clone(), signed_by_somebody_else],
                &[]
            )
            .live(&manager.id)
            .err(),
            Some(Error::Integrity {
                message: FORGED_BY_ISSUER.to_string(),
            })
        );

        // and a root the pinned key did not sign
        let other = an_organization();

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                std::slice::from_ref(&other.certificate),
                &[]
            )
            .live(&other.certificate.id)
            .err(),
            Some(Error::Integrity {
                message: FORGED_CERTIFICATE.to_string(),
            })
        );
    }

    #[test]
    fn a_link_naming_an_issuer_nobody_holds_is_refused() {
        let organization = an_organization();
        let (_, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                std::slice::from_ref(&manager),
                &[]
            )
            .live(&manager.id)
            .err(),
            Some(Error::Integrity {
                message: UNKNOWN_ISSUER.to_string(),
            })
        );
    }

    #[test]
    fn a_certificate_under_a_revoked_issuer_reads_as_revoked() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (_, member) = delegate(
            &manager_key,
            &manager,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let certificates = [
            organization.certificate.clone(),
            manager.clone(),
            member.clone(),
        ];
        let revocations = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke")];
        let chain = Chain::new(&organization.verifying_key, &certificates, &revocations);

        assert_eq!(
            chain.live(&member.id).err(),
            Some(Error::Integrity {
                message: REVOKED_CERTIFICATE.to_string(),
            })
        );
        assert_eq!(
            chain
                .live(&organization.certificate.id)
                .map(|found| &found.id),
            Ok(&organization.certificate.id),
            "revoking the manager revoked the root"
        );
    }

    #[test]
    fn a_certificate_wider_than_its_issuer_is_refused() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        // the manager's ceiling lacks every owner flag, and this certificate names one.
        let wider = forged(
            &manager_key,
            Certificate {
                id: "wider".to_string(),
                member_id: "member-wider".to_string(),
                issuer_certificate_id: Some(manager.id.clone()),
                ceiling: mask_of(&[Flag::InviteMember, Flag::CreateWorkspace]),
                rank: 1,
                ..manager.clone()
            },
        );

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                &[organization.certificate.clone(), manager.clone(), wider],
                &[]
            )
            .live("wider")
            .err(),
            Some(Error::Integrity {
                message: ABOVE_ITS_ISSUERS_CEILING.to_string(),
            })
        );
        assert_eq!(
            issue_certificate(
                &manager_key,
                &manager,
                Issue {
                    id: "wider",
                    member_id: "member-wider",
                    signing_public_key: &manager.signing_public_key,
                    ceiling: mask_of(&[Flag::InviteMember, Flag::CreateWorkspace]),
                    rank: 1,
                    issued_at: "2026-09-01T00:00:00Z",
                }
            ),
            Err(Error::Integrity {
                message: ABOVE_ITS_ISSUERS_CEILING.to_string(),
            }),
            "the issue made a certificate the walk refuses"
        );
    }

    #[test]
    fn a_certificate_not_ranked_below_its_issuer_is_refused() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );

        for rank in [MANAGER_ROLE.rank, MANAGER_ROLE.rank + 1] {
            let level = forged(
                &manager_key,
                Certificate {
                    id: "level".to_string(),
                    member_id: "member-level".to_string(),
                    issuer_certificate_id: Some(manager.id.clone()),
                    ceiling: mask_of(&[Flag::InviteMember]),
                    rank,
                    ..manager.clone()
                },
            );

            assert_eq!(
                Chain::new(
                    &organization.verifying_key,
                    &[organization.certificate.clone(), manager.clone(), level],
                    &[]
                )
                .live("level")
                .err(),
                Some(Error::Integrity {
                    message: NOT_BELOW_ITS_ISSUER.to_string(),
                }),
                "rank {rank} under a manager was accepted"
            );
        }
    }

    #[test]
    fn a_certificate_issued_by_one_that_administers_nobody_is_refused() {
        let organization = an_organization();
        // a member who may create and edit records and administers nobody.
        let (member_key, member) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "member",
            MEMBER_ROLE.mask,
            10,
        );
        let below = forged(
            &member_key,
            Certificate {
                id: "below".to_string(),
                member_id: "member-below".to_string(),
                issuer_certificate_id: Some(member.id.clone()),
                ceiling: mask_of(&[Flag::ViewUnit]),
                rank: 1,
                ..member.clone()
            },
        );

        assert_eq!(
            Chain::new(
                &organization.verifying_key,
                &[organization.certificate.clone(), member, below],
                &[]
            )
            .live("below")
            .err(),
            Some(Error::Integrity {
                message: ISSUER_ADMINISTERS_NOBODY.to_string(),
            })
        );
    }

    #[test]
    fn a_chain_of_issuers_that_comes_back_on_itself_is_refused_and_ends() {
        // two certificates each naming the other as issuer, each signed by the other's key.
        // **A cycle cannot pass the rank check**, which strictly descends at every link, so this
        // is refused for rank before the cycle is seen; the cycle check stands behind it, so the
        // walk ends whichever check a future change removes.
        let organization = an_organization();
        let one_key = AdministratorKey::generate().expect("failed to generate");
        let other_key = AdministratorKey::generate().expect("failed to generate");
        let shape = |id: &str, issuer: &str, key: &AdministratorKey| Certificate {
            id: id.to_string(),
            member_id: format!("member-{id}"),
            signing_public_key: key.verifying_key(),
            issuer_certificate_id: Some(issuer.to_string()),
            ceiling: MANAGER_ROLE.mask,
            rank: 5,
            issued_at: "2026-09-01T00:00:00Z".to_string(),
            signature: Vec::new(),
        };
        let one = forged(&other_key, shape("one", "other", &one_key));
        let other = forged(&one_key, shape("other", "one", &other_key));
        let cycle = [one, other];
        let chain = Chain::new(&organization.verifying_key, &cycle, &[]);

        assert!(chain.live("one").is_err());
        assert!(
            [
                Error::Integrity {
                    message: NOT_BELOW_ITS_ISSUER.to_string(),
                },
                Error::Integrity {
                    message: CYCLE.to_string(),
                }
            ]
            .contains(&chain.live("one").expect_err("a cycle verified"))
        );

        // and a certificate that names itself as its issuer.
        let itself = [forged(&one_key, shape("itself", "itself", &one_key))];

        assert!(
            Chain::new(&organization.verifying_key, &itself, &[])
                .live("itself")
                .is_err()
        );
    }

    #[test]
    fn a_chain_deeper_than_the_limit_is_refused_and_one_at_it_verifies() {
        let organization = an_organization();
        let mut certificates = vec![organization.certificate.clone()];
        let mut key = AdministratorKey::from_bytes(&organization.administrator_key.to_bytes());
        let mut rank = MANAGER_ROLE.rank;

        // the root and fifteen below it is sixteen certificates, which is the limit.
        for depth in 1..MAXIMUM_DEPTH {
            let (next_key, next) = delegate(
                &key,
                certificates.last().expect("a certificate"),
                &format!("depth-{depth}"),
                mask_of(&[Flag::InviteMember]),
                rank,
            );

            certificates.push(next);
            key = next_key;
            rank -= 1;
        }

        let deepest = certificates.last().expect("a certificate").id.clone();

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .live(&deepest)
                .map(|found| found.id.clone()),
            Ok(deepest)
        );

        let (_, past) = delegate(
            &key,
            certificates.last().expect("a certificate"),
            "past",
            mask_of(&[Flag::InviteMember]),
            rank,
        );

        certificates.push(past);

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .live("past")
                .err(),
            Some(Error::Integrity {
                message: TOO_DEEP.to_string(),
            })
        );
    }

    // revocations (criterion 9)

    #[test]
    fn a_revocation_counts_only_from_the_root_or_a_certificate_that_outranks_the_revoked() {
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (peer_key, peer) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "peer",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (_, member) = delegate(
            &manager_key,
            &manager,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let certificates = [
            organization.certificate.clone(),
            manager.clone(),
            peer.clone(),
            member.clone(),
        ];
        let live = |revocations: &[Revocation], id: &str| {
            Chain::new(&organization.verifying_key, &certificates, revocations)
                .live(id)
                .is_ok()
        };

        // the root revokes anybody.
        let by_root = revoke(
            &organization.administrator_key,
            &organization.certificate,
            &manager,
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke");

        assert!(!live(std::slice::from_ref(&by_root), &manager.id));

        // a manager revokes a member below them, their own issue or anybody else's.
        let by_manager =
            revoke(&peer_key, &peer, &member, "2026-09-01T00:00:00Z").expect("failed to revoke");

        assert!(!live(std::slice::from_ref(&by_manager), &member.id));

        // a manager does not revoke another manager, however the row is made.
        assert_eq!(
            revoke(&peer_key, &peer, &manager, "2026-09-01T00:00:00Z"),
            Err(Error::Integrity {
                message: "a certificate revokes only one ranked below it".to_string(),
            })
        );

        let mut by_peer = Revocation {
            certificate_id: manager.id.clone(),
            revoker_certificate_id: peer.id.clone(),
            revoked_at: "2026-09-01T00:00:00Z".to_string(),
            signature: Vec::new(),
        };

        by_peer.signature = peer_key
            .0
            .sign(&revocation_preimage(&by_peer))
            .to_bytes()
            .to_vec();

        assert!(live(std::slice::from_ref(&by_peer), &manager.id));

        // and a revocation whose revoker does not walk to the pinned key, or whose signature
        // is not the revoker's, revokes nothing.
        let elsewhere = an_organization_rooted_at("certificate-elsewhere");
        let by_stranger = Revocation {
            ..revoke(
                &elsewhere.administrator_key,
                &elsewhere.certificate,
                &member,
                "2026-09-01T00:00:00Z",
            )
            .expect("failed to revoke")
        };
        let mut with_elsewhere = certificates.to_vec();

        with_elsewhere.push(elsewhere.certificate.clone());

        assert!(
            Chain::new(
                &organization.verifying_key,
                &with_elsewhere,
                std::slice::from_ref(&by_stranger)
            )
            .live(&member.id)
            .is_ok()
        );

        let rewritten = Revocation {
            revoked_at: "2026-09-02T00:00:00Z".to_string(),
            ..by_root.clone()
        };

        assert!(live(std::slice::from_ref(&rewritten), &manager.id));
    }

    #[test]
    fn a_revocation_still_counts_once_its_revoker_is_revoked() {
        // a manager narrows a member, revoking their old certificate; the manager is removed
        // afterwards. The member's old certificate stays revoked, or removing the manager would
        // hand back every width they took away.
        let organization = an_organization();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let (_, member) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let certificates = [
            organization.certificate.clone(),
            manager.clone(),
            member.clone(),
        ];
        let revocations = [
            revoke(&manager_key, &manager, &member, "2026-09-01T00:00:00Z")
                .expect("failed to revoke"),
            revoke(
                &organization.administrator_key,
                &organization.certificate,
                &manager,
                "2026-09-02T00:00:00Z",
            )
            .expect("failed to revoke"),
        ];
        let chain = Chain::new(&organization.verifying_key, &certificates, &revocations);

        assert!(chain.live(&manager.id).is_err());
        assert!(chain.live(&member.id).is_err());
    }

    // the row-kind table (criterion 9): every kind refused under a certificate lacking its flag,
    // and a row about somebody refused under one that does not outrank them

    #[test]
    fn each_kind_of_row_is_refused_under_a_certificate_lacking_its_flag() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let every_member_flag = mask_of(&MEMBER_ADMINISTRATION);

        for (authority, needs) in [
            (member_authority(&public_key, "member"), every_member_flag),
            (role_authority(&sealed, 0, 1), mask_of(&[Flag::ManageRoles])),
            (
                workspace_authority(CHECKED_IN_DATABASE_NAME, CHECKED_IN_DATABASE_HOSTNAME),
                mask_of(&[Flag::RenameWorkspace, Flag::GrantWorkspace]),
            ),
            (grant_authority(&sealed), mask_of(&[Flag::GrantWorkspace])),
            (
                invitation_authority(),
                mask_of(&[Flag::InviteMember, Flag::ResetPassword]),
            ),
            (mark_authority(&sealed), mask_of(&[Flag::ManageMark])),
        ] {
            let with = MANAGER_ROLE.mask;
            let without = MANAGER_ROLE.mask & !needs;

            for (ceiling, expected) in [
                (with, Ok(())),
                (
                    without,
                    Err(Error::Integrity {
                        message: BEYOND_ITS_CERTIFICATE.to_string(),
                    }),
                ),
            ] {
                let (key, certificate) = delegate(
                    &organization.administrator_key,
                    &organization.certificate,
                    "signer",
                    ceiling,
                    MANAGER_ROLE.rank,
                );
                let signature = sign(&key, &certificate, authority).expect("failed to sign");

                assert_eq!(
                    verify(
                        &organization.verifying_key,
                        &[organization.certificate.clone(), certificate.clone()],
                        &[],
                        &certificate,
                        authority,
                        &signature
                    ),
                    expected,
                    "{authority:?} under a ceiling of {ceiling}"
                );
            }
        }
    }

    /// Effort 851, requirement 29: the organization's name is the root's to sign and nobody
    /// else's, a delegated certificate carrying every flag there is included, and a refusal names
    /// the owner's certificate.
    #[test]
    fn the_organizations_name_is_the_roots_alone() {
        let organization = an_organization();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let authority = Authority::OrganizationName {
            name_sealed: &sealed,
            updated_at: 1_757_000_000_000,
        };
        let (key, everything) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "everything",
            permission::OWNER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), everything.clone()];

        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );

        let signature = sign(&key, &everything, authority).expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &everything,
                authority,
                &signature
            ),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            })
        );
        assert_eq!(needed_for(authority), "the owner's certificate");
    }

    #[test]
    fn a_row_about_somebody_is_refused_under_a_certificate_that_does_not_outrank_them() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), manager.clone()];

        for (authority, expected) in [
            // a member row below the manager, one at their rank, and one above it.
            (member_authority(&public_key, "member"), Ok(())),
            (
                member_authority(&public_key, "manager"),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                member_authority(&public_key, "owner"),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            // a role below the manager, and one at their rank: the manager role is the root's.
            (role_authority(&sealed, 0, MANAGER_ROLE.rank - 1), Ok(())),
            (
                role_authority(&sealed, 0, MANAGER_ROLE.rank),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
        ] {
            let signature = sign(&manager_key, &manager, authority).expect("failed to sign");

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &[],
                    &manager,
                    authority,
                    &signature
                ),
                expected,
                "{authority:?}"
            );
        }

        // and the root signs every one of them, the owner's own row included.
        for authority in [
            member_authority(&public_key, "manager"),
            owner_authority(&organization.certificate.member_id, &public_key),
            role_authority(&sealed, 0, MANAGER_ROLE.rank),
        ] {
            let signature = sign(
                &organization.administrator_key,
                &organization.certificate,
                authority,
            )
            .expect("failed to sign");

            assert_eq!(
                verify_under(
                    &organization.verifying_key,
                    &organization.certificate,
                    authority,
                    &signature
                ),
                Ok(()),
                "{authority:?}"
            );
        }
    }

    #[test]
    fn a_member_row_naming_the_owners_role_verifies_only_as_the_roots_about_its_holder() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), manager.clone()];
        let judged = |key: &AdministratorKey, certificate: &Certificate, authority| {
            let signature = sign(key, certificate, authority).expect("failed to sign");

            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                certificate,
                authority,
                &signature,
            )
        };
        let owner_id = organization.certificate.member_id.clone();
        let with_override = Authority::Member(MemberAuthority {
            id: &owner_id,
            public_key: &public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id: permission::OWNER,
            override_mask: 1,
            removed_at: None,
            owner_seed_sealed: None,
        });

        // the root, about the member it names: the owner's row.
        assert_eq!(
            judged(
                &organization.administrator_key,
                &organization.certificate,
                owner_authority(&owner_id, &public_key)
            ),
            Ok(())
        );

        // the root, making somebody else the owner; a manager doing it; and the owner's row with
        // an override (requirement 6).
        for (key, certificate, authority) in [
            (
                &organization.administrator_key,
                &organization.certificate,
                owner_authority("member-somebody-else", &public_key),
            ),
            (
                &manager_key,
                &manager,
                owner_authority(&owner_id, &public_key),
            ),
            (
                &organization.administrator_key,
                &organization.certificate,
                with_override,
            ),
        ] {
            assert_eq!(
                judged(key, certificate, authority),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
                "{authority:?}"
            );
        }

        // and a row naming a role nobody holds is covered by nobody, the root included.
        assert_eq!(
            judged(
                &organization.administrator_key,
                &organization.certificate,
                member_authority(&public_key, "role-nobody-holds")
            ),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            })
        );
    }

    // what a row gives is bounded by its signer's ceiling, and a signer's own row is not theirs
    // (the review of effort 838, round one)

    /// A member row about `id`, holding `role_id` with `override_mask`.
    fn member_row<'a>(
        id: &'a str,
        public_key: &'a [u8],
        role_id: &'a str,
        override_mask: i64,
    ) -> Authority<'a> {
        Authority::Member(MemberAuthority {
            id,
            public_key,
            signing_public_key: CHECKED_IN_MEMBER_SIGNING_PUBLIC_KEY,
            role_id,
            override_mask,
            removed_at: None,
            owner_seed_sealed: None,
        })
    }

    #[test]
    fn a_member_widening_their_own_override_is_refused_on_read() {
        // the review's case: a member holding a certificate (a clerk, who renames members) signs
        // their own row back to the member role with an override that hands them manageRoles,
        // assignRole, grantWorkspace and deleteContract.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let clerk_mask = MEMBER_ROLE.mask | mask_of(&[Flag::RenameMember]);
        let clerk_rank = 500_000;
        let (rita_key, rita) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "rita",
            clerk_mask,
            clerk_rank,
        );
        let certificates = [organization.certificate.clone(), rita.clone()];
        let mut roles = built_in_roles();

        roles.insert("clerk".to_string(), (clerk_mask, clerk_rank));

        let chain = Chain::new(&organization.verifying_key, &certificates, &[]).with_roles(roles);
        let judged = |authority| {
            let signature = sign(&rita_key, &rita, authority).expect("failed to sign");

            chain.verify(&rita.id, authority, &signature)
        };
        let widened = mask_of(&[
            Flag::ManageRoles,
            Flag::AssignRole,
            Flag::GrantWorkspace,
            Flag::DeleteContract,
        ]);

        // her own row, widened, is refused on two counts; her own row as it stands, on one: a
        // delegated certificate never signs its own member's row.
        for authority in [
            member_row(&rita.member_id, &public_key, permission::MEMBER, widened),
            member_row(&rita.member_id, &public_key, permission::MEMBER, 0),
        ] {
            assert_eq!(
                judged(authority),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
                "{authority:?}"
            );
        }

        // somebody else's row giving what her ceiling lacks is refused, and the same row giving
        // only what she holds verifies: the bound is the ceiling, not who the row is about.
        assert_eq!(
            judged(member_row(
                "member-other",
                &public_key,
                permission::MEMBER,
                widened
            )),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            })
        );
        assert_eq!(
            judged(member_row(
                "member-other",
                &public_key,
                permission::MEMBER,
                mask_of(&[Flag::RenameMember])
            )),
            Ok(())
        );
    }

    #[test]
    fn a_member_row_is_bounded_by_the_flags_its_override_switches_and_not_by_its_roles_mask() {
        // a manager whose ceiling lacks deleteContract, signing rows about members below them:
        // the flag switched on by the override, carried by the role's own mask, switched off by
        // the override, or not there at all (the human's decision after review round two).
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let ceiling = MANAGER_ROLE.mask & !mask_of(&[Flag::DeleteContract]);
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            ceiling,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), manager.clone()];
        let mut roles = built_in_roles();

        roles.insert(
            "deleters".to_string(),
            (MEMBER_ROLE.mask | mask_of(&[Flag::DeleteContract]), 500_000),
        );

        let chain = Chain::new(&organization.verifying_key, &certificates, &[]).with_roles(roles);
        let delete_contract = mask_of(&[Flag::DeleteContract]);

        for (authority, expected) in [
            (
                member_row("member-b", &public_key, permission::MEMBER, delete_contract),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            // the role's mask is its role row's signer's to vouch for, not the member row's.
            (member_row("member-b", &public_key, "deleters", 0), Ok(())),
            // switching a flag off is switching it, and the ceiling does not carry it.
            (
                member_row("member-b", &public_key, "deleters", delete_contract),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                member_row("member-b", &public_key, permission::MEMBER, 0),
                Ok(()),
            ),
        ] {
            let signature = sign(&manager_key, &manager, authority).expect("failed to sign");

            assert_eq!(
                chain.verify(&manager.id, authority, &signature),
                expected,
                "{authority:?}"
            );
        }
    }

    /// The member part of a row's authority, which [`Chain::read_member`] takes.
    fn member_of(authority: Authority<'_>) -> MemberAuthority<'_> {
        match authority {
            Authority::Member(member) => member,
            other => panic!("not a member row: {other:?}"),
        }
    }

    #[test]
    fn a_member_row_failing_only_its_roles_standing_reads_uncovered_and_any_other_failure_refuses()
    {
        // a lead's certificate at rank 500,000, holding the member role's flags and inviteMember,
        // reading rows it signed after another machine moved or deleted the role they name, beside
        // the rows whose failure no other machine could have caused.
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let ceiling = MEMBER_ROLE.mask | mask_of(&[Flag::InviteMember]);
        let (lead_key, lead) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "lead",
            ceiling,
            500_000,
        );
        let certificates = [organization.certificate.clone(), lead.clone()];
        let mut roles = built_in_roles();

        roles.insert("clerk".to_string(), (MEMBER_ROLE.mask, 400_000));
        roles.insert("moved".to_string(), (MEMBER_ROLE.mask, 600_000));

        let chain = Chain::new(&organization.verifying_key, &certificates, &[]).with_roles(roles);
        let owner_id = organization.certificate.member_id.clone();
        let manage_roles = mask_of(&[Flag::ManageRoles]);

        for (authority, expected) in [
            (
                member_row("member-b", &public_key, "clerk", 0),
                Ok(Reading::Covered),
            ),
            // the role moved above the lead, and the role deleted: genuine rows nobody forged.
            (
                member_row("member-b", &public_key, "moved", 0),
                Ok(Reading::Uncovered),
            ),
            (
                member_row("member-b", &public_key, "role-nobody-holds", 0),
                Ok(Reading::Uncovered),
            ),
            // and every failure the row and the certificate settle between them still refuses,
            // whatever the role stands at: the lead's own row, an override the ceiling lacks, and
            // the owner's role signed by anybody but the root.
            (
                member_row(&lead.member_id, &public_key, "clerk", 0),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                member_row(&lead.member_id, &public_key, "moved", 0),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                member_row("member-b", &public_key, "clerk", manage_roles),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                member_row("member-b", &public_key, "moved", manage_roles),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                owner_authority(&owner_id, &public_key),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
        ] {
            let signature = sign(&lead_key, &lead, authority).expect("failed to sign");

            assert_eq!(
                chain.read_member(&lead.id, member_of(authority), &signature),
                expected,
                "{authority:?}"
            );
        }

        // a row the lead did not sign as it stands, and one signed under a revoked certificate,
        // still refuse; and verify, which every other read goes through, refuses the uncovered
        // row.
        let authority = member_row("member-b", &public_key, "moved", 0);
        let signature = sign(&lead_key, &lead, authority).expect("failed to sign");
        let revoked = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &lead,
            "2026-08-30T12:00:00Z",
        )
        .expect("failed to revoke")];

        assert_eq!(
            chain.read_member(
                &lead.id,
                member_of(member_row("member-c", &public_key, "moved", 0)),
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );
        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &revoked)
                .with_roles(built_in_roles())
                .read_member(&lead.id, member_of(authority), &signature),
            Err(Error::Integrity {
                message: REVOKED_CERTIFICATE.to_string(),
            })
        );
        assert_eq!(
            chain.verify(&lead.id, authority, &signature),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            })
        );
    }

    #[test]
    fn a_role_row_carrying_a_flag_its_signers_ceiling_lacks_is_refused_on_read() {
        // the review's case: a manager lacking grantWorkspace writes another role's row carrying
        // grantWorkspace and createWorkspace, the second an owner's flag.
        let organization = an_organization();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let ceiling = MANAGER_ROLE.mask & !mask_of(&[Flag::GrantWorkspace]);
        let (supervisor_key, supervisor) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "supervisor",
            ceiling,
            MANAGER_ROLE.rank - 1,
        );
        let certificates = [organization.certificate.clone(), supervisor.clone()];

        for (mask, expected) in [
            (MEMBER_ROLE.mask, Ok(())),
            (
                MEMBER_ROLE.mask | mask_of(&[Flag::GrantWorkspace]),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
            (
                MEMBER_ROLE.mask | mask_of(&[Flag::GrantWorkspace, Flag::CreateWorkspace]),
                Err(Error::Integrity {
                    message: BEYOND_ITS_CERTIFICATE.to_string(),
                }),
            ),
        ] {
            let authority = role_authority(&sealed, mask, 1);
            let signature = sign(&supervisor_key, &supervisor, authority).expect("failed to sign");

            assert_eq!(
                verify(
                    &organization.verifying_key,
                    &certificates,
                    &[],
                    &supervisor,
                    authority,
                    &signature
                ),
                expected,
                "a role carrying {mask}"
            );
        }

        // and the root, holding every flag, signs a role carrying any of them.
        let authority = role_authority(&sealed, MANAGER_ROLE.mask, MANAGER_ROLE.rank);
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        assert_eq!(
            verify_under(
                &organization.verifying_key,
                &organization.certificate,
                authority,
                &signature
            ),
            Ok(())
        );
    }

    #[test]
    fn a_read_only_grant_is_the_roots_alone() {
        let organization = an_organization();
        let sealed = hex(CHECKED_IN_SEALED_CREDENTIAL);
        let (manager_key, manager) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "manager",
            MANAGER_ROLE.mask,
            MANAGER_ROLE.rank,
        );
        let certificates = [organization.certificate.clone(), manager.clone()];
        let read_only = grant_authority_at(&sealed, "read-only");
        let by_manager = sign(&manager_key, &manager, read_only).expect("failed to sign");
        let by_root = sign(
            &organization.administrator_key,
            &organization.certificate,
            read_only,
        )
        .expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &manager,
                read_only,
                &by_manager
            ),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            })
        );
        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &[],
                &organization.certificate,
                read_only,
                &by_root
            ),
            Ok(())
        );
    }

    /// **A workspace override is covered as a member row's override is** (effort 838, ticket 53):
    /// the root or a holder of `overrideMember`, above the member as they stand by their role and
    /// as they are certified, holding every flag it pins, never about its own member, and record
    /// flags alone, granting none it does not pin, whoever signs it. A member the reader does not know as in is overridden
    /// by nobody. Signed, it verifies through the chain like every other row.
    #[test]
    fn a_workspace_override_is_covered_as_a_members_override_is() {
        let organization = an_organization();
        let overrider_ceiling = MEMBER_ROLE.mask | permission::mask_of(&[Flag::OverrideMember]);
        let (overrider_key, overrider) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "lead",
            overrider_ceiling,
            500_000,
        );
        let (_, clerk) = delegate(
            &organization.administrator_key,
            &organization.certificate,
            "clerk",
            MEMBER_ROLE.mask,
            500_000,
        );
        let about = |member_id: &'static str, pinned: i64| {
            Authority::WorkspaceOverride(WorkspaceOverrideAuthority {
                member_id,
                workspace_id: "workspace-a",
                pinned,
                granted: pinned,
            })
        };
        let ranks = |member_id: &str| match member_id {
            "member-sami" => Some(MEMBER_ROLE.rank),
            "member-ada" => Some(MANAGER_ROLE.rank),
            "member-lead" => Some(500_000),
            "member-a" => Some(OWNER_ROLE.rank),
            _ => None,
        };
        let covered = |certificate: &Certificate, authority: Authority<'_>| {
            covers(certificate, authority, |_| None, |_| None, ranks)
        };
        let editing = permission::mask_of(&[Flag::EditUnit]);

        assert!(covered(
            &organization.certificate,
            about("member-sami", editing)
        ));
        assert!(covered(
            &organization.certificate,
            about("member-ada", editing)
        ));
        assert!(covered(&overrider, about("member-sami", editing)));

        // record flags alone, whoever signs it.
        let administration = editing | permission::mask_of(&[Flag::InviteMember]);

        assert!(!covered(
            &organization.certificate,
            about("member-sami", administration)
        ));
        assert!(!covered(&overrider, about("member-sami", administration)));
        // granting nothing it does not pin, whoever signs it.
        let granting_beyond = |pinned: i64, granted: i64| {
            Authority::WorkspaceOverride(WorkspaceOverrideAuthority {
                member_id: "member-sami",
                workspace_id: "workspace-a",
                pinned,
                granted,
            })
        };
        let deleting = permission::mask_of(&[Flag::DeleteUnit]);

        assert!(!covered(
            &organization.certificate,
            granting_beyond(editing, editing | deleting)
        ));
        assert!(!covered(
            &overrider,
            granting_beyond(editing, editing | deleting)
        ));
        assert!(covered(&overrider, granting_beyond(editing, 0)));
        // every flag pinned is one the signer holds, pinned off as much as on.
        assert!(!covered(&overrider, granting_beyond(deleting, 0)));
        // never about its own member, the root's included.
        assert!(!covered(
            &organization.certificate,
            about("member-a", editing)
        ));
        assert!(!covered(&overrider, about("member-lead", editing)));
        // above the member, by their role and as they are certified.
        assert!(!covered(&overrider, about("member-ada", editing)));
        assert!(!covers(
            &overrider,
            about("member-sami", editing),
            |_| None,
            |_| Some(500_000),
            ranks
        ));
        // holding overrideMember, and every flag it switches.
        assert!(!covered(&clerk, about("member-sami", editing)));
        assert!(!covered(
            &overrider,
            about("member-sami", permission::mask_of(&[Flag::DeleteUnit]))
        ));
        // about a member the reader knows as in.
        assert!(!covered(
            &organization.certificate,
            about("member-gone", editing)
        ));

        // and signed, it verifies through the chain, which knows the member's rank.
        let certificates = [organization.certificate.clone(), overrider.clone()];
        let authority = about("member-sami", editing);
        let signature = sign(&overrider_key, &overrider, authority).expect("failed to sign");
        let chain = Chain::new(&organization.verifying_key, &certificates, &[])
            .with_roles(built_in_roles())
            .with_members(HashMap::from([(
                "member-sami".to_string(),
                MEMBER_ROLE.rank,
            )]));

        assert_eq!(chain.verify(&overrider.id, authority, &signature), Ok(()));
        assert_eq!(
            chain.verify(
                &overrider.id,
                about("member-sami", permission::mask_of(&[Flag::EditTenant])),
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );
        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .with_roles(built_in_roles())
                .verify(&overrider.id, authority, &signature),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            }),
            "a chain that does not know the member overrode them"
        );
    }

    #[test]
    fn a_members_live_certificate_is_the_newest_that_nothing_revoked() {
        let organization = an_organization();
        let key = AdministratorKey::generate().expect("failed to generate");
        let issue = |id: &str, issued_at: &str| {
            issue_certificate(
                &organization.administrator_key,
                &organization.certificate,
                Issue {
                    id,
                    member_id: "member-b",
                    signing_public_key: &key.verifying_key(),
                    ceiling: mask_of(&[Flag::InviteMember]),
                    rank: 1,
                    issued_at,
                },
            )
            .expect("failed to issue")
        };
        let older = issue("older", "999");
        let newer = issue("newer", "1000");
        let certificates = [
            organization.certificate.clone(),
            older.clone(),
            newer.clone(),
        ];

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &[])
                .live_certificate_of("member-b", &key.verifying_key())
                .map(|found| found.id.as_str()),
            Some("newer")
        );

        let revocations = [revoke(
            &organization.administrator_key,
            &organization.certificate,
            &newer,
            "1001",
        )
        .expect("failed to revoke")];

        assert_eq!(
            Chain::new(&organization.verifying_key, &certificates, &revocations)
                .live_certificate_of("member-b", &key.verifying_key())
                .map(|found| found.id.as_str()),
            Some("older")
        );
    }

    // nothing here trusts what a column happens to hold

    #[test]
    fn a_signature_that_is_not_a_signature_is_rejected() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");

        for signature in [
            Vec::new(),
            vec![0_u8; SIGNATURE_BYTES],
            vec![0xff_u8; SIGNATURE_BYTES],
            vec![0_u8; SIGNATURE_BYTES - 1],
            vec![0_u8; SIGNATURE_BYTES + 1],
        ] {
            assert_eq!(
                verify_under(
                    &organization.verifying_key,
                    &organization.certificate,
                    authority,
                    &signature
                ),
                Err(Error::Integrity {
                    message: FORGED_ROW.to_string(),
                }),
                "a signature of {} bytes was accepted",
                signature.len()
            );
        }
    }

    #[test]
    fn a_certificate_carrying_no_usable_signature_is_rejected() {
        let organization = an_organization();
        let public_key = checked_in_member_public_key();
        let authority = member_authority(&public_key, "member");
        let signature = sign(
            &organization.administrator_key,
            &organization.certificate,
            authority,
        )
        .expect("failed to sign");

        for certificate_signature in [Vec::new(), vec![0_u8; SIGNATURE_BYTES]] {
            let certificate = Certificate {
                signature: certificate_signature,
                ..organization.certificate.clone()
            };

            assert_eq!(
                verify_under(
                    &organization.verifying_key,
                    &certificate,
                    authority,
                    &signature
                ),
                Err(Error::Integrity {
                    message: FORGED_CERTIFICATE.to_string(),
                })
            );
        }
    }

    #[test]
    fn the_row_is_checked_first_then_the_walk_the_revocation_and_what_it_covers() {
        // every check refuses this row, and the order is what decides which refusal a reader is
        // handed.
        let organization = an_organization();
        let elsewhere = an_organization();
        let (member_key, member) = delegate(
            &elsewhere.administrator_key,
            &elsewhere.certificate,
            "member",
            mask_of(&[Flag::InviteMember]),
            1,
        );
        let public_key = checked_in_member_public_key();
        // a member row about a manager, which a certificate of rank 1 does not cover.
        let authority = member_authority(&public_key, "manager");
        let certificates = [elsewhere.certificate.clone(), member.clone()];
        let revocations = [revoke(
            &elsewhere.administrator_key,
            &elsewhere.certificate,
            &member,
            "2026-09-01T00:00:00Z",
        )
        .expect("failed to revoke")];

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &revocations,
                &member,
                authority,
                &[0_u8; SIGNATURE_BYTES]
            ),
            Err(Error::Integrity {
                message: FORGED_ROW.to_string(),
            })
        );

        // with the row's own signature good, the walk answers next
        let signature = sign(&member_key, &member, authority).expect("failed to sign");

        assert_eq!(
            verify(
                &organization.verifying_key,
                &certificates,
                &revocations,
                &member,
                authority,
                &signature
            ),
            Err(Error::Integrity {
                message: FORGED_CERTIFICATE.to_string(),
            })
        );

        // with the walk good too, the revocation
        assert_eq!(
            verify(
                &elsewhere.verifying_key,
                &certificates,
                &revocations,
                &member,
                authority,
                &signature
            ),
            Err(Error::Integrity {
                message: REVOKED_CERTIFICATE.to_string(),
            })
        );

        // and with nothing revoked, what the certificate covers is what is left
        assert_eq!(
            verify(
                &elsewhere.verifying_key,
                &certificates,
                &[],
                &member,
                authority,
                &signature
            ),
            Err(Error::Integrity {
                message: BEYOND_ITS_CERTIFICATE.to_string(),
            })
        );
    }
}
