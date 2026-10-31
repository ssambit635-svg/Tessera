# Raycast - Your shortcut to everything

## Overview

**Product:** Raycast - Your shortcut to everything
**URL:** https://www.raycast.com/
**Surface type:** marketing
**Audience:** Business decision-makers and potential customers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and a complementary two-font typographic system.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| --color-bg-400 | `#494B4D` | Background |
| --color-fg-400 | `#5E6366` | Text Primary |
| --color-fg-300 | `#78787C` | Text Secondary |
| --color-red | `#FF6161` | Accent |
| --color-blue | `#57C1FF` | Accent |
| --color-green | `#59D499` | Accent |
| --color-yellow | `#FFC533` | Accent |
| --color-step-2 | `#D3B2FF` | Text Light |
| --color-fg-200 | `#C2C7CA` | Text Light |
| --color-fg | `#F4F4F6` | Text Light |
| color-12 | `#E6E6E6` | Surface |
| color-1 | `#2F3031` | Text Primary |
| color-6 | `#9C9C9D` | Text Secondary |
| color-14 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** Inter, GeistMono

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 14px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 18px | Subheadings, emphasis |
| text-xl | 64px | Section headings |

**Weight scale:** 400 · 500 · 600
**Line heights:** 70.4px · 19.2px · 16.1px · 16px · 18.4px

## Spacing

**Base unit:** 4px

`space-1: 1px` · `space-2: 4px` · `space-3: 8px` · `space-4: 12px` · `space-5: 16px` · `space-6: 24px` · `space-7: 25px` · `space-8: 32px` · `space-9: 40px` · `space-10: 72px` · `space-11: 76px` · `space-12: 212px` · `space-13: 224px` · `space-14: 370px`

## Shapes

**Border radius:** `radius-sm: 4px` · `radius-md: 6px` · `radius-lg: 8px` · `radius-xl: 16px` · `radius-full: 43px` · `radius-6: 1000px`

## Elevation

- **shadow-sm:** `rgba(0, 0, 0, 0.5) 0px 0px 0px 2px, rgba(255, 255, 255, 0.19) 0px 0px 14px 0px, rgba(0, 0, 0, 0.2) 0px -1px 0.4px 0px inset, rgb(255, 255, 255) 0px 1px 0.4px 0px inset`
- **shadow-md:** `rgba(255, 255, 255, 0.15) 0px 1px 1px 0px inset`
- **shadow-lg:** `rgba(245, 48, 107, 0.1) 0px 0px 20px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-base:** `color 0.2s`
- **duration-base:** `0.2s ease-in-out`
- **duration-base:** `background-image 0.2s, background-color 0.2s, box-shadow 0.2s ease-in-out, transform 0.1s ease-in-out`
- **duration-base:** `transform 0.2s`
- **duration-base:** `0.2s`
- **duration-base:** `height 0.3s, transform 0.3s`
- **duration-slow:** `1s 1s forwards H3BVAa_fade-in-up`
- **duration-slow:** `1s forwards H3BVAa_fade-in-up`

## Components

- **Buttons:** 27 detected
- **Links:** 134 detected
- **Inputs:** 2 detected
- **Lists:** 1 detected
- **Tables:** 1 detected
- **Forms:** 1 detected
- **Images:** 286 detected

## Do's and Don'ts

### Do

- Reference tokens by name, not raw values — agents and developers should use `color.text.primary`, not `#171717`.
- Define all interactive states: default, hover, focus-visible, active, disabled.
- Use the spacing scale for all padding, margin, and gap values.
- Write content in sentence case. Reserve ALL CAPS for acronyms only.
- Test every component at the smallest and largest breakpoint before shipping.

### Don't

- Do not introduce colors outside the extracted palette.
- Do not use arbitrary spacing values — stick to the scale.
- Do not mix border-radius values. Pin to the detected set (4px, 6px, 8px, 16px, 43px, 1000px).
- Do not use full-uppercase text for body or paragraph content.
- Do not nest interactive elements (e.g. buttons inside links).
- Do not ship components without defining hover, focus-visible, and disabled states.

## Writing Tone

Concise, confident, implementation-focused. Avoid filler preambles.

## Authoring Workflow

When creating or updating a component guideline for this system, follow this sequence:

1. **State the intent** — one sentence on what the component does and why it exists.
2. **Map tokens** — list every color, spacing, typography, and radius token the component uses. No raw values.
3. **Define anatomy** — break the component into named parts (container, label, icon, etc.) with their token assignments.
4. **Specify states** — document every state: default, hover, focus-visible, active, disabled, loading, error, empty.
5. **Describe interactions** — keyboard, pointer, and touch behavior, including edge cases (long content, overflow, truncation).
6. **Add accessibility criteria** — write testable pass/fail checks (e.g. "focus ring must be visible at 3:1 contrast").
7. **List anti-patterns** — concrete examples of misuse with a brief explanation of why each is wrong.
8. **Close with a QA checklist** — a mechanical list of verifiable items (see Definition of Done below).

## Required Output Structure

Every component guideline produced from this system must contain these sections, in order:

1. Overview — purpose, when to use, when not to use.
2. Tokens and foundations — all referenced tokens from the tables above.
3. Anatomy and variants — named parts, variant matrix, responsive behavior.
4. States and interactions — full state table, keyboard/pointer/touch behavior.
5. Accessibility — ARIA attributes, contrast requirements, focus management, screen reader behavior.
6. Content guidelines — copy length, tone, capitalisation, placeholder text rules.
7. Anti-patterns — explicit examples of what not to build, with reasoning.

## Component Requirements

Every component built against this system must:

- Reference only tokens defined in the tables above — no hardcoded hex, px, or font values.
- Define all interactive states: default, hover, focus-visible, active, disabled, loading, error.
- Specify responsive behavior at the smallest and largest supported breakpoint.
- Handle edge cases: empty state, overflow / truncation, maximum content length.
- Include keyboard navigation (Tab, Enter, Escape, Arrow keys where applicable).
- Document ARIA roles, labels, and live-region behavior where relevant.
- Include known page component density: - **Buttons:** 27 detected
- **Links:** 134 detected
- **Inputs:** 2 detected
- **Lists:** 1 detected
- **Tables:** 1 detected
- **Forms:** 1 detected
- **Images:** 286 detected

## Definition of Done

A component is not complete until every item below is checked:

- Renders correctly in its default state (smoke test).
- All states documented and visually verified (hover, focus, disabled, loading, error, empty).
- All visual values use design tokens — zero hardcoded values.
- Keyboard navigation works without a pointer.
- No critical accessibility violations (contrast, ARIA, focus order).
- Tested at smallest and largest breakpoint.
- Anti-patterns section lists at least one concrete misuse example.
- Documentation covers purpose, usage, props/API, and limitations.
