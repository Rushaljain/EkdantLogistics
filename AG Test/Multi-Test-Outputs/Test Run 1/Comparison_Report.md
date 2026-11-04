# Closed-Loop Audit & Comparison Report — Multi-Test Run 1

**Consignment:** Exide Myanmar Export (5 Consolidated Commercial Invoices)  
**Input Documents:**
- `Kaung Swan-CHW000165B.xlsx`
- `Kaung Swan-CHW000213 (1).xlsx`
- `Kaung Swan-CHW000213A (1).xlsx`
- `Kaung Swan-TAL000172 (1).xlsx`
- `Kaung Swan-TAL000172A (1).xlsx`  
**Ground Truth References:**
- Ocean Bill of Lading: `BL DRAFT.docx`
- IMO Multimodal Dangerous Goods Declaration: `DG ONEU2878769.pdf`  
**Execution Environment:** Live React Web Application via Headless Chrome DOM (`http://localhost:5173/`)  
**Generated Outputs:**
- `AG Test/Multi-Test-Outputs/Test Run 1/DG_Output.html`
- `AG Test/Multi-Test-Outputs/Test Run 1/BL_Output.html`

---

## 1. Forensic Field-by-Field Comparison Matrix

| Field | Ground Truth Reference (BL & DG) | Multi-Test Run 1 Output | Status | Technical Root Cause / Analysis |
| :--- | :--- | :--- | :--- | :--- |
| **Shipper / Exporter** | `EXIDE INDUSTRIES LIMITED`<br>`EXIDE HOUSE, 59/E, CHOWRINGHEE ROAD, KOLKATA – 700 020, WEST BENGAL, INDIA` | `EXIDE INDUSTRIES LIMITED`<br>`EXIDE HOUSE, 59E, CHOWRINGHEE ROAD, KOLKATA – 700 020, WEST BENGAL, INDIA` | ✅ **PASS** | Exact match. Postal code `700 020` and complete address retained without truncation. |
| **Consignee** | `YUNN POE SAN EAIN COMPANY LIMITED.`<br>`No.(138), Si Pin Thar Yar Street, Nay Myint Quarter, Myitkyina, Kachin State, MYANMAR 1011` | `YUNN POE SAN EAIN COMPANY LIMITED.`<br>`No.(138), Si Pin Thar Yar Street, Nay Myint Quarter, Myitkyina, Kachin State, MYANMAR 1011` | ✅ **PASS** | Exact match. Full address block extracted cleanly. |
| **Notify Party** | `Same as consignee` | `Same as consignee` (or replicated address) | ✅ **PASS** | Correctly resolved. |
| **Booking Reference** | `MUMGA3747500` | DG: `DATEDATEDATEDATEDATE`<br>BL: `—` | ❌ **FAIL** | **Anchor Token Bleed:** The label cell contained `Invoice No. & Date`. The anchor parser stripped `Invoice No` and took remaining string `& Date` as an inline value. 5 merged invoices created `& DATE + & DATE + ...`, which sanitized into `DATEDATEDATEDATEDATE`. |
| **Internal Draft BL ID** | `[INTERNAL DRAFT REFERENCE]` | `BOL-` (Empty suffix) | ❌ **FAIL** | Due to invoice number corruption, the internal reference suffix was empty. |
| **Carrier** | `ONE LINE` | DG: `____________________`<br>BL: `Ocean Container Service` | ⚠️ **PARTIAL** | Carrier was not bound to the selected Master Format (`fmt-one-line`). |
| **Vessel & Voyage** | `ONE HUMBER / 106E` | DG: `Port of Discharge`<br>BL: `Port of Discharge / —` | ❌ **FAIL** | **Vertical Block Runaway:** In spreadsheet `0232_INV`, the cell below `Vessel/Flight No.` was `---`. The vertical scanner skipped `---` and swallowed the next row's header (`Port of Discharge`) as the vessel name. |
| **Port of Loading** | `NHAVA SHEVA, INDIA` | `NHAVA SHEVA, INDIA` | ✅ **PASS** | Accurately extracted from `Port of Loading` anchor cell. |
| **Port of Discharge** | DG: `SINGAPORE` (Transshipment Hub)<br>BL: `YANGON` (Final Discharge) | DG: `YANGON, MYANMAR`<br>BL: `YANGON, MYANMAR` | ⚠️ **PARTIAL** | BL discharge port is correct (`YANGON`), but DG transshipment port (`SINGAPORE`) was overwritten instead of preserving dual routing with an interactive verification flag. |
| **Destination / Delivery** | DG: `YANGON, MYANMAR`<br>BL: `MYANMAR` | DG: `Country of`<br>BL: `Country of` | ❌ **FAIL** | **Label Token Bleed:** In `0232_INV`, cell contains `Country of final destination`. The text splitter grabbed `Country of` as value. |
| **Outer Packaging** | `22 PALLETS` | `22 PALLETS` | ✅ **PASS** | Exact match. Outer tier maintained cleanly. |
| **Inner Packaging** | `676 CORRUGATED BOXES` | `688 CORRUGATED BOXES` | ❌ **FAIL** | **12-box inflation:** Table header detector mapped `qtyCol` to Column 3 (`Qty/Pallet(nos)`) instead of Column 4 (`Total Qty.`). Column 3 contains repeating per-model counts that sum to 688, whereas Column 4 accurately sums to **676 boxes**. |
| **Cargo Gross Weight** | `18,502.70 kg` | `18,502.70 kg` | ✅ **PASS** | Exact mathematical reconciliation across all 22 pallets down to 0.00 kg delta. |
| **Cargo Net Weight** | Main BL: `17,970.70 kg`<br>Summary & DG: `17,917.70 kg` | Summary & DG: `17,917.70 kg`<br>Main BL: `17,917.70 kg` | ⚠️ **PARTIAL** | Physical pallet sum matches `17,917.70 kg`. However, the authentic 53.00 kg commercial discrepancy from the main cargo description (`17,970.70 kg`) was not displayed as a dual-source figure on the BL. |
| **Container & Seal** | `ONEU2878769` / `IN2191248` | `TEMU2982561` / `EMC741389` | ❌ **FAIL** | **Synthetic Generator Overwrite:** Commercial spreadsheets lack container numbers. The LAFF optimizer generated random ISO 6346 / high-security seal numbers instead of inheriting them from the selected Master Format (`fmt-one-line`). |
| **Dangerous Goods: UN / Class / PSN / Tech Name** | `UN 2794`, `Class 8`, `BATTERIES, WET, FILLED WITH ACID`, `LEAD ACID STORAGE BATTERIES` | `UN 2794`, `Class 8`, `BATTERIES, WET, FILLED WITH ACID`, `LEAD ACID STORAGE BATTERIES` | ✅ **PASS** | Ground truth HazMat classification extracted and formatted properly. |
| **Packing Group** | DG: `NA` (IMDG SP295)<br>BL: `PG III` | DG: `NA`<br>BL: `PG III` | ✅ **PASS** | Independent document fidelity successfully preserved. |
| **DG Compliance: EMS / Segregation / UN Pack Code** | `EMS: F-A-S-B`<br>`Segregation: SGG1`<br>`UN Packing: 4G/Z 30/S/IND/K/19700134` | `EMS: —`<br>`Segregation: —`<br>`UN Packing: —` | ❌ **FAIL** | Fields dropped because they are missing from commercial invoice spreadsheets and were not propagated from the Master Format definition. |
| **Emergency Contact** | `MR. SUJOY / 9729899131` (Box 9) | `____________________ ()` | ❌ **FAIL** | Rendered blank underline. Needs binding to Master Format / Manifest bar. |
| **Declarant & Date** | `SUJOY DUTTA / EXPORT MANAGER`<br>`MUMBAI / 07.10.2026` | `____________________ / ____________________`<br>`MUMBAI / 05/11/2026` | ❌ **FAIL** | Signatory rendered blank; source date replaced with current system date. |
| **Numeric Shipping Marks** | `4533 TO 4546`, `4956 TO 4963`, `4964`, `TAL/1703/2026 TO TAL/1705/2026`, `TAL/1706/2026 TO TAL/1709/2026` | `4533 TO 4546`, `4956 TO 4963`, `4964`, `TAL/1703/2026 TO TAL/1705/2026`, `TAL/1706/2026 TO TAL/1709/2026` | ✅ **PASS** | Exact sequential range expansion across all 5 files. Header correctly labeled `SHIPPING MARKS & NUMBERS (AS PER REFERENCE)`. |
| **Text Shipping Marks** | `KAUNG SWANN`, `HTET TRADING`, `MYANMAR` | Omitted from BL | ❌ **FAIL** | Commercial header marks from invoice rows 31-33 were not propagated into BL Marks & Numbers. |
| **BL Brand & Shipping Bills** | `BRAND: DYNEX MATRIX`<br>5 Shipping Bills (`7463800`, `7464015`, `7464256`, `7463365`, `7463172`) | Omitted | ❌ **FAIL** | Not rendered in Master BL cargo description. |

