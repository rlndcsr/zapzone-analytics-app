import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_EVENT_FORMS,
  groupPickerEvents,
  pickerLocations,
  pickerSummary,
  toggleForms,
  visiblePickerEvents,
  type PickerForm,
} from "./eventRecipients.ts";

const form = (over: Partial<PickerForm> & { id: number }): PickerForm => ({
  name: "Trunk or Treat",
  eventDate: "2026-10-31",
  status: "open",
  locationId: 1,
  locationName: "Brighton | Zap Zone",
  group: null,
  uniqueRegistrations: 3,
  ...over,
});

const halloween = { id: 9, name: "Halloween Bash", eventDate: "2026-10-31" };

const forms: PickerForm[] = [
  form({ id: 1, group: halloween, locationId: 2, locationName: "Novi | Zap Zone", status: "past" }),
  form({ id: 2, group: halloween, locationId: 1, status: "closed" }),
  form({ id: 3, name: "Summer Camp", eventDate: "2026-07-01", status: "past" }),
];

describe("groupPickerEvents", () => {
  it("joins an event's location forms under the event's name, newest event first", () => {
    const events = groupPickerEvents(forms);
    assert.deepEqual(events.map((e) => e.name), ["Halloween Bash", "Summer Camp"]);
    assert.deepEqual(events[0].forms.map((f) => f.id), [2, 1]); // Brighton before Novi
  });

  it("is open while any location is, and Date passed only when all have", () => {
    const [halloweenEvent, summer] = groupPickerEvents(forms);
    assert.equal(halloweenEvent.status, "closed");
    assert.equal(summer.status, "past");
    assert.equal(groupPickerEvents([form({ id: 4, group: halloween }), ...forms.slice(0, 2)])[0].status, "open");
  });
});

describe("visiblePickerEvents", () => {
  it("searches event, form and location names", () => {
    assert.deepEqual(visiblePickerEvents(forms, "novi", null).map((e) => e.forms.map((f) => f.id)), [[1]]);
    assert.deepEqual(visiblePickerEvents(forms, "summer", null).map((e) => e.name), ["Summer Camp"]);
  });

  it("keeps only one location's forms when filtered", () => {
    assert.deepEqual(visiblePickerEvents(forms, "", 1).flatMap((e) => e.forms.map((f) => f.id)), [2, 3]);
  });
});

describe("pickerLocations", () => {
  it("lists each location once, by its display name", () => {
    assert.deepEqual(pickerLocations(forms), [
      { id: 1, name: "Brighton (Zap Zone)" },
      { id: 2, name: "Novi (Zap Zone)" },
    ]);
  });
});

describe("toggleForms", () => {
  it("adds without duplicates and removes", () => {
    assert.deepEqual(toggleForms([1], [1, 2], true), [1, 2]);
    assert.deepEqual(toggleForms([1, 2, 3], [1, 2], false), [3]);
  });

  it("refuses to pass the server's cap", () => {
    const full = Array.from({ length: MAX_EVENT_FORMS }, (_, i) => i + 1);
    assert.equal(toggleForms(full, [MAX_EVENT_FORMS + 1], true), null);
    assert.deepEqual(toggleForms(full, [1], false)?.length, MAX_EVENT_FORMS - 1);
  });
});

describe("pickerSummary", () => {
  it("counts events, and location forms when there are several locations", () => {
    assert.equal(pickerSummary(forms, [], true), "No events picked yet");
    assert.equal(pickerSummary(forms, [1, 2], false), "1 event picked");
    assert.equal(pickerSummary(forms, [1, 2, 3], true), "2 events picked · 3 location forms");
  });
});
