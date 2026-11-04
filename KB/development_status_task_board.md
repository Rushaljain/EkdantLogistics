# Ekdant Logistics — Development Status & Task Board

> **Workflow Focus:** Multi-Invoice Ingestion ➔ Weight & Pallet Segregation across Multiple Containers ➔ #DG Document Generation ➔ Master Bill of Lading (BOL) Generation using Custom Templates.

---

## Task Board & Implementation Progress

| Phase | Task ID | Task Description | Sub-Tasks & Deliverables | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | `LEGACY-PRUNE` | **Codebase Pruning & Legacy Removal** | • Delete `ediCompiler.ts` and `icegateEdiCompiler.ts`<br>• Delete `excelCompiler.ts` and `chaExcelExporter.ts`<br>• Prune obsolete ICEGATE filing types and modals<br>• Prune unused database dependencies (`@prisma/client`, `@supabase/supabase-js`, `prisma`) and `schema.prisma` | ✅ **Completed** |
| **Phase 2** | `DOMAIN-MODELS` | **Domain Models & Type Definitions** | • Update `src/types/index.ts` with Container, Pallet, and LineItem weight/dimension fields<br>• Add Dangerous Goods attributes (`imoClass`, `unNumber`, `packingGroup`, `properShippingName`)<br>• Define `ContainerAllocation` and `MultiContainerPlan`<br>• Add `DocumentTemplate` and `DocumentOutput` models | ✅ **Completed** |
| **Phase 3** | `CONTAINER-OPTIMIZER` | **LAFF Solver & Containerization Engine** | • Implement `src/utils/containerOptimizer.ts` with LAFF (Largest Weight / Area Fit First) heuristic<br>• Enforce strict 25-ton (25,000 kg) payload caps for 20' containers<br>• Enforce 20' container floor footprint cap (maximum 11 standard 1200x1000mm pallets)<br>• Automated multi-container spillover allocation (Container #1, Container #2) with ISO container serial generation (`TEMU2523270`)<br>• Wire LAFF solver into `containerAllocator.ts` and `geminiExtractor.ts` | ✅ **Completed** |
| **Phase 4** | `HAZMAT-DOCS` | **#DG & Master BOL Document Pipeline** | • IMO/IMDG-compliant Dangerous Goods Declaration renderer (`dgGenerator.ts`) supporting UN 2794 Class 8 PG III lead-acid battery consignments<br>• Master Bill of Lading document compiler (`bolGenerator.ts`) with multi-container summary<br>• One-click direct HTML/PDF export actions for #DG & Master BOL | ✅ **Completed** |
| **Phase 5** | `VISUAL-QC-BOARD` | **Table-Based Visual Container QC & Drag-and-Drop Editor** | • Create `ContainerQcBoard.tsx` with vertical column tables for each container<br>• Interactive HTML5 draggable pallet cards<br>• Real-time column footer metrics: Gross Weight vs 25T cap, Pallet Floor count vs 11-pallet cap, dual progress bars<br>• Instant constraint violation detection & inline warning banners<br>• Sticky footer with "Lock Shipment Plan & Generate Documents" action button | ✅ **Completed** |
| **Phase 6** | `EXPAND-PALLETS` | **Multi-Pallet Dynamic Expansion & Serial Mapping** | • Dynamic expansion of multi-pallet ranges (e.g., Exide `CHW000263` pallets `5644` to `5655`) into distinct pallet entities (`PLT-5644` through `PLT-5655`)<br>• Correct LAFF allocation: Container #1 (`TEMU2523270`) takes 11 pallets (20,735 kg, 82.9% weight, 100% floor limit), Container #2 (`TEMU4198205`) takes 1 spillover pallet (1,885 kg)<br>• Individual pallet serial numbers listed in Master BOL and #DG Declaration | ✅ **Completed** |
| **Phase 7** | `UNIFIED-BLOCK-LIST` | **Unified Cross-Document Block List & UI Cleanup** | • Draggable cards in `ContainerQcBoard.tsx` explicitly display all unified attributes: Pallet ID, Net & Gross weight side-by-side, Item Model, Box count, and UN 2794 HazMat badges<br>• Full UI cleanup: All legacy EDI, ICEGATE, and spreadsheet export buttons pruned from `PreviewPane.tsx` and toolbars; strictly retain Master BOL & #DG Declaration<br>• Multi-invoice batching: Deduplicated file upload ingestion + batch consolidation into unified Master Shipment | ✅ **Completed** |
| **Phase 8** | `MUMGA-SHIPMENT` | **Exide Shipment MUMGA3747500 Allocation & #DG/BOL Generation** | • Configured Exide Myanmar export shipment (`Booking: MUMGA3747500`, Container `ONEU2878769`, Seal `IN2191248`)<br>• Expanded all 22 pallets across 676 corrugated boxes across 5 invoices (`CHW000213`, `CHW000213A`, `CHW000165B`, `TAL000172`, `TAL000172A`)<br>• Ingested 5 pallet serial ranges: `4956 TO 4963`, `4964`, `4533 TO 4546`, `TAL/1703/2026 TO TAL/1705/2026`, `TAL/1706/2026 TO TAL/1709/2026`<br>• Enforced 25-ton weight cap: Net `17,917.70 kg`, Gross `18,502.70 kg`, Tare `2,150 kg`, Total VGM `20,652.70 kg` (74.0% payload utilization, within 25T cap)<br>• Generated compliant IMDG #DG Declaration & Master BOL with Shipping Bill `7463800`, Declarant `Sujoy Dutta / Export Manager`, Emergency Contact `Mr. Sujoy Dutta (+91-9729899131)`, UN Packaging `4G/Z 30/S/IND/K/19700134`, Segregation `SGG1`, and EMS `F-A, S-B` | ✅ **Completed** |
| **Phase 9** | `TEMPLATE-MGMT` | **Template Management & Custom Layouts** | • Dynamic template selector dropdown in header/action bar<br>• Client template schema definition & field mapping engine<br>• Custom header/logo injection for client-specific BOLs | 🟡 **In Progress** |
| **Phase 10** | `DEPLOYMENT` | **Deployment & CI/CD Verification** | • Fix Vercel syntax compilation error in `PreviewPane.tsx`<br>• Verified clean build with `npx vercel build` (Exit code 0)<br>• Ensure zero TypeScript errors (`tsc -b && vite build`)<br>• Live on Vercel and pushed to GitHub `main` (`0d1b9cd`) | ✅ **Completed** |

---

## Detailed Task Breakdown

### 1. Ingestion & Multi-Invoice Batching (`geminiExtractor.ts` & `App.tsx`)
- [x] Multi-file invoice and packing list upload support.
- [x] Deduplication of batch file uploads by name and size to prevent duplicate records in state.
- [x] Batch consolidation engine: merges 2+ invoices into a single unified shipment with automatic LAFF re-allocation.
- [x] Gemini Flash prompt extraction with 25s timeout fallback.
- [x] Automated detection of Dangerous Goods / HazMat including industrial lead-acid batteries (UN 2794, Class 8 Corrosive, PG III).

### 2. Multi-Container Segregation (`containerOptimizer.ts` & `containerAllocator.ts`)
- [x] LAFF (Largest Weight / Area Fit First) pallet sorting heuristic (heaviest & largest pallets first).
- [x] Strict 25-ton (25,000 kg) payload capacity enforcement for 20' General Purpose containers.
- [x] Strict 11-pallet ($1200 \times 1000\text{ mm}$) floor footprint limit enforcement.
- [x] Automated spillover container provisioning (e.g. 12 pallets totaling 22,620 kg splits into Container #1 with 11 pallets and Container #2 with 1 spillover pallet).
- [x] Double-tier vertical loading support for qualified cargo (up to 22 pallets within 25T payload limit, e.g. Container `ONEU2878769` at 18,502.70 kg / 74% payload).
- [x] Realistic ISO 6346 container number and high-security seal generation (`TEMU2523270`, `EMC883921`, `ONEU2878769`, `IN2191248`).

### 3. Visual QC Board & Unified Block List (`ContainerQcBoard.tsx`)
- [x] Vertical column table layout rendering each container with container number, seal number, tare weight, and container type.
- [x] Unified draggable pallet blocks explicitly showing:
  - Pallet ID (`PLT-5644`, `PLT-4956`, etc.)
  - Gross Weight and Net Weight side-by-side (`Gross: 1,885 kg | Net: 1,860 kg`)
  - Item Model (`EFB70-S95-D26L`, `FDC7-DMX105D31R-W - Lead Acid Batteries`)
  - Package / Box count (`40 BOX`, `51 BOX`, etc.)
  - UN 2794 HazMat Badges (`UN 2794`, `Cl. 8`, `PG III`)
- [x] Real-time column footer metrics: Gross Weight vs 25T cap, Pallet Floor count vs capacity, dual progress bars.
- [x] Drag-and-drop validation with real-time recalculation across both affected containers and inline violation alerts.
- [x] Prominent "Lock Shipment Plan & Generate Documents" action button at the bottom of the QC board.

### 4. Shipment MUMGA3747500 Processing & Compliance Documents (`bolGenerator.ts`, `dgGenerator.ts`, `profiles.ts`)
- [x] Complete mapping of Exide export consignment (`Booking: MUMGA3747500`, Container `ONEU2878769`, Seal `IN2191248`).
- [x] Pallet serial ranges mapped across 22 pallets (676 boxes): `4956 TO 4963`, `4964`, `4533 TO 4546`, `TAL/1703/2026 TO TAL/1705/2026`, `TAL/1706/2026 TO TAL/1709/2026`.
- [x] Gross weight `18,502.70 kg`, Net weight `17,917.70 kg`, Container tare `2,150.00 kg`, Verified Gross Mass (VGM) `20,652.70 kg`.
- [x] Dangerous goods declaration with UN 2794, Class 8 Corrosive, PG III, Proper Shipping Name "BATTERIES, WET, FILLED WITH ACID", UN Packaging Code `4G/Z 30/S/IND/K/19700134`, Segregation Group `SGG1`, and EMS `F-A, S-B`.
- [x] Declarant authorized signatory Sujoy Dutta (Export Manager, Exide Industries Ltd) and 24/7 Emergency Contact Mr. Sujoy Dutta (+91-9729899131).
- [x] Master BOL citing Shipping Bill No. 7463800 (dated 07.10.2026), 5 invoice cross-references, ONE Line carrier routing (Nhava Sheva INNSA1 to Yangon MMRGN via Singapore).

### 5. Production CI/CD & Vercel Build Verification (`PreviewPane.tsx`, `package.json`)
- [x] Identified and fixed duplicate JSX closing tags and orphan buttons in `PreviewPane.tsx` that caused TypeScript compilation failure (`exit code 2`) on full clean build (`tsc -b`).
- [x] Verified local full production build (`tsc -b && vite build`) and Vercel CLI simulation (`npx vercel build`) pass with 0 errors.
- [x] Linter (`oxlint`) passes cleanly with 0 warnings and 0 errors across 20 files.
- [x] Pushed clean commit `0d1b9cd` to `origin/main` to trigger clean Vercel deployment.
