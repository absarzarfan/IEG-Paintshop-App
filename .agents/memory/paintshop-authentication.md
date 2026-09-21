---
name: Paintshop authentication
description: The product decision and security boundary for Paintshop account access.
---

Paintshop uses internal username/password accounts. The first-time setup creates one
Admin account; after setup, only an active Admin creates accounts and assigns roles.
Sessions are server-side and represented to the browser by an HttpOnly cookie. Email
is optional profile data and is never the login identity.

**Why:** The operational system must support users who do not have Gmail or any
specific external identity provider, while keeping access controlled by the plant
administrator.

**How to apply:** Keep authentication endpoints, user provisioning, role changes,
and password handling server-authoritative. Do not reintroduce provider-dependent
sign-up or treat email as a required credential.