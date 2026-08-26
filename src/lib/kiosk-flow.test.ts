import assert from "node:assert/strict";
import test from "node:test";

import {
  getKioskBackTarget,
  isKioskIdentityReady,
} from "@/lib/kiosk-flow";

test("back from new registration restores existing-member identity mode", () => {
  const target = getKioskBackTarget({
    step: "new-member",
    identityMode: "new",
    hasSelectedResourceType: true,
  });

  assert.deepEqual(target, {
    step: "existing-member",
    identityMode: "existing",
  });
  assert.equal(
    isKioskIdentityReady({
      identityMode: target?.identityMode ?? null,
      hasSelectedMember: true,
      hasCompleteNewMemberForm: false,
    }),
    true,
  );
});

test("existing-member mode never submits a stale completed registration draft", () => {
  const target = getKioskBackTarget({
    step: "new-member",
    identityMode: "new",
    hasSelectedResourceType: false,
  });

  assert.equal(
    isKioskIdentityReady({
      identityMode: target?.identityMode ?? null,
      hasSelectedMember: false,
      hasCompleteNewMemberForm: true,
    }),
    false,
  );
});
