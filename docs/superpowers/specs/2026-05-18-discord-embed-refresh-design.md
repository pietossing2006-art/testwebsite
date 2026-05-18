# Discord Embed Refresh Design

Date: 2026-05-18
Status: Drafted and validated with user feedback

## Goal

Refresh the Discord embed presentation across the whole system so it feels more premium and brand-consistent, while preserving the existing interaction flow and business behavior.

The target visual direction is:

- Luxury gaming
- Premium but restrained
- System-wide consistency instead of one-off visual tweaks

## Scope

This design covers the Discord embed layer centered in [server/lib/discord/shared/context.js](C:\Users\Administrator\Desktop\splitwise\server\lib\discord\shared\context.js), plus the most visible user-facing embed consumers in:

- [server/lib/discord/commands/globalpanel.js](C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\globalpanel.js)
- [server/lib/discord/commands/topups.js](C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\topups.js)

The work will improve:

- Base embed styling defaults
- Semantic embed variants
- Panel and transactional embed hierarchy
- Readability of repeated embeds such as order cards

The work will not change:

- Slash command behavior
- Permissions and auth checks
- Ephemeral vs non-ephemeral behavior
- Modal flow
- Topup, wallet, password, or points business logic

## Current State

The codebase already has a helpful central abstraction:

- `buildEmbed()` provides the base wrapper
- `successEmbed()`, `errorEmbed()`, `infoEmbed()`, and `warningEmbed()` provide semantic colors
- `buildOrdersEmbeds()` assembles repeated order embeds

This is a good foundation, but the visual system is still relatively flat:

- Panels and transactional responses often share similar structure
- Important next steps are sometimes visually equal to supporting text
- The palette is functional but not strongly branded
- Some embeds feel more like raw data blocks than curated UI surfaces

## Design Principles

### 1. Premium without being flashy

The system should feel polished and intentional, not noisy. The user selected a premium style with moderate visual intensity, so the design should avoid over-saturated colors, excessive decorative markers, or dense formatting tricks.

### 2. One brand language across all embeds

Users should be able to recognize that every success, warning, panel, and order card belongs to the same product family. This requires a stronger shared structure and more deliberate use of colors, spacing, and content hierarchy.

### 3. Readability first

Discord embeds can become hard to scan quickly, especially on mobile. Titles, descriptions, fields, and footers should be arranged to make the most important action or state obvious at a glance.

### 4. Centralized styling decisions

Most presentation logic should remain in the shared Discord context so future brand updates do not require touching many command files.

## Proposed Visual System

### Palette direction

The refreshed palette should lean toward:

- Deep navy and dark steel undertones for premium weight
- Electric blue for primary emphasis
- Controlled gold or warm amber accents for highlight moments
- Cleaner semantic states for success, warning, and danger

The intent is not to simulate a dark-mode embed background, since Discord controls that surface, but to make the visible accents and content rhythm feel more premium.

### Content hierarchy

Each embed should communicate in layers:

1. Immediate purpose
2. Current state or key value
3. Required next action
4. Supporting details

This means:

- Titles should stay concise and role-oriented
- Descriptions should lead with the value proposition or state
- Fields should avoid duplicating title text
- Footers should feel branded and consistent, not generic filler

### Media usage

Images and thumbnails should be used intentionally:

- Thumbnail for identity, branding, or item recognition
- Main image for panels or QR-driven flows where the image supports the action
- Avoid attaching media when it adds no informational or visual value

## Structural Design

### Layer 1: Base branded embed

`buildEmbed()` will remain the base primitive, but it should become a branded foundation rather than just a thin wrapper.

Expected responsibilities:

- Stable timestamp behavior
- Shared footer conventions
- Cleaner default title and description handling
- Reliable field sanitization and truncation
- Optional support for style-oriented metadata without changing command behavior

### Layer 2: Semantic variants

The current status helpers should stay, but the system should also support more differentiated branded intent. In addition to the current status types, the design should introduce branded variants for presentation-heavy surfaces such as:

- `panel`
- `highlight`
- `orders`

These do not need to be radically different APIs, but they should express clearer intent than reusing generic `info` or `primary` styling for everything.

### Layer 3: Purpose-tuned builders

High-traffic surfaces should get dedicated builder patterns where needed:

- Global panel: brand-forward overview with clear entry points
- Topup panel: action-first guidance with sharper next-step emphasis
- Order embeds: cleaner repeated cards that remain readable in a stack
- Wallet and transactional replies: quick state confirmation with minimal clutter
- Password and verification flows: security-focused, clear, and reassuring

## File-Level Intent

### `server/lib/discord/shared/context.js`

This file remains the source of truth for:

- Palette constants
- Base embed construction
- Semantic helper builders
- Shared layout conventions
- Reusable order embed presentation logic

This file should absorb most visual-system decisions.

### `server/lib/discord/commands/globalpanel.js`

This file should be updated to make the global panel feel like a premium menu surface rather than a generic info card. The embed copy should be tightened and restructured so the panel feels curated and immediately understandable.

### `server/lib/discord/commands/topups.js`

This file should receive targeted hierarchy improvements so the topup panel and topup result embeds guide the user more clearly. The emphasis should be on amount, validity window, verification path, and balance updates.

## Recommended Approach

Implement a full branded embed system, but with controlled intensity.

Why this approach:

- The user explicitly wants a system-wide improvement, not only isolated panel polish
- The code already has a shared embed abstraction, so consistency is practical
- A branded system can improve both appearance and clarity without changing underlying logic

Why not only do a theme swap:

- A palette-only pass would help, but panel and transactional embeds would still feel structurally similar
- The biggest improvement opportunity is the combination of visual polish and clearer hierarchy

Why not push styling further:

- The requested tone is premium, not flashy
- Over-formatting would increase noise and reduce scan speed in Discord

## Risks And Mitigations

### Risk: inconsistent rollout

If only some embed types adopt the new hierarchy, the system may feel uneven.

Mitigation:

- Put brand decisions in shared builders first
- Update the highest-visibility command surfaces in the same pass

### Risk: mobile readability regression

Long descriptions and dense fields can look worse even if the style is nicer.

Mitigation:

- Favor shorter lead copy
- Use fields for distinct values, not paragraphs
- Keep repeated order embeds compact

### Risk: losing semantic clarity

If the visual styling becomes too branded, success vs warning vs danger may be harder to distinguish.

Mitigation:

- Preserve clear semantic color separation
- Use branding to complement status meaning, not replace it

## Verification Strategy

The implementation should be validated by checking:

- Success, warning, info, and error replies still communicate status clearly
- Global panel and topup panel are easier to scan than before
- Order embeds remain readable when multiple embeds are shown together
- QR creation and slip verification responses emphasize the next required action
- No behavior regressions occur in reply, editReply, deferReply, or modal flows

## Acceptance Criteria

The design is successful when:

- The Discord embed system looks visibly more premium and cohesive
- Users can distinguish panel surfaces from transactional replies more easily
- High-value information such as balance, amount, expiry, and command guidance is easier to spot
- Existing bot behavior remains unchanged apart from presentation improvements

## Out Of Scope

The following are intentionally excluded from this design:

- Rewriting Discord interaction flows
- Adding new commands or menu options
- Changing database or topup logic
- Reworking non-embed UI outside the Discord bot

## Implementation Notes For The Next Phase

The next step should convert this design into an implementation plan that:

- Enumerates the shared embed API changes first
- Lists which command-level embeds will be migrated in the initial pass
- Includes verification steps for both visual consistency and runtime behavior
