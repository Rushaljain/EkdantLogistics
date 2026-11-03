# Ekdant Logistics — Custom Freight Document & Multi-Container Conversion Engine
## Master Plan & Product Requirements Document (PRD)

> **Project Scope:** Transitioning from legacy ICEGATE EDI filing to an intelligent, multi-container shipment planning, Dangerous Goods (#DG), and Master Bill of Lading (BOL) custom document generation platform.

---

## 1. Executive Summary & Product Vision
The **Ekdant Logistics Document Converter** is an AI-powered B2B web application designed to streamline freight forwarding operations. When commercial invoices and packing lists arrive as unstructured multi-page PDFs (such as industrial battery shipments weighing 22+ metric tons), the system automates the entire logistical workflow: extracting data, calculating container and pallet distribution across multiple containers, flagging hazardous/Dangerous Goods (#DG), and generating client-specific Master BOLs and compliance declarations.

---

## 2. Product Requirements Document (PRD)

### 2.1 User Personas
* **Freight Forwarder / Operations Operator:** Manages daily high-volume client invoices, verifies extracted line items, checks gross/net weights, and ensures container compliance.
* **Customs Broker / Documentation Specialist:** Oversees statutory compliance, pallet segregation, hazardous goods documentation (#DG), and client-specific BOL formatting.

### 2.2 Core Functional Requirements
1. **Multi-File PDF Ingestion:** Drag-and-drop zone supporting simultaneous upload of commercial invoices and packing lists.
2. **AI Vision Extraction (Gemini Flash):** Multimodal extraction of line items, item descriptions, quantities, unit weights (net/gross), pallet numbers, and hazmat properties (IMO Class, UN Number, Packing Group) with a robust 25s timeout and model fallback.
3. **Shipment Planning & Containerization Engine:**
   * Automatically calculates cargo footprint across weight limits (e.g., 20'FT / 40'FT container payload constraints), CBM volume, and pallet counts.
   * Handles multi-container segregation for large shipments.
4. **Template Management & Custom Layouts:**
   * Client settings panel to upload and store proprietary master templates (BOL and #DG formats).
   * Dynamic field mapping ensuring generated documents match exact corporate layouts.
5. **Human-in-the-Loop (HITL) Split-Screen Review:**
   * Side-by-side PDF preview carousel and editable structured data grid.
   * Real-time weight and math reconciliation banners.
6. **Multi-Document Generation:**
   * One-click generation of compliant **#DG Declarations** and **Master Bills of Lading (BOL)**.

### 2.3 Non-Functional Requirements
* **Performance:** AI extraction completed in under 5 seconds per invoice page.
* **Security:** Secure client-side API key management and encrypted database storage via Supabase.
* **UI/UX:** High-density, zero-lag React/Tailwind interface tailored for professional logistics operators.

---

## 3. End-to-End Operational Workflow
1. **Upload:** User drags and drops invoice and packing list PDFs into the dashboard.
2. **Ingest & Extract:** Gemini Vision extracts all line items, quantities, and weight metrics.
3. **Normalize & Segregate:** System processes weights, pallets (`5644-5655`), and hazmat flags.
4. **Allocate:** Containerization engine maps cargo to optimal container counts (e.g., 1x20'FT).
5. **Generate:** System compiles data into custom-templated #DG declarations and Master BOLs.
