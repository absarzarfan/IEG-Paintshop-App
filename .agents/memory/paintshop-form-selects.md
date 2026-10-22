---
name: Paintshop form select compatibility
description: Why asynchronous React Hook Form selectors use native controls in Paint Usage.
---

Prefer controlled native select fields for asynchronous React Hook Form inputs here rather than introducing Radix hidden form selects again.

**Why:** A signed-in, two-role browser demo exposed a React DOM removal exception in Radix SelectBubbleInput that blocked Paint Usage. It reproduced with both Radix Select 2.3.7 and 2.2.6, so a version downgrade alone did not resolve it. Native controlled fields allowed the same job to finish without bypassing workflow validation.

**How to apply:** Preserve React Hook Form refs, controlled values, accessible labels, loading states, and dependent SN resets. When changing selector dependencies, verify the signed-in form itself rather than treating a successful build as proof of runtime compatibility.
