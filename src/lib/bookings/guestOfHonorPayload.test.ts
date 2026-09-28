import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { guestOfHonorPayload } from "./guestOfHonorPayload.ts";

const form = (over: Partial<Parameters<typeof guestOfHonorPayload>[1]> = {}) => ({
  name: "Mia",
  age: "7",
  gender: "female" as string | null,
  ...over,
});

describe("guestOfHonorPayload", () => {
  it("sends filled fields as their values, the age as an integer", () => {
    assert.deepEqual(guestOfHonorPayload(true, form({ name: " Mia " })), {
      guestOfHonorName: "Mia",
      guestOfHonorAge: 7,
      guestOfHonorGender: "female",
    });
    assert.equal(guestOfHonorPayload(true, form({ age: "12" })).guestOfHonorAge, 12);
  });

  it("sends a cleared name as null so it is actually removed", () => {
    assert.equal(guestOfHonorPayload(true, form({ name: "" })).guestOfHonorName, null);
    assert.equal(guestOfHonorPayload(true, form({ name: "   " })).guestOfHonorName, null);
  });

  it("sends a cleared age as null, never an empty string or zero", () => {
    assert.equal(guestOfHonorPayload(true, form({ age: "" })).guestOfHonorAge, null);
    assert.equal(guestOfHonorPayload(true, form({ age: "  " })).guestOfHonorAge, null);
  });

  it("sends a cleared gender as null", () => {
    assert.equal(guestOfHonorPayload(true, form({ gender: null })).guestOfHonorGender, null);
    assert.equal(guestOfHonorPayload(true, form({ gender: "" })).guestOfHonorGender, null);
  });

  it("keeps the nulls in the JSON body", () => {
    const body = JSON.stringify(guestOfHonorPayload(true, { name: "", age: "", gender: null }));
    assert.equal(
      body,
      '{"guestOfHonorName":null,"guestOfHonorAge":null,"guestOfHonorGender":null}',
    );
  });

  it("leaves every field out for a package without a guest of honour", () => {
    // the stored values stay as they are, filled or not
    assert.deepEqual(guestOfHonorPayload(false, form()), {});
    assert.deepEqual(guestOfHonorPayload(false, { name: "", age: "", gender: null }), {});
  });
});
