import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const headers = ["First Name", "Last Name", "Company Name", "Email", "Main Phone", "Street 1", "City", "State", "Zip Code", "Country"];
const rows = [
  ["Avery", "Morgan", "Evergreen Lawn Test Co.", "avery.morgan@example.com", "202-555-0101", "101 Sample Oak Lane", "Seattle", "WA", "98101", "USA"],
  ["Jordan", "Lee", "BrightPath Cleaning Demo", "jordan.lee@example.com", "202-555-0102", "202 Demo Pine Street", "Portland", "OR", "97201", "USA"],
  ["Taylor", "Brooks", "BlueSky Plumbing Test", "taylor.brooks@example.com", "202-555-0103", "303 Example River Road", "Denver", "CO", "80202", "USA"],
  ["Casey", "Patel", "Summit HVAC Demo", "casey.patel@example.com", "202-555-0104", "404 Sample Peak Avenue", "Phoenix", "AZ", "85004", "USA"],
  ["Riley", "Chen", "ClearView Windows Test", "riley.chen@example.com", "202-555-0105", "505 Demo Glass Boulevard", "Austin", "TX", "78701", "USA"],
  ["Morgan", "Diaz", "NorthStar Electric Demo", "morgan.diaz@example.com", "202-555-0106", "606 Example Circuit Drive", "Chicago", "IL", "60601", "USA"],
  ["Cameron", "Smith", "FreshStart Painting Test", "cameron.smith@example.com", "202-555-0107", "707 Sample Color Court", "Atlanta", "GA", "30303", "USA"],
  ["Jamie", "Wilson", "GreenGate Landscaping Demo", "jamie.wilson@example.com", "202-555-0108", "808 Demo Garden Way", "Sacramento", "CA", "95814", "USA"],
  ["Quinn", "Johnson", "SafeHome Pest Test", "quinn.johnson@example.com", "202-555-0109", "909 Example Cedar Place", "Orlando", "FL", "32801", "USA"],
  ["Alex", "Nguyen", "RapidFix Handyman Demo", "alex.nguyen@example.com", "202-555-0110", "110 Test Workshop Street", "Boston", "MA", "02108", "USA"],
];

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const workbook = await Workbook.fromCSV(csv, { sheetName: "Jobber Clients" });
const sheet = workbook.worksheets.getItem("Jobber Clients");
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);
sheet.getRange("A1:J1").format = {
  fill: "#0B4F3C",
  font: { bold: true, color: "#FFFFFF" },
  borders: { preset: "outside", style: "thin", color: "#083D2F" },
};
sheet.getRange("A1:J11").format.rowHeight = 22;
sheet.getRange("A1:J11").format.wrapText = false;
sheet.getRange("A1:J11").format.autofitColumns();
sheet.getRange("A:A").format.columnWidth = 13;
sheet.getRange("B:B").format.columnWidth = 13;
sheet.getRange("C:C").format.columnWidth = 28;
sheet.getRange("D:D").format.columnWidth = 30;
sheet.getRange("E:E").format.columnWidth = 17;
sheet.getRange("F:F").format.columnWidth = 27;
sheet.getRange("G:G").format.columnWidth = 15;
sheet.getRange("H:H").format.columnWidth = 9;
sheet.getRange("I:I").format.columnWidth = 11;
sheet.getRange("I2:I11").format.numberFormat = "@";
sheet.getRange("I11").values = [["02108"]];
sheet.getRange("J:J").format.columnWidth = 11;
sheet.tables.add("A1:J11", true, "JobberSampleClients").style = "TableStyleMedium4";

const inspect = await workbook.inspect({ kind: "table", range: "Jobber Clients!A1:J11", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 10 });
console.log(inspect.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "formula error scan" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Jobber Clients", range: "A1:J11", scale: 1, format: "png" });
await fs.writeFile("preview.png", new Uint8Array(await preview.arrayBuffer()));
await fs.writeFile("jobber-sample-clients.csv", csv, "utf8");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("jobber-sample-clients.xlsx");
