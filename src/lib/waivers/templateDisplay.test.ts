import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isEscapeRoomTemplate,
  standardTemplatesOnly,
  templateAssignmentLabel,
  templateDefaultLabel,
} from "./templateDisplay.ts";

const standard = { kind: "standard", isDefault: false, assignmentCount: 3 };
const room = { kind: "escape_room", isDefault: false, assignmentCount: 0 };

describe("templateDefaultLabel", () => {
  it("is empty when the template is not a default", () => {
    assert.equal(templateDefaultLabel(standard), null);
  });
  it("names the escape-room default apart from the standard one", () => {
    assert.equal(templateDefaultLabel({ ...standard, isDefault: true }), "Default");
    assert.equal(templateDefaultLabel({ ...room, isDefault: true }), "Escape-room default");
  });
});

describe("templateAssignmentLabel", () => {
  it("counts items for a standard template", () => {
    assert.equal(templateAssignmentLabel(standard), "3 items");
    assert.equal(templateAssignmentLabel({ ...standard, assignmentCount: 1 }), "1 item");
    assert.equal(templateAssignmentLabel({ ...standard, assignmentCount: 0 }), "0 items");
  });
  it("counts rooms for an escape-room template, as the web does", () => {
    assert.equal(templateAssignmentLabel({ ...room, assignmentCount: 2 }), "2 rooms");
    assert.equal(templateAssignmentLabel({ ...room, assignmentCount: 1 }), "1 room");
    assert.equal(templateAssignmentLabel(room), "0 rooms");
  });
  it("reads an unassigned escape-room default as covering every room", () => {
    assert.equal(templateAssignmentLabel({ ...room, isDefault: true }), "All escape rooms");
  });
  it("treats a template from an older backend (no kind) as standard", () => {
    assert.equal(templateAssignmentLabel({ ...standard, kind: null }), "3 items");
    assert.equal(isEscapeRoomTemplate({ kind: null }), false);
  });
});

describe("standardTemplatesOnly", () => {
  it("drops escape-room templates and keeps the rest in order", () => {
    const list = [
      { id: 1, kind: "standard" },
      { id: 2, kind: "escape_room" },
      { id: 3, kind: null },
    ];
    assert.deepEqual(standardTemplatesOnly(list).map((t) => t.id), [1, 3]);
  });
});
