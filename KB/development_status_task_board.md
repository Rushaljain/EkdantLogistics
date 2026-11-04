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
| **Phase 8** | `TEMPLATE-MGMT` | **Template Management & Custom Layouts** | • Dynamic template selector dropdown in header/action bar<br>• Client template schema definition & field mapping engine<br>• Custom header/logo injection for client-specific BOLs | 🟡 **In Progress** |
| **Phase 9** | `DEPLOYMENT` | **Deployment & CI/CD Verification** | • Fix Vercel integration provisioning failure<br>• Ensure zero TypeScript errors (`tsc -b && vite build`)<br>• Verified build passes cleanly in production<br>• Live on Vercel and pushed to GitHub `main` | ✅ **Completed** |

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
- [x] Realistic ISO 6346 container number and high-security seal generation (`TEMU2523270`, `EMC883921`).

### 3. Visual QC Board & Unified Block List (`ContainerQcBoard.tsx`)
- [x] Vertical column table layout rendering each container with container number, seal number, tare weight, and container type.
- [x] Unified draggable pallet blocks explicitly showing:
  - Pallet ID (`PLT-5644`)
  - Gross Weight and Net Weight side-by-side (`Gross: 1,885 kg | Net: 1,860 kg`)
  - Item Model (`EFB70-S95-D26L - Lead Acid Batteries`)
  - Package / Box count (`40 BOX`)
  - UN 2794 HazMat Badges (`UN 2794`, `Cl. 8`, `PG III`)
- [x] Real-time column footer metrics: Gross Weight vs 25T cap, Pallet Floor count vs 11-pallet cap, dual progress bars.
- [x] Drag-and-drop validation with real-time recalculation across both affected containers and inline violation alerts.
- [x] Prominent "Lock Shipment Plan & Generate Documents" action button at the bottom of the QC board.

### 4. Document Generation & UI Export Cleanup (`PreviewPane.tsx`, `bolGenerator.ts`, `dgGenerator.ts`)
- [x] Dangerous Goods Multimodal Declaration generation matching IMO/IMDG standards with UN 2794 Battery support.
- [x] Master Bill of Lading (BOL) structured document generation with multi-container summary.
- [x] Full list of individual pallet serial numbers per container explicitly printed in BOL and #DG documents.
- [x] Full UI cleanup: All legacy EDI, ICEGATE, and spreadsheet export buttons removed; strictly retain Master BOL & #DG Declaration.
