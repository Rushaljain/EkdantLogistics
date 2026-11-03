# Ekdant Logistics — Development Status & Task Board

> **Workflow Focus:** Multi-Invoice Ingestion ➔ Weight & Pallet Segregation across Multiple Containers ➔ #DG Document Generation ➔ Master Bill of Lading (BOL) Generation using Custom Templates.

---

## Task Board & Implementation Progress

| Phase | Task ID | Task Description | Sub-Tasks & Deliverables | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | `LEGACY-PRUNE` | **Codebase Pruning & Legacy Removal** | • Delete `ediCompiler.ts` and `icegateEdiCompiler.ts`<br>• Delete `excelCompiler.ts` and `chaExcelExporter.ts`<br>• Prune obsolete ICEGATE filing types and modals<br>• Prune unused database dependencies (`@prisma/client`, `@supabase/supabase-js`, `prisma`) and `schema.prisma` | ✅ **Completed** |
| **Phase 2** | `DOMAIN-MODELS` | **Domain Models & Type Definitions** | • Update `src/types/index.ts` with Container, Pallet, and LineItem weight/dimension fields<br>• Add Dangerous Goods attributes (`imoClass`, `unNumber`, `packingGroup`, `properShippingName`)<br>• Define `ContainerAllocation` and `MultiContainerPlan`<br>• Add `DocumentTemplate` and `DocumentOutput` models | ✅ **Completed** |
| **Phase 3** | `UI-ARCHITECTURE` | **Preserving & Re-skinning UI Architecture** | • Full-width modern top header<br>• Multi-file upload zone with drag-and-drop<br>• Container & Pallet Allocation Panel with real-time weight meters<br>• Split-screen HITL preview with side-by-side verification<br>• One-click export action buttons for Master BOL & #DG Declaration | ✅ **Completed** |
| **Phase 4** | `CORE-SERVICES` | **Core Services & Utilities Re-base** | • `containerAllocator.ts`: Intelligent cargo segregation across 20'FT / 40'FT containers<br>• `dgGenerator.ts`: IMO/IMDG-compliant Dangerous Goods Declaration renderer<br>• `bolGenerator.ts`: Standard Master Bill of Lading document compiler<br>• `geminiExtractor.ts`: Multimodal line item, weight, and hazmat extraction | ✅ **Completed** |
| **Phase 5** | `TEMPLATE-MGMT` | **Template Management & Custom Layouts** | • Dynamic template selector dropdown in header/action bar<br>• Client template schema definition & field mapping engine<br>• Custom header/logo injection for client-specific BOLs | 🟡 **In Progress** |
| **Phase 6** | `PERSISTENCE` | **Client Repository & Cloud Persistence** | • Browser LocalStorage document & archive management<br>• Supabase cloud sync integration for cross-device persistence<br>• Saved files viewer & re-export capability | 🟡 **In Progress** |
| **Phase 7** | `DEPLOYMENT` | **Deployment & CI/CD Verification** | • Fix Vercel integration provisioning failure<br>• Ensure zero TypeScript errors (`tsc -b && vite build`)<br>• Verify production deployment readiness on Vercel | ✅ **Completed** |

---

## Detailed Task Breakdown

### 1. Ingestion & AI Parsing (`geminiExtractor.ts`)
- [x] Multi-file invoice and packing list upload support.
- [x] Gemini Flash prompt extraction with 25s timeout fallback.
- [x] Extraction of Net/Gross weights, Pallet numbering, and Dangerous Goods properties.
- [ ] Automated packaging reconciliation between Invoice and Packing List.

### 2. Multi-Container Segregation (`containerAllocator.ts`)
- [x] Payload calculation for 20' Standard (21,800 kg limit) and 40' High Cube (26,500 kg limit).
- [x] Pallet segregation and assignment algorithm (`allocateContainers`).
- [x] Real-time container weight capacity validation.
- [ ] Manual drag-and-drop reassignment of line items between containers.

### 3. Document Generation (`bolGenerator.ts` & `dgGenerator.ts`)
- [x] Dangerous Goods Multimodal Declaration generation matching IMO/IMDG standards.
- [x] Master Bill of Lading (BOL) structured document generation.
- [x] Interactive PDF print / download rendering via browser print engine.
- [ ] Custom corporate template upload and dynamic JSON field mapper.

### 4. Human-In-The-Loop (HITL) UI (`App.tsx`, `PreviewPane.tsx`, `CenterColumn.tsx`)
- [x] Clean full-width UI header and streamlined sidebar.
- [x] Split-screen side-by-side PDF preview and editable structured data grid.
- [x] Instant toggle between Master BOL, #DG Document, and Container Breakdown.
- [x] Saved Files repository with persistent search and filter.
