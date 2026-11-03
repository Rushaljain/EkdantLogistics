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
| **Phase 5** | `VISUAL-QC-BOARD` | **Table-Based Visual Container QC & Drag-and-Drop Editor** | • Create `ContainerQcBoard.tsx` with vertical column tables for each container<br>• Interactive HTML5 draggable pallet cards with item model (`EFB70-S95-D26L - Lead Acid Batteries`), gross weight, package count, and UN number<br>• Real-time column footer metrics: Gross Weight vs 25T cap, Pallet Floor count vs 11-pallet cap, dual progress bars<br>• Instant constraint violation detection & inline warning banners<br>• Sticky footer with "Lock Shipment Plan & Generate Documents" action button | ✅ **Completed** |
| **Phase 6** | `TEMPLATE-MGMT` | **Template Management & Custom Layouts** | • Dynamic template selector dropdown in header/action bar<br>• Client template schema definition & field mapping engine<br>• Custom header/logo injection for client-specific BOLs | 🟡 **In Progress** |
| **Phase 7** | `DEPLOYMENT` | **Deployment & CI/CD Verification** | • Fix Vercel integration provisioning failure<br>• Ensure zero TypeScript errors (`tsc -b && vite build`)<br>• Live on Vercel and pushed to GitHub `main` | ✅ **Completed** |

---

## Detailed Task Breakdown

### 1. Ingestion & AI Parsing (`geminiExtractor.ts`)
- [x] Multi-file invoice and packing list upload support.
- [x] Gemini Flash prompt extraction with 25s timeout fallback.
- [x] Automated detection of Dangerous Goods / HazMat including industrial lead-acid batteries (UN 2794, Class 8 Corrosive, PG III).
- [x] Automated initial LAFF allocation (20' GP, 25T payload limit, 11-pallet floor limit).

### 2. Multi-Container Segregation (`containerOptimizer.ts` & `containerAllocator.ts`)
- [x] LAFF (Largest Weight / Area Fit First) pallet sorting heuristic (heaviest & largest pallets first).
- [x] Strict 25-ton (25,000 kg) payload capacity enforcement for 20' General Purpose containers.
- [x] Strict 11-pallet ($1200 \times 1000\text{ mm}$) floor footprint limit enforcement.
- [x] Automated spillover container provisioning (e.g. 12 pallets totaling 22,620 kg splits into Container #1 with 11 pallets and Container #2 with 1 spillover pallet).
- [x] Realistic ISO 6346 container number and high-security seal generation (`TEMU2523270`, `EMC883921`).

### 3. Visual QC Board & Drag-and-Drop Editor (`ContainerQcBoard.tsx`)
- [x] Vertical column table layout rendering each container with container number, seal number, tare weight, and container type.
- [x] Draggable pallet cards displaying pallet number (`Pallet #5644`), gross weight (`1,885 kg`), and product model (`EFB70-S95-D26L - Lead Acid Batteries`).
- [x] Real-time column footer metrics: Gross Weight vs 25T cap, Pallet Floor count vs 11-pallet cap, dual progress bars.
- [x] Drag-and-drop validation with real-time recalculation across both affected containers and inline violation alerts.
- [x] Prominent "Lock Shipment Plan & Generate Documents" action button at the bottom of the QC board.

### 4. Document Generation (`bolGenerator.ts` & `dgGenerator.ts`)
- [x] Dangerous Goods Multimodal Declaration generation matching IMO/IMDG standards with UN 2794 Battery support.
- [x] Master Bill of Lading (BOL) structured document generation with multi-container summary.
- [x] One-click direct download and interactive print rendering for both documents.