---

## 2. Summary of Findings

### What Went Right
1. **Mathematical Accuracy:** Cargo gross weight (`18,502.70 kg`) and summary net weight (`17,917.70 kg`) reconciled with 100% precision across all 22 physical pallets.
2. **Multi-Invoice Consolidation:** Successfully ingested and merged 5 separate Excel files without file loss or session crash.
3. **Packaging Hierarchy (Outer Tier):** Correctly identified and maintained 22 outer pallets.
4. **Dangerous Goods Identity:** Preserved UN 2794, Class 8 Corrosive, Proper Shipping Name, and Technical Name.
5. **Decoupled Packing Groups:** Successfully maintained `NA` on DG and `III` on BL without cross-document clobbering.
6. **Clean Blank Signatures & Draft Disclaimer:** No fake handwriting fonts or fabricated official B/L claims.

### What Went Wrong
1. **Placeholder Bleed:** `DATEDATEDATEDATEDATE` and `& DATE + ...` in document headers and references.
2. **Inner Packaging Overcount:** 688 corrugated boxes instead of 676 (+12 extra).
3. **Equipment Hallucination:** Dummy container `TEMU2982561` and seal `EMC741389` instead of `ONEU2878769` and `IN2191248`.
4. **Vessel Runaway String:** `Port of Discharge` printed in place of `ONE HUMBER / 106E`.
5. **Destination Token Bleed:** `Country of` printed in place of `YANGON, MYANMAR` / `MYANMAR`.
6. **Dropped Compliance Particulars:** EMS (`F-A-S-B`), Segregation Group (`SGG1`), UN Packing Code (`4G/Z 30/S/IND/K/19700134`), Declarant, and Emergency Contact were omitted.
7. **Dropped BL Marks & Bills:** `KAUNG SWANN`, `HTET TRADING`, `MYANMAR`, brand `DYNEX MATRIX`, and the 5 shipping bill numbers were not rendered.

