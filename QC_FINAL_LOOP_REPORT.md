# Quality Control Final Autonomous Loop Report
Timestamp: 2026-11-10T20:38:04.018Z

## 12 / 12 Mandatory Assertions Status
| # | Description | Status | Details |
|---|---|---|---|
| 1 | shipperName has "EXIDE INDUSTRIES LIMITED" and Party Box includes IEC: | PASSED | EXIDE INDUSTRIES LIMITED |
| 2 | DG Box 3 (box_3_page_of_page) === "1 OF 1" | PASSED | A: 1 OF 1, B: 1 OF 1 |
| 3 | DG Box 15b === "BATTERIES, WET, FILLED WITH ACID" (official IMDG PSN) | PASSED | A: BATTERIES, WET, FILLED WITH ACID |
| 4 | DG Box 15e (box_15_ems_number) === "F-A, S-B" | PASSED | EMS: F-A, S-B |
| 5 | DG Box 14 and BL Marks BOTH contain all synthesized pallet ranges | PASSED | Ranges present: true |
| 6 | DG Box 15 and BL Description have zero duplicate BRAND: lines | PASSED | A count: 1, B count: 1 |
| 7 | DG Box 19c is blank when tare=0, and 20652.7 when tare=2150 | PASSED | zero: "", s2: "20652.7" |
| 8 | Multi-invoice shipperReference preserves all 3 references | PASSED | 0020078448-(1), CHW004, 0020078239-(1) |
| 9 | Multi-invoice totals match: 42694.93, 18502.7 kg, 17917.7 kg, 22 pallets, 676 boxes | PASSED | Val: 42694.93, Gr: 18502.7 |
| 10 | When Stage-2 fields are supplied, 100% appear in generated DG and BL HTML | PASSED | Passed: 12/12 |
| 11 | DG HTML has IMO Box 1–22 grid & BL HTML has 5-column Container Summary table | PASSED | DG grid: true, BL table: true |
| 12 | exportManifestToDocx generates valid non-empty .docx archive (> 2KB) | PASSED | DG size: 116559 bytes, BL size: 116718 bytes |

## Verification Summary
Total Assertions: 12
Passed: 12
Failed: 0

✓ ALL 12 END-TO-END QUALITY CONTROL ASSERTIONS PASSED WITH ZERO ERRORS.