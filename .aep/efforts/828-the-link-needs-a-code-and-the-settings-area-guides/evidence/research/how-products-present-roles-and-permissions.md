---
use-when: "shaping the settings surface where a member's role, their widened acts, and their per-workspace access are read and changed"
---

# Question

How do well-made products present roles and permissions for the members of a small
organization in their settings, and what do the good ones have in common?

# Sources

Primary throughout: each product's own documentation, and where a page describes its own
surface, that description. All read 2026-09-16.

- GitHub, *Roles in an organization*,
  `https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization`
- GitHub, *Repository roles for an organization*,
  `https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization`
- GitHub, *About custom organization roles*,
  `https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/about-custom-organization-roles`
- GitHub, *Managing teams and people with access to your repository*,
  `https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository`
- Slack, *Types of roles in Slack*, `https://slack.com/help/articles/360018112273`
- Slack, *Permissions by role in Slack*, `https://slack.com/help/articles/201314026`
- Slack, *Manage channel management permissions*, `https://slack.com/help/articles/360004635551`
- Notion, *Add members, admins, guests, and groups*,
  `https://www.notion.com/help/add-members-admins-guests-and-groups`
- Notion, *Sharing and permissions*, `https://www.notion.com/help/sharing-and-permissions`
- Linear, *Members and roles*, `https://linear.app/docs/members-roles`
- Google Workspace, *About administrator roles*,
  `https://knowledge.workspace.google.com/admin/users/about-administrator-roles`
- Google Workspace, *Prebuilt administrator roles*,
  `https://knowledge.workspace.google.com/admin/users/prebuilt-administrator-roles`
- Stripe, *User roles*, `https://docs.stripe.com/get-started/account/teams/roles`
- Vercel, *Access roles*, `https://vercel.com/docs/rbac/access-roles`
- 1Password, *Groups*, `https://support.1password.com/groups/`
- 1Password, *Family organizer*, `https://support.1password.com/family-organizer/`

Local, for what this application has, read at `f56ac57a`:

- `packages/workspace-permission/index.ts` — the seven acts, the three roles, and what the
  roles are created with. There is no `README.md`; the module docstrings are the record.
- `apps/desktop/src/lib/i18n/en/index.ts`, lines 898 to 918 — the three access levels as the
  surface already words them, and the two titles the edit is currently split across.
- `.aep/rules/interface.md` — how a write and a form are shaped here.

Unreachable, and named as gaps rather than worked around:

- 1Password Business (`https://support.1password.com/1password-business/`) and 1Password
  Families (`https://support.1password.com/1password-families/`) both returned HTTP 403. The
  two 1Password pages above did answer, so the product is covered, thinly.
- Notion's members-settings surface: three candidate URLs returned HTTP 404
  (`/help/roles-and-permissions`, `/help/intro-to-members-groups-teamspaces`), and
  `/help/workspace-settings` does not describe the members table. Notion's *roles* are cited;
  its *surface* is not.
- GitHub's *Managing an individual's access to an organization repository* page exists but
  describes no controls, so the surface description comes from *Managing teams and people*.
- The visual reference: `.aep/position/design/` does not exist in this worktree. Per
  `[[rules/interface]]`, under *The visual reference*, that is a working state; nothing below
  leans on the book.

# Findings

## Per product

**source — GitHub, organization roles.** The fixed set is owner, member, moderator, billing
manager, security manager, and GitHub App manager. Each carries one sentence: an owner has
"complete administrative access to your organization"; the member is "the default,
non-administrative role"; a moderator is a member who "in addition to their permissions as
members, are allowed to block and unblock non-member contributors, set interaction limits, and
hide comments"; a billing manager "can manage the billing settings for your organization, such
as payment information."

*observation.* Every one of those descriptions names an audience or an outcome. None names an
internal capability token.

**source — GitHub, per-person exceptions.** Yes, and they are additive on top of a base: "After
they have joined, you can designate them additional permissions under a predefined or custom
role." A custom organization role is a **base role** (one of read, triage, write, maintain,
admin) plus **additional permissions**, which are grouped by area: Discussions, Issues and Pull
Requests, Repository, Security, Actions. A permission is named as a verb plus its object and
carries its own explanatory line: "Manage organization webhooks — Users with this permission
will be able to view webhook payloads"; "Push commits to protected branches" is annotated "Base
role must be `write`."

