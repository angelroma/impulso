import type { ImportManifest, ImportSourceRow } from "../../_shared/import_contracts.ts";

// Only the observed reconciliation figures and cell identities are retained; all row values are synthetic.
export function syntheticWorkbookManifest(): ImportManifest {
  const missing = [17, 25, 47, 48, 50, 52, 53];
  const amounts = [
    "30000.00",
    "14727.04",
    "12000.00",
    "15000.00",
    "10000.00",
    "10000.00",
    "15100.00",
  ];
  const rows: ImportSourceRow[] = missing.map((number, index) => ({
    sheet_id: 2026,
    source_cell: `C${number}`,
    period_start: "2026-01-01",
    date_precision: "month",
    observed_on: null,
    original_text: `Synthetic concept ${number}`,
    displayed_value: amounts[index],
    raw_value: amounts[index],
    formula: null,
    selected: false,
    parser: "plain",
    currency: "MXN",
    mapping: { role: "unknown", accepted: false },
    expected_targets: [],
    replacement: null,
  }));
  return {
    workbook_id: "synthetic-workbook-not-the-user-source",
    source_version: "synthetic-capture-v1",
    captured_at: "2026-10-14T00:00:00Z",
    sheets: [
      {
        sheet_id: 100,
        title: "Dashboard",
        visibility: "visible",
        source_kind: "derived",
        selection: "reference",
        acknowledged_overlap: false,
        ranges: ["A1:O100"],
      },
      ...[2026, 2027, 2028].map((year) => ({
        sheet_id: year,
        title: String(year),
        visibility: "visible" as const,
        source_kind: "active" as const,
        selection: "exclude" as const,
        acknowledged_overlap: false,
        ranges: ["A1:O100"],
      })),
      {
        sheet_id: 999,
        title: "Hidden backup",
        visibility: "hidden",
        source_kind: "backup",
        selection: "exclude",
        acknowledged_overlap: false,
        ranges: ["A1:O100"],
      },
    ],
    rows,
    reconciliation: {
      annual_net: "202338.51",
      monthly_net: "95511.47",
      missing_annual_cells: missing.map((number) => ({
        sheet_id: 2026,
        source_cell: `O${number}`,
      })),
      resolution: "unresolved",
      excluded_cells: [],
      accepted: false,
    },
  };
}
