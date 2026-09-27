---
'@rentable/desktop': minor
---

an organization now has roles: the owner, a manager and a member, and roles of its own ranked between the two, each a set of permissions for everything the application does, with an override on each member to switch a permission for them alone. managers give and take permissions without the owner being present. this changes the organization's format, so an organization made by an earlier version is upgraded when its owner first signs in with a connection, and until then its other members are asked to wait. before it upgrades, the owner's machine keeps a copy of the organization in a backups folder beside its data, and a protected one on the owner's Turso account where the machine holds it. a workspace is copied before a newer version changes its tables, to the machine of whichever member opens it first, and to the owner's Turso account only when that machine is the owner's. a machine's local copy of a workspace or the organization found damaged is kept aside, renamed as corrupt, and downloaded again from Turso, and anything that machine had not yet sent from it is lost

records from 0.12 or 0.13 still on a machine are offered for import into a workspace, and a copy of them is kept as a workbook
