# T-038 : bookmark/embed have no unfurl, and search returns no snippet

status: open
module: M5 docs engine
owns: src/pages/api/unfurl/**, src/lib/services/unfurl*, src/lib/services/search*, src/db/fts.ts, tests/api/unfurl*, tests/api/search*
depends-on: T-007
assignee: none

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Two consumer-facing gaps the T-007 review found. Both are real requirements in
the specs, and neither is one of §3.6's ten endpoints, which is why T-007 did
not build them. Filing rather than leaving them for a UI ticket to discover.

## 1. Nothing fetches bookmark or embed metadata

architecture §2.6:

```
| bookmark | {url, title, description, icon} (fetched server-side, size-capped) |
```

ux-spec ED-08: "**bookmark/embed**: URL input inline, server fetch
(title/description/icon; size-capped) with `dither-pulse` placeholder".

T-007 requires all four fields from the client and fetches nothing. §3.6 lists
no unfurl route, so the endpoint has no home in the current API surface, and
the block editor (T-009) owns no `src/pages/api/**` and cannot add one.

**This needs a security design before any code.** A server that fetches a
client-supplied URL is an SSRF primitive. At minimum: deny private and
loopback address ranges after DNS resolution rather than by string matching,
refuse redirects to a denied range, cap the response body and the total time,
allow only http and https, and never surface the fetch error text to the
caller. The security law applies; load the audit skill before starting.

Consider whether the deterministic-AI posture in §6.2 (everything offline, no
network) makes an outbound fetch the wrong answer entirely. If it does, the
honest fix is to amend §2.6 and ED-08 to say the client supplies the metadata,
and to say why.

## 2. Search results carry no snippet and no block anchor

ux-spec §4.19:

- SR-03: "page rows show icon + title + **block snippet**", and issue rows show
  "snippet with **matched terms highlighted**".
- SR-04: "pages open R-23 (deep link `?block=` when the match is a block, the
  snippet's block anchor)".

`SearchHitDto` carries `entityType, entityId, title, score, identifier, icon,
updatedAt`. There is no snippet and no block id, so S-19 cannot render SR-03
and cannot build the SR-04 deep link.

FTS5 provides `snippet()` and `highlight()` and neither is used. Note the index
stores a page's whole body as one concatenated string, so a snippet locates the
text but not which block it came from. Producing the `?block=` anchor needs
either a per-block index or a second lookup that finds the matching block by
text. Decide which and write down why.

§4.19 is not in T-007's `docs-to-read`, which is why this was out of scope
there. It is in T-008's.

## Acceptance

- If the unfurl endpoint ships: it refuses private, loopback and link-local
  destinations after resolution, refuses a redirect into one, caps body size and
  wall-clock, and has tests for each refusal. If it does not ship, the spec
  amendment is written instead, with its reasoning.
- Search results carry a snippet with match offsets, and page hits carry the
  block id when the match came from block text.
- A search ranking test still passes with at least 20 filler documents, per the
  measurement recorded in T-007's work log.
- All four gates green.

## Work log

(empty)
