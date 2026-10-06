---
'@rentable/desktop': patch
---

importing tenants now checks the national id and the phone each on its own. a row whose national id or phone another tenant already has is named in the preview and left out, two rows of one file sharing either one are named together, and the import no longer stops with a database error.
