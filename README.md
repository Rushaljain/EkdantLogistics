# Ekdant Logistics — Multi-Container Dispatch & HazMat Logistics System

An AI-powered split-screen **Human-in-the-Loop (HITL)** logistics workspace built for **Ekdant Logistics** (Licensed Freight Forwarder & Customs Broker, CHA Lic: `11/1892`), operating out of **Jawaharlal Nehru Port Trust / Nhava Sheva (`INNSA1`)** and **Mumbai Air Cargo (`INBOM4`)**.

---

## 1. Core Workflow & Capabilities

The platform automates the end-to-end freight dispatch journey:
**Multi-Invoice Ingestion ➔ Weight & Pallet Segregation across Multiple Containers ➔ #DG (Dangerous Goods) Document Generation ➔ Master Bill of Lading (BOL) Generation using Custom Templates.**

1. **Multi-Invoice Ingestion & AI Vision Extraction**
   - Ingests multiple PDF commercial invoices and packing lists.
   - Extracts quantities, gross/net weights, pallet distributions, and hazardous material flags using **Google Gemini Vision AI** (`gemini-3.5-flash`) with a 25-second timeout and fallback safeguard.
2. **Automated & Interactive Multi-Container Pallet Allocation**
   - Automatically segregates line items into pallets (e.g. `PLT-5644` to `PLT-5655`) and allocates them across standard ISO ocean containers (`20GP`, `40GP`, `40HC`, `45HC`).
   - Validates tare weights and maximum payload capacities (e.g., 26,500 kg for 40HC, 21,700 kg for 20GP), highlighting any overweight conditions.
   - Full drag-and-drop / selector capability to adjust container types, seal numbers, and pallet assignments.
3. **#DG (Dangerous Goods) Document Generation**
   - Automatically detects HazMat cargo (IMO Class, UN Number, Packing Group, Proper Shipping Name, Flash Point, Marine Pollutant).
   - Generates official, printable **IMO Multimodal Dangerous Goods Declarations** complying with SOLAS Chapter VII and IMDG Code Chapter 5.4.
4. **Master Bill of Lading (BOL) Generation with Custom Templates**
   - Generates corporate, print-ready Master BOL documents with container matrix, seal numbers, marks & numbers, weights, and CBM estimates.
   - Supports client and carrier template selection (e.g., Standard Ocean B/L, Maersk Style, MSC Intermodal, Hapag-Lloyd).
5. **Split-Screen HITL Verification & Persistent Archive**
   - Side-by-side zoomable PDF viewer and interactive structured editor.
   - Dedicated **Files Repository** archiving saved shipments with 1-click BOL & #DG downloads and round-trip workspace editing.

---

## 2. Technology Stack

* **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons
* **Data Model & ORM:** Prisma ORM schema (`Shipment`, `Container`, `Pallet`, `LineItem`, `Template`, `DocumentOutput`)
* **AI Vision Engine:** Google Gemini API (`gemini-3.5-flash`) via `@google/generative-ai`
* **Allocation Engine:** Custom ISO Container Allocation & Pallet Segregation Engine (`src/utils/containerAllocator.ts`)
* **Document Generators:** Custom Master BOL Generator (`src/utils/bolGenerator.ts`) and IMO DG Generator (`src/utils/dgGenerator.ts`)
* **Linter & Quality:** Oxlint (Rust-based ultra-fast linter)

---

## 3. Getting Started

### 3.1 Prerequisites
* Node.js v18+ (tested on Node v20/v24)
* npm or pnpm
* Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### 3.2 Installation & Running Locally
```bash
# Clone the repository
git clone https://github.com/Rushaljain/EkdantLogistics.git
cd EkdantLogistics

# Install dependencies
npm install

# Start development server
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3.3 Production Build
```bash
npm run build
npm run preview
```

---

## 4. Repository & Deployment
* **Remote Origin:** `https://github.com/Rushaljain/EkdantLogistics.git`
* **Branch:** `main`
* **Production Deployment:** [ekdant-logistics.vercel.app](https://ekdant-logistics.vercel.app)
