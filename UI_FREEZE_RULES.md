# Hard Rule: Logic & Core Backend Freeze (UI Focus Only)

## 1. Absolute Code Freeze on Core Logic & Backend
Under NO circumstances should any modifications be made to the following files or their underlying business logic, parsers, extractors, mathematical invariants, or keyword engines:
- `src/utils/documentParser.ts`
- `src/utils/manifestKeywordReference.ts`
- `src/utils/manifestMatcher.ts`
- `src/utils/formatParser.ts`
- `src/utils/spreadsheetPreFilter.ts`
- `src/types/index.ts`

### Invariants Protected:
- **Zero-Hardcoding Mandate:** No test-company tokens or dataset-specific strings.
- **Strict VGM Invariant:** Total gross including tare (`grossWeightKg + tareWeightKg`) only computes when both values are greater than 0.
- **IMDG Regulatory Lookups & Pallet Range Synthesis:** Logic remains immutable.
- **Deterministic State Normalization (`normalizeShipmentState`):** Remains untouched.

---

## 2. Permitted Scope: Frontend UI/UX Design & Presentation Only
All ongoing and upcoming work is strictly restricted to:
- **Styling & Theming:** Tailwind classes, CSS styles, colors, typography, spacing, shadows, borders.
- **Component Layout & Presentation:** Rearranging visual panels, tabs, modals, stepper cards, buttons, badges, icons, responsive grid systems.
- **User Experience (UX):** Tooltips, micro-animations, loading indicators, visual empty states, preview container sizing.
- **Print & Viewport Layouts:** CSS `@media print` aesthetics, zoom controls, viewer container wrappers.

---

## 3. Enforcement
Any request or task that requires altering data flow, extraction schemas, API call logic, or mapping resolvers must be flagged and rejected in favor of UI-layer adjustments.
