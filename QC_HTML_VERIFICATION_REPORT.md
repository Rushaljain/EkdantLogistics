# Quality Control (QC) HTML Verification Report
Generated: 2026-11-10T19:12:44.385Z

## 1. Format Schema & Box Presence Audit
- **Box 3 (Page of Page):** PRESENT (3. Page of Page)
- **Box 19c (Total gross incl. tare):** PRESENT (19c. Total gross (incl. tare) (kg))

## 2. IMDG Regulatory UN Lookup Audit
- **UN 2794 Proper Shipping Name:** `BATTERIES, WET, FILLED WITH ACID`
- **UN 2794 IMO Class:** `8`
- **UN 2794 Packing Group:** `III`
- **UN 2794 EMS:** `F-A, S-B`
- **UN 2794 Segregation Group:** `SGG1 - Acids`

## 3. Contiguous Pallet Range Synthesizer Audit
- **Input Pallets:** 4533, 4534, 4535, 4956, 4957, TAL/1703/2026
- **Synthesized Ranges:** `4533 TO 4535, 4956 TO 4957, TAL/1703/2026`

## 4. Manifest Mapping & HTML Output Verification

### Key Field Verifications:
| Field ID | Expected Semantic Behavior | Resolved Manifest Value | Status |
|---|---|---|---|
| `box_3_page_of_page` | Page of Page ("1 OF 1") | `1 OF 1` | PASSED |
| `box_19_total_gross_incl_tare` | VGM = Gross (605) + Tare (2200) = 2805 kg | `2805` | PASSED |
| `box_14_shipping_marks` | Contains synthesized pallet ranges | `ACME/DXB/2026 PALLET NOS: 4533 TO 4535, 4956 TO 4957, TAL/1703/2026` | PASSED |
| `bl_cargo_description` | Brand deduplicated (no duplicate BRAND:) | `6 PALLETS (60 BOXES) LEAD ACID STORAGE BATTERIES (BRAND: POWERMAX) UN NO: UN 2794` | PASSED |

### HTML Rendering Verifications:
- **DG HTML renders Box 19c / VGM (2805 kg):** PASSED
- **DG HTML includes Pallet Breakdown Annex:** PASSED
- **BL HTML includes Pallet Breakdown Annex:** PASSED

## 5. Summary
All 5 HTML Export QC Discrepancies have been resolved:
1. Box 3 ("1 OF 1") and Box 19c ("Total gross incl. tare") permanently restored in DEFAULT_DG_FORMAT and auto-synced by getSavedFormats().
2. Standard IMDG UN-lookup table accurately enriches hazardous UN codes with proper shipping names, EMS, and segregation codes.
3. Contiguous pallet ranges are synthesized into shipping marks automatically for both DG and BL manifests.
4. Duplicate brand name lines are suppressed if brand is already present in description text.
5. Step 4 Quick Stage-2 Bar expanded with fields for Emergency Contact, Shipping Bills, Free Time, Declarant, and Freight Terms.