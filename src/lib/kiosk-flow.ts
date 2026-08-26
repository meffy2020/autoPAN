export type KioskFlowStep =
  | "entry"
  | "pricing"
  | "existing-member"
  | "new-member"
  | "consent";

export type KioskIdentityMode = "existing" | "new" | null;

export function getKioskBackTarget({
  step,
  identityMode,
  hasSelectedResourceType,
}: {
  step: KioskFlowStep;
  identityMode: KioskIdentityMode;
  hasSelectedResourceType: boolean;
}) {
  if (step === "existing-member") {
    return {
      step: hasSelectedResourceType ? "pricing" : "entry",
      identityMode: null,
    } satisfies {
      step: KioskFlowStep;
      identityMode: KioskIdentityMode;
    };
  }

  if (step === "new-member") {
    return {
      step: "existing-member",
      identityMode: "existing",
    } satisfies {
      step: KioskFlowStep;
      identityMode: KioskIdentityMode;
    };
  }

  if (step === "consent") {
    return {
      step: identityMode === "existing" ? "existing-member" : "new-member",
      identityMode,
    } satisfies {
      step: KioskFlowStep;
      identityMode: KioskIdentityMode;
    };
  }

  if (step === "pricing") {
    return {
      step: "entry",
      identityMode: null,
    } satisfies {
      step: KioskFlowStep;
      identityMode: KioskIdentityMode;
    };
  }

  return null;
}

export function isKioskIdentityReady({
  identityMode,
  hasSelectedMember,
  hasCompleteNewMemberForm,
}: {
  identityMode: KioskIdentityMode;
  hasSelectedMember: boolean;
  hasCompleteNewMemberForm: boolean;
}) {
  if (identityMode === "existing") {
    return hasSelectedMember;
  }

  if (identityMode === "new") {
    return hasCompleteNewMemberForm;
  }

  return false;
}
