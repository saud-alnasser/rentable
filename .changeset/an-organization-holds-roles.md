---
'@rentable/desktop': minor
---

an organization now has roles: the owner, a manager and a member, and roles of its own ranked between the two, each a set of permissions for everything the application does, with an override on each member to switch a permission for them alone. managers give and take permissions without the owner being present. this changes the organization's format, so an organization made by an earlier version is refused by name: before updating, open each workspace in the earlier version and export it, delete the organization, then after updating create a new organization and import each workspace into it
