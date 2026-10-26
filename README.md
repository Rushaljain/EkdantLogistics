# Ekdant Logistics — ICEGATE EDI Accelerator MVP

An AI-powered split-screen **Human-in-the-Loop (HITL)** web application and customs technology accelerator built for **Ekdant Logistics** (Licensed Customs Broker CHA Lic: `11/1892`), operating out of **Jawaharlal Nehru Port Trust / Nhava Sheva (`INNSA1`)** and **Mumbai Air Cargo (`INBOM4`)**.

---

## 1. Core Problem & Solution

* **The Problem:** CHA punching operators manually transcribe 30 to 100+ line items per commercial invoice into legacy customs software (Visual Impex, Softlink Logi-Sys), taking 35–45 minutes per shipment and causing costly human errors (HSN mismatches, math drift, ICEGATE queries, demurrage/detention fees).
* **The Solution:** A high-speed HITL workspace that ingests PDF commercial invoices and packing lists, extracts line items with **Google Gemini Vision**, runs deterministic **Indian Customs compliance audits**, enables instant inline corrections, and exports:
  1. **CHA Bulk-Import Spreadsheet (`.xlsx`)** mapped for 1-click import into **Softlink Logi-Sys** and **Visual Impex**.
  2. **Official ICEGATE Remote EDI Flat File (`.sb` / `.be`)** following the **ICES 1.5 standard** with ASCII `0x1D` (Group Separator) delimiters.

---

## 2. Key Customs Compliance Engines

1. **Strict 8-Digit HSN/RITC Validator & Auto-Padder**
   - Detects truncated 2, 4, or 6-digit codes that trigger ICEGATE rejection.
   - Provides 1-click auto-padding to 8 digits with trailing zeros.
2. **Deterministic Arithmetic Reconciliation**
   - **Line Level:** `| (Quantity * Unit Price) - Item Total Value | <= 0.50`
   - **Header Level:** `| Sum(Item Total Values) - Extracted Invoice Total | <= 0.50`
   - **Sticky Math Footer:** Visual indicator that turns vivid green only when values balance, with a 1-click "Auto-Balance Header Total" reconciliation action.
3. **UQC Normalization Engine**
   - Normalizes informal unit strings (`Pieces`, `Boxes`, `Nos`, `Meters`, `Kgs`) into official ICEGATE 3-letter Unit Quantity Codes (`PCS`, `BOX`, `NOS`, `MTR`, `KGS`).
4. **Physical Weight Logic**
   - Validates that `Gross Weight >= Net Weight`. Flags physical customs discrepancies where net weight exceeds container gross weight.
5. **e-Sanchit IRN Attribution**
   - Binds the 16-character e-Sanchit Image Reference Number (generated via Class-3 DSC USB dongle signing) into the `<TABLE>SUPPORTING_DOC` record.
6. **Statutory Exporter Master**
   - Auto-fills statutory company details including 10-digit IEC, 15-digit GSTIN, 7-digit RBI Bank AD Code, and Port of Loading (`INNSA1` vs `INBOM4`).

---

## 3. Technology Stack

* **Frontend:** Vite + React (TypeScript) + Tailwind CSS + Lucide Icons
* **Database & ORM:** Supabase PostgreSQL with Prisma ORM schema
* **AI Vision Engine:** Google Gemini Flash (`gemini-2.5-flash` / `gemini-1.5-flash`) via `@google/generative-ai`
* **Exporters:** SheetJS (`xlsx`) and custom ASCII `0x1D` ICES 1.5 compiler

---

## 4. Getting Started

### 4.1 Prerequisites
* Node.js v18+ (tested on Node v24)
* npm or pnpm

### 4.2 Installation
```bash
# Clone the repository
git clone https://github.com/Rushaljain/EkdantLogistics.git
cd EkdantLogistics

# Install dependencies
npm install
```

### 4.3 Environment Configuration
Copy `.env.example` to `.env`:
```env
VITE_GEMINI_API_KEY="your-gemini-api-key"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```
*(Note: You can also enter and test your Gemini API Key directly inside the app's Operator Settings UI, or test out-of-the-box using the preloaded Nhava Sheva and Air Cargo sample invoices).*

### 4.4 Running Locally
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 4.5 Production Build
```bash
npm run build
npm run preview
```

---

## 5. Repository & Branch Information
* **Remote Origin:** `https://github.com/Rushaljain/EkdantLogistics.git`
* **Default Branch:** `main`

---

## 6. License
Authorized for use by **Ekdant Logistics** customs brokerage operations.