**source — GitHub, one surface or two.** Two. The organization role is set in the organization's
people settings; repository access is set on the repository, under *Collaborators and teams*,
where you "select the Role dropdown menu, and click a new role." That page searches and filters,
and it shows a "Mixed roles" warning beside a person whose access arrives from more than one
grant.

**source — GitHub, how a permission is described on a reference surface.** Repository roles get
one recommendation sentence each — "Read: Recommended for non-code contributors who want to view
or discuss your project"; "Maintain: Recommended for project managers who need to manage the
repository without access to sensitive or destructive actions"; "Admin: Recommended for people
who need full access to the project, including sensitive and destructive actions like managing
security or deleting a repository" — and behind them a read-only table with actions as rows and
the five roles as columns, marked with check and cross. The table is documentation, not a
control.

**source — Slack, roles.** Primary owner ("Only this person can delete the workspace or transfer
ownership to someone else"), owners ("the same level of permissions as the Primary Owner, except
they can't delete or transfer ownership"), admins ("They help manage members and can perform
administrative tasks, but they can't access the Billing page"), full members, multi-channel
guests, single-channel guests, channel managers ("can take administrative actions on channels
they're assigned"), and invited members.

*observation.* Each description is written as a difference from the role above it, not as an
independent list of capabilities.

**source — Slack, comparison table.** *Permissions by role* is a read-only comparison with the
columns **Owner/Admin**, **Member**, **Guest**, rows such as "Send messages and upload files",
"Join any public channel", "Create a channel", and a small legend: a check for default, one mark
for owners only, another for "if owner changes settings."

**source — Slack, per-resource access.** Separate surface, and per resource rather than per
person: posting permissions live in the channel itself, reached by the channel name, the
**Settings** tab, then **Edit** beside "Posting permissions", where a dropdown chooses who may
post. Workspace role and channel permission are never edited together.

**source — Notion, roles.** Workspace owner, membership admin, member, guest, and temporary
member. Guests are scoped rather than roled: "guests can be added to individual pages, not to an
entire workspace." A temporary member holds "member-level access until their expiration date,
then lose access automatically."

**source — Notion, access levels.** Four, each a sentence rather than a word: **Full access** —
"People with full access to a page can edit any of the content it contains and share the page
with anyone they want"; **Can edit** — "for people who should be able to edit the content on the
page, but not share the page with others"; **Can comment** — "for people who should only have
the ability to comment on a page. They won't be able to edit or share the content"; **Can
view** — "can read the content on the page, but they won't be able to comment, edit, or share."
Set per person from a dropdown beside their name, never as toggles.

*observation.* Notion's four levels are one ordered ladder. The wording of each rung names the
rung below it as what it withholds, which is what makes the ladder readable without a table.

**source — Linear, roles.** Workspace owner ("full administrative control, including access to
sensitive settings like billing, security, audit logs, workspace exports, and OAuth application
approvals"), admin ("elevated permissions to manage routine workspace operations"), team owner,
member ("can collaborate across teams they have access to and use all standard workspace
features. They cannot access workspace-level administration pages"), and guest ("restricted
access to specified teams — ideal for contractors, clients, or cross-company collaborators").

**source — Linear, exceptions and surfaces.** No per-person exception beyond the role. Two
surfaces: a role is changed in Members settings, team access in *Team settings > Access and
permissions*. Where Linear does expose granular controls (issue label management, template
management, member management) they are attached to the **team**, phrased as "who can" per
capability, not as a per-person toggle wall.

**source — Google Workspace.** Prebuilt roles, each one sentence: Super Admin — "Has access to
all features in the Google Admin console and Admin API and can manage every aspect of your
organization's account"; Groups Admin — "Has full control over Google Groups' tasks in your
Admin console"; User Management Admin — "Can perform all actions on users who aren't
administrators"; Services Admin — "Can manage certain service settings and devices in the Admin
console, including Google Calendar, Drive, and Docs"; Help Desk Admin, Mobile Admin, Storage
Admin, and others in the same shape. The rationale is stated outright: "We've created
administrator roles for performing common business functions that you may be able to use out of
the box — one role for managing users, another for groups, another for services, and so on."

**source — Google Workspace, exceptions and scope.** A custom role is built from the same
privileges: "If the pre-built roles don't meet your needs, create your own custom roles. For each
custom role, choose from the same set of privileges used in the pre-built roles, grouping them
however you want." Scope rides along with the assignment rather than living on a second surface:
"Assign administrator roles to users that let them perform the tasks you want them to manage.
For roles that permit managing users, optionally assign the organizational unit you want them to
manage."

*observation.* This is the one product read here that puts the role and its scope on one
surface, and it does so by making the scope a field of the assignment.

**source — Stripe.** Roles are named for the job, not the act: Administrator, IAM Administrator,
Super Administrator, Account Owner, Developer, Analyst, Dispute Analyst, Refund Analyst, Support
Specialist, View Only, Accountant, and more, grouped by area (Admin, Connect, Developer,
Identity, Payment, Support, Tax form, View only). Each opens with one sentence of *who it is
for* — "This role is for people who need to pay out money, refund payments, and export data" —
then one sentence of what it withholds — "They can't edit payout schedules or account
settings."

**source — Stripe, the two lists.** Under each role sit two headed lists: **"Some of what this
role can do"** and **"Some of what this role can't do"**, written as plain acts ("Invite, edit,
and remove team members", "Change the account owner"). The Account Owner is defined as
un-reassignable from the roles surface: "There can only be one Owner for an account. To change
the Account Owner, please refer to this guide."

*observation.* The word *some* is doing real work. Stripe deliberately declines to be
exhaustive, which is what lets the list stay readable.

**source — Stripe, exceptions.** Not per-act toggles. Stripe stacks whole roles instead: "If you
assign a user multiple roles, they're assigned all the permissions of each individual role. Be
cautious of conflicts and unintended authority."

**source — Vercel.** A table of eight team roles, one line each: Owner — "Have the highest level
of control. They can manage, modify, and oversee the team's settings, all projects, team members
and roles"; Member — "Have full control over projects and most team settings, but cannot invite
or manage users by default"; Developer, Security — "Can manage security features, IP blocking,
firewall. Cannot create deployments by default"; Billing, Pro Viewer, Enterprise Viewer, and
Contributor — "A unique role that can be configured to have any of the project level roles or
none."

**source — Vercel, the exception shape.** *Permission groups*, a table whose columns are
**Permission**, **Description**, **Compatible Roles**, **Already Included in**. Rows read "Create
Project — Allows the user to create a new project — Developer, Contributor — Owner, Member" and
"Environment Variable Manager — Create and manage environment variables — Developer — Owner,
Member."

*interpretation.* Those last two columns are the mechanism that keeps the exception surface
small. A permission is only offered on a role that does not already carry it, so a person never
sees a control that cannot change anything. This is the closest observed answer to "seven
toggles, most of them already on."

**source — Vercel, per-resource access.** Two levels, and gated: project-level roles exist
(Project Administrator, Project Developer, Project Viewer) but "Only contributors can have
configurable project roles." A contributor "has no access to projects unless explicitly
assigned"; every other team role derives its project access from the team role and is never
assigned per project.

*interpretation.* Vercel makes the per-resource grid reachable only from one role. Choosing that
role is the act that opens the second dimension, so most members never meet it.

**source — 1Password.** Permissions are carried by built-in groups rather than a role field:
Owners — "Owners can do everything Administrators can, plus make changes to billing and delete
the team"; Administrators — "Administrators can add and manage vaults, groups, and team members.
They can also recover accounts"; Team Members — "Everyone in your organization belongs to the
Team Members group, with the exception of guests"; Security — "People in the Security group can
view security reports and account activity"; and Provision Managers. At least one owner must
remain.

**source — 1Password Families.** Two roles only. The organizer's powers are given as six named
areas, each one line: family members ("Invite people to your family account"), guests ("Give
people temporary access to a vault in your family account, and remove them when they no longer
need access"), vaults, recovery ("Restore access for family members who forget their 1Password
account password or can't find their Secret Key"), billing, settings. The role is changed from
one place: People, the person's name, then "Family Organizer" or "Family Member".

*observation.* The smallest organization in this sample has the smallest surface: one person,
one choice of two, and six sentences explaining what the choice means.

## What the good ones share

**observation — a role is described by who it is for, not by what it unlocks.** Stripe ("This
role is for people who need to..."), GitHub ("Recommended for..."), Google ("for performing
common business functions"), Vercel ("ideal for stakeholder collaboration"). Eight of eight
products give every role at least one sentence. None presents a bare role name.

**observation — the comparison lives in a read-only table, never in the editor.** GitHub's
action-by-role matrix and Slack's Owner/Admin, Member, Guest table are both documentation. The
editing surface in every product is a dropdown of role names; the matrix is what you consult
before choosing.

*interpretation.* The matrix is how a product answers "what does this role mean" without putting
one control per cell in front of the person making the choice.

**observation — an exception is additive, named, and shown as a short list.** GitHub's "base role
plus additional permissions"; Vercel's permission groups with *Already included in*; Stripe's
stacked roles. In none of them is the exception surface a complete grid of every capability.
Vercel and GitHub both suppress a permission that the chosen role already carries.

**observation — permissions are grouped by area when there are many.** GitHub groups into
Discussions, Issues and Pull Requests, Repository, Security, Actions. Stripe groups roles into
Admin, Connect, Developer, Identity, Payment, Support, Tax form, View only. Google groups
privileges into functional areas. Nobody presents twenty flat controls.

**observation — the top role is defined as un-editable and singular.** Stripe: "There can only be
one Owner for an account", changed by a documented procedure elsewhere. Slack: only the primary
owner can delete or transfer. 1Password: at least one owner must remain. GitHub owners hold
"complete administrative access" with no per-act widening described.

**observation — role and per-resource access are two surfaces in six of eight.** GitHub
(organization people versus repository *Collaborators and teams*), Slack (roles versus a
channel's Settings tab), Linear (Members settings versus *Team settings > Access and
permissions*), Notion (workspace members versus per-page sharing), Vercel (team role versus
project roles), 1Password (groups versus vaults). Google Workspace is the exception, and it folds
scope in as a field of the role assignment rather than as a second grid. Stripe has no
per-resource dimension at all.

*interpretation.* Two surfaces is the majority answer, but every one of those six has many
resources per person. The split is a response to cardinality, not a principle about roles.

**observation — the per-resource control is itself a named level with a sentence.** Notion's
four levels are the clearest case, each written as a full sentence naming what it withholds.
GitHub's repository roles are the same shape. Nowhere is a per-resource grant a checkbox.

**observation — what nobody had.** No product read here showed a confirmation step on demotion,
and none described one. The brief anticipated that pattern; it is not present in these sources.
Absence in documentation is weak evidence about the running product, so this is recorded as an
absence of evidence rather than as evidence of absence.

## What they avoid

**observation — a toggle wall with no descriptions appears nowhere.** Every granular permission
observed carries an explanatory line: GitHub's "Users with this permission will be able to view
webhook payloads", Vercel's "Create and manage team-wide connectors, project connections,
installations, and tokens." The only unadorned controls found were Slack's two @mention
checkboxes, which are two, not seven.

**observation — engineering names for acts appear nowhere on a human surface.** Stripe carries
machine identifiers ("SSO Role ID: support_associate") deliberately alongside the human name,
never instead of it. Every permission name read is a verb phrase in ordinary words: "Invite,
edit, and remove team members", "Push commits to protected branches", "Create and manage project
environments".

**observation — one person's access is edited from one place per dimension.** Where two
dimensions exist they are two surfaces, but a single dimension is never split. GitHub's
*Collaborators and teams* changes role and shows the "Mixed roles" warning in one row. 1Password
changes the family role from People, the person, the choice. No product read here required two
dialogs to complete one edit.

**observation — a flat catalogue of every capability is never the default view.** GitHub's custom
roles are an authoring surface reached deliberately; the default is one of five base roles.
Vercel's permission groups sit below the role table. Google's privilege picker is reached only
after the prebuilt roles do not fit.

## Against this application's model

Stated as candidate shapes, with costs. Not decided.

The model, from `packages/workspace-permission/index.ts` and the i18n strings: three roles
(`owner`, `administrator`, `member`); seven acts (`inviteMember`, `removeMember`, `changeRole`,
`renameWorkspace`, `resetPassword`, `renameMember`, `grantWorkspace`); owner and administrator
are created with all seven, a member with none; three access levels per workspace (full access,
read only, no access); the owner's acts are not editable and the acts that separate an owner from
an administrator are refused in Rust rather than stored as flags; nobody edits their own row.
The surface today is split across `accessTitle` ("workspaces and access") and
`workspaceAccessTitle` ("members and access") — two entry points onto one person's standing.

**observation — the seven acts collapse to three subjects.** People (`inviteMember`,
`removeMember`, `changeRole`, `renameMember`, `resetPassword`), the workspace itself
(`renameWorkspace`), and access (`grantWorkspace`). That is the grouping GitHub, Stripe and
Google all apply once a list passes about five.

**observation — the widening surface is empty for two of three roles.** An owner's acts are not
editable and an administrator is created holding all seven, so the toggles only ever mean
anything for a member. Vercel's *Already included in* column is the observed pattern for exactly
this, and its consequence there is that the control is not shown at all where it cannot change
anything.

### Candidate shape A — one member sheet, sectioned

One surface per person, in the shared form surface `[[rules/interface]]` fixes under *Form
surface*, with three sections: **role** (a chooser of three, each with its sentence, after
Vercel's and Stripe's wording), **also allowed** (the widening, shown only where the role leaves
something to widen), and **workspaces** (a row per workspace with its three-level dropdown,
after Notion's per-person dropdown). The two current titles become two sections of one sheet.

*Cost.* The longest single surface of the three: a member of five workspaces reads a role
chooser, up to seven act rows, and five access rows. Against the human's complaint of "too many
toggles", this shape reduces the count only by hiding what the role already grants, and an
administrator's sheet then looks structurally different from a member's, which has to be
explained rather than merely seen. It also puts a rarely-used control next to a frequently-used
one.

### Candidate shape B — role on the row, everything else behind its own act

The members list carries the role chooser inline, as GitHub's *Collaborators and teams* does with
its Role dropdown, and the two harder dimensions are separate deliberate acts opened from the
row's own control: one for widening, one for workspaces. A read-only comparison of what the three
roles may do sits above the list, in the shape of Slack's and GitHub's tables, so the chooser
needs no explanation beyond its sentence.

*Cost.* This is closest to what exists, and it keeps the split the human objected to, though it
converts it from two entry points onto one subject into two acts on two subjects. It buys the
shortest default view and pays for it by making the widening discoverable only from a menu. It
also spends vertical space on a table that most days nobody reads.

### Candidate shape C — the widening folded into the role vocabulary

Drop the per-act surface entirely and let the role carry the meaning, as Stripe, Linear and
1Password do with no per-person exceptions at all. Either the three roles stay and the seven acts
become fixed per role, or a fourth role is added for the common widening the organization
actually wants. Workspaces keep their own per-person surface with the three-level dropdown,
which is then the only second dimension.

*Cost.* The widest change, and it contradicts the reasoning recorded in
`packages/workspace-permission/index.ts`: "an organization may want an administrator who cannot
rename a member, and a role that computed its own permissions on read could not express that."
The column would remain as stored truth with no surface to set it, which is a second home for a
rule. It also forecloses the case the package was built for, and a fourth role is a naming
problem ("administrator who cannot invite") that the observed products solve by having many more
roles than three.

# Conclusion

Every product read describes a role with at least one sentence about who it is for; puts the
role-by-act comparison in a read-only table rather than in the editing surface; offers a
per-person exception, where it offers one at all, as a short additive list of named permissions
that hides what the role already grants; groups permissions by subject once there are more than
about five; and treats the top role as singular and not editable from the roles surface. Where a
per-resource dimension exists it is usually a second surface, and the control there is a named
level with a sentence rather than a checkbox. None of these sources documents a confirmation
step on demotion.

Three shapes fit this application's model, above, and each costs something different. Which one
is a decision for the spec, not for this file.

# Not checked

- **1Password Business and Families' own pages**, both HTTP 403. The Groups and Family organizer
  pages stood in; the business permission matrix was not read directly.
- **Notion's members-settings surface.** Its roles and its four page-permission levels are
  cited; how the members table itself is laid out is not.
- **Screenshots.** No product page read here rendered its own screenshots through the fetch tool.
  Every claim about a surface is that product's own prose description of it, which is primary but
  is not the pixels.
- **What any of these products actually does on demotion, removal, or self-edit.** Only Stripe
  and 1Password documented a constraint on the top role; nobody documented a confirmation.
- **Whether any product refuses to let a person edit their own row.** Not stated on any page
  read.
- **The visual reference.** `.aep/position/design/` is absent in this worktree, so no section of
  the design book informed the shapes above.
- **This repository's current settings surface.** The brief bounded the reading to the permission
  package and the interface rule, so what the two dialogs look like today is known only from the
  two i18n titles and the human's own account.
