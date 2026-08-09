import assert from "node:assert/strict";
import test from "node:test";
import { userDisplayName, userInitials } from "../src/lib/profile/user-initials.ts";

test("user initials combine first and last names", () => {
  assert.equal(userInitials("Mert", "Karadag"), "MK");
  assert.equal(userInitials("Alyson", "Walton"), "AW");
});

test("user initials support either name independently", () => {
  assert.equal(userInitials("Mert", ""), "M");
  assert.equal(userInitials("", "Karadag"), "K");
});

test("user identity trims whitespace and handles empty names", () => {
  assert.equal(userInitials("  mert  ", "  karadag  "), "MK");
  assert.equal(userInitials("  ", "  "), "U");
  assert.equal(userDisplayName("  Mert ", " Karadag  "), "Mert Karadag");
});
