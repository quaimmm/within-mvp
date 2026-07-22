import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ADMIN, isNorthstarEmail } from "../src/lib/demo/session.ts";

test("Northstar demo access accepts only the configured work-email domain", () => {
  assert.equal(isNorthstarEmail("amanda@northstar.io"), true);
  assert.equal(isNorthstarEmail(" AMANDA@NORTHSTAR.IO "), true);
  assert.equal(isNorthstarEmail("amanda@example.com"), false);
  assert.equal(isNorthstarEmail("northstar.io"), false);
  assert.equal(DEMO_ADMIN.name, "Amanda Morgan");
});
