---
'@rentable/desktop': patch
---

the first run works out which turso group you picked instead of guessing at it. before creating anything it asks your own account what the group is called: the mcp server, where its tools offer a way to list groups, and otherwise the platform api, whose account endpoint names you and whose groups sit under that name, picking out the group your consent is over by the identity the consent carries. the first database is then created with that name and nothing else is tried. where neither can say, the run falls back to the three names it already tried, no group, turso's default and the group's identity, and the field on the name step is still the last resort after all of that. both new calls only read.
