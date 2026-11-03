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
| **Phase 5** | `UI-DASHBOARD` | **HITL Dashboard & Container Breakdown Card** | • Prominent Container Breakdown Summary Card displaying pallet count, gross weight, and spillover badges<br>• Dual real-time utilization meters: Payload Weight (vs 25T cap) & Floor Footprint (vs 11-pallet cap)<br>• Direct download buttons for #DG Declaration & Master BOL in top action bar and breakdown card<br>• Individual pallet breakdown cards with ISO dimensions and HazMat tags | ✅ **Completed** |
| **Phase 6** | `TEMPLATE-MGMT` | **Template Management & Custom Layouts** | • Dynamic template selector dropdown in header/action bar<br>• Client template schema definition & field mapping engine<br>• Custom header/logo injection for client-specific BOLs | 🟡 **In Progress** |
| **Phase 7** | `DEPLOYMENT` | **Deployment & CI/CD Verification** | • Fix Vercel integration provisioning failure<br>• Ensure zero TypeScript errors (`tsc -b && vite build`)<br>• Verify production deployment readiness on Vercel | ✅ **Completed** |

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

### 3. Document Generation (`bolGenerator.ts` & `dgGenerator.ts`)
- [x] Dangerous Goods Multimodal Declaration generation matching IMO/IMDG standards with UN 2794 Battery support.
- [x] Master Bill of Lading (BOL) structured document generation with multi-container summary.
- [x] One-click direct download and interactive print rendering for both documents.

### 4. Human-In-The-Loop (HITL) UI (`PreviewPane.tsx`)
- [x] Full-width modern top header with view mode switcher.
- [x] Container Breakdown Summary Card displaying high-level container distribution at a glance.
- [x] Dual utilization meters: Payload Weight (% of 25T) and Floor Footprint (% of 11 pallets).
- [x] Distinct visual badges for Main Container vs Spillover Container.
- [x] Quick action buttons for running 20' LAFF Solver, direct BOL download, and direct #DG download.