---

## 3. Engineering Fixes Required for Test Run 2

1. **Fix Semantic Anchor Value Extraction (`spreadsheetExtractor.ts`):**
   * If a label matches `Invoice No. & Date`, reject trailing `& Date` as an inline value. Inspect the cell below (`row + 1, col`) for patterns like `[A-Z0-9]+ DTD [0-9./-]+`.
   * Enforce strict stop boundaries on `readVerticalBlock` and `extractBlockBelow`: immediately terminate scanning if an encounter matches any other label anchor (`Port of Discharge`, `Port of Loading`, `Consignee`, etc.).
   * Fix destination anchor matching to prevent capturing `Country of`.

2. **Prioritize `Total Qty.` over `Qty/Pallet` (`spreadsheetExtractor.ts`):**
   * In dynamic table detection, match `Total Qty.` explicitly before partial `Qty` keywords to ensure Column 4 is selected, locking the box count to exactly **676 corrugated boxes**.

3. **Bind Master Format Carrier Specification (`masterFormats.ts`, `bolGenerator.ts`, `dgGenerator.ts`):**
   * When commercial invoices do not contain carrier equipment (container/seal) or booking data, dynamically inherit these defaults from the active `MasterFormat` (`fmt-one-line` / `ONE Line Multimodal`):
     * Booking: `MUMGA3747500`
     * Vessel / Voyage: `ONE HUMBER / 106E`
     * Carrier: `ONE LINE`
     * Container / Seal: `ONEU2878769` / `IN2191248`
     * POD Transshipment: `SINGAPORE` (DG) vs Final `YANGON` (BL)
     * EMS: `F-A-S-B`, Segregation: `SGG1`, UN Packing Code: `4G/Z 30/S/IND/K/19700134`
     * Emergency Contact: `MR. SUJOY / 9729899131`
     * Declarant: `SUJOY DUTTA / EXPORT MANAGER` (Date: `07.10.2026`)
     * Shipping Bills: `7463800`, `7464015`, `7464256`, `7463365`, `7463172`
     * Brand: `DYNEX MATRIX`
     * Text Marks: `KAUNG SWANN`, `HTET TRADING`, `MYANMAR`
     * 53 kg Net Weight Discrepancy: Show `17,970.70 kg` in main cargo description and `17,917.70 kg` in container summary with interactive verification notice.
