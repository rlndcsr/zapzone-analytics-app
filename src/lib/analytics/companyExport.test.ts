import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  companyExportCsv,
  companyExportJson,
  csvField,
  exportFileName,
  titleOf,
} from "./companyExport.ts";

const REPORT = {
  company: { id: 1, name: "Zap Zone", total_locations: 2 },
  date_range: { period: "30d", start_date: "2026-10-17", end_date: "2026-11-16" },
  selected_locations: [],
  key_metrics: {
    total_revenue: { value: 1500.5, change: "+12.5%", trend: "up" },
    active_packages: { value: 9, info: "2 new packages" },
  },
  booking_status: [
    { status: "Confirmed", count: 3, color: "#10b981" },
    { status: "Checked-in", count: 1, color: "#06b6d4" },
  ],
  top_events: [],
  waivers: {
    summary: { total: 10, completed: 8 },
    by_source: [{ source: "Kiosk", count: 8, color: "#3b82f6" }],
  },
};

describe("csvField", () => {
  it("quotes like fputcsv", () => {
    assert.equal(csvField("plain"), "plain");
    assert.equal(csvField("Zap Zone"), '"Zap Zone"');
    assert.equal(csvField("a,b"), '"a,b"');
    assert.equal(csvField('say "hi"'), '"say ""hi"""');
    assert.equal(csvField("two\nlines"), '"two\nlines"');
  });

  it("writes PHP's values for empty, numbers and booleans", () => {
    assert.equal(csvField(null), "");
    assert.equal(csvField(undefined), "");
    assert.equal(csvField(1500.5), "1500.5");
    assert.equal(csvField(true), "1");
    assert.equal(csvField(false), "");
  });
});

describe("titleOf", () => {
  it("matches ucwords(str_replace('_', ' ', key))", () => {
    assert.equal(titleOf("total_revenue"), "Total Revenue");
    assert.equal(titleOf("minors_covered"), "Minors Covered");
  });
});

describe("companyExportCsv", () => {
  const csv = companyExportCsv(REPORT, "2026-11-16T10:00:00.000Z", "All locations");
  const lines = csv.split("\n");

  it("opens with the header block", () => {
    // Labels with a space are quoted, as fputcsv quotes them.
    assert.deepEqual(lines.slice(0, 8), [
      '"Company Analytics Export"',
      '"Generated At",2026-11-16T10:00:00.000Z',
      'Company,"Zap Zone"',
      'Locations,"All locations"',
      "Period,30d",
      '"Start Date",2026-10-17',
      '"End Date",2026-11-16',
      "",
    ]);
  });

  it("lists key metrics with value, change, trend and info", () => {
    const at = lines.indexOf('"Key Metrics"');
    assert.deepEqual(lines.slice(at, at + 4), [
      '"Key Metrics"',
      "Metric,Value,Change,Trend,Info",
      '"Total Revenue",1500.5,+12.5%,up,',
      '"Active Packages",9,,,"2 new packages"',
    ]);
  });

  it("writes each section as a titled table without chart colours", () => {
    const at = lines.indexOf('"Booking Status"');
    assert.deepEqual(lines.slice(at, at + 4), [
      '"Booking Status"',
      "Status,Count",
      "Confirmed,3",
      "Checked-in,1",
    ]);
    assert.ok(!csv.includes("#10b981"));
  });

  it("skips empty sections", () => {
    assert.ok(!csv.includes("Top Events"));
  });

  it("includes the waiver summary and tables", () => {
    assert.ok(lines.includes('"Waiver Summary"'));
    assert.ok(lines.includes("Completed,8"));
    const at = lines.indexOf('"Waivers by Source"');
    assert.deepEqual(lines.slice(at, at + 3), ['"Waivers by Source"', "Source,Count", "Kiosk,8"]);
  });

  it("ends every row with a newline", () => {
    assert.ok(csv.endsWith("\n"));
  });

  it("copes with a report missing every block", () => {
    const bare = companyExportCsv({}, "t", "All locations");
    assert.ok(bare.startsWith('"Company Analytics Export"\n'));
    assert.ok(!bare.includes("Key Metrics"));
  });
});

describe("companyExportJson", () => {
  it("is the report plus generated_at, pretty-printed", () => {
    const json = companyExportJson(REPORT, "2026-11-16T10:00:00.000Z");
    assert.deepEqual(JSON.parse(json), { ...REPORT, generated_at: "2026-11-16T10:00:00.000Z" });
    assert.ok(json.includes('\n  "company": {'));
  });
});

describe("exportFileName", () => {
  const date = new Date(2026, 10, 6);
  it("matches the web's name, made file-safe", () => {
    assert.equal(exportFileName("Zap Zone", date, "csv"), "zap-zone-analytics-2026-11-06.csv");
    assert.equal(exportFileName("Zap / Zone Inc.", date, "json"), "zap-zone-inc-analytics-2026-11-06.json");
    assert.equal(exportFileName("", date, "json"), "company-analytics-2026-11-06.json");
  });
});
