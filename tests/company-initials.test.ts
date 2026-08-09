import assert from "node:assert/strict";
import test from "node:test";
import { companyInitials } from "../src/lib/company/company-initials.ts";

test("derives company initials from multi-word names", () => {
  assert.equal(companyInitials("Northstar Labs"), "NL");
  assert.equal(companyInitials("Southstar F"), "SF");
  assert.equal(companyInitials("Within Finance"), "WF");
});

test("uses the first two characters for single-word names", () => {
  assert.equal(companyInitials("Within"), "WI");
  assert.equal(companyInitials("Arc"), "AR");
});

test("normalizes whitespace and handles invalid names", () => {
  assert.equal(companyInitials("  Southstar   F  "), "SF");
  assert.equal(companyInitials("   "), "CO");
  assert.equal(companyInitials("---"), "CO");
});
