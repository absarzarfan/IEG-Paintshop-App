---
name: Paintshop serial identity
description: A serial number is unique within a Job Number; the JN/SN pair identifies the unit in the workflow.
---

Use the Job Number + Serial Number pair as the uniqueness key. The same SN may be registered under different JNs, but the same pair must be rejected and direct the user to find the existing record in Jobs or Ongoing Work.

**Why:** the user specified per-job identity as JN + SN and requested duplicate pairs be rejected without blocking valid serial reuse on another job.

**How to apply:** Keep database uniqueness and API duplicate checks scoped to the job item, while retaining the surrogate serial row ID for related usage and work-history records.
