import { workerData, parentPort } from "worker_threads";
import * as XLSX from "xlsx";

const MAX_SPREADSHEET_SHEETS = 5;
const MAX_SPREADSHEET_ROWS = 2000;
const MAX_SPREADSHEET_COLS = 50;

try {
  const { base64Data }: { base64Data: string } = workerData;
  const buffer = Buffer.from(base64Data, "base64");

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetsToProcess = workbook.SheetNames.slice(0, MAX_SPREADSHEET_SHEETS);

  const lines: string[] = [];
  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const allRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    }) as string[][];
    const rows = allRows.slice(0, MAX_SPREADSHEET_ROWS);
    if (rows.length === 0) continue;
    if (workbook.SheetNames.length > 1) {
      lines.push(`--- Sheet: ${sheetName} ---`);
    }
    for (const row of rows) {
      const cells = row
        .slice(0, MAX_SPREADSHEET_COLS)
        .map((c) => String(c ?? "").trim());
      if (cells.some((c) => c !== "")) {
        lines.push(cells.join("\t"));
      }
    }
  }

  parentPort?.postMessage({ ok: true, text: lines.join("\n") });
} catch (err) {
  parentPort?.postMessage({ ok: false, error: String(err instanceof Error ? err.message : err) });
}
