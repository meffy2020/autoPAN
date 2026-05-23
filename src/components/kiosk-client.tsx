"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Gamepad2,
  Monitor,
  Search,
  UserRoundPlus,
  Users,
} from "lucide-react";

import { StatusPill } from "@/components/ui-primitives";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { getJson, postMutation } from "@/lib/client-api";
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_SHORT_LABELS,
  type ResourceType,
} from "@/lib/domain";
import { sortPricingRules, getResourceSummary } from "@/lib/selectors";
import type { SnapshotEnvelope } from "@/lib/snapshot";

type FlowStep =
  | "idle"
  | "entry"
  | "pricing"
  | "identity"
  | "existing-member"
  | "new-member"
  | "consent";
type KioskResourceChoice = ResourceType;
type CompletionState = {
  kind: "paid" | "space";
  message: string;
};

type MemberFormState = {
  name: string;
  schoolName: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  gender: "male" | "female" | "";
  guardianPhone: string;
};

type SheetMember = {
  id: string;
  name: string;
  schoolName?: string;
  birthDate?: string;
  gradeOrAge: string;
  gender?: "male" | "female";
  guardianPhone: string;
};

const DEFAULT_FORM: MemberFormState = {
  name: "",
  schoolName: "",
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  gender: "",
  guardianPhone: "",
};

const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = CURRENT_YEAR - 25;
const BIRTH_YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - MIN_BIRTH_YEAR + 1 },
  (_, index) => String(CURRENT_YEAR - index),
);
const BIRTH_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);
function getBirthDateValue(formState: MemberFormState) {
  if (!formState.birthYear || !formState.birthMonth || !formState.birthDay) {
    return "";
  }

  return `${formState.birthYear}-${formState.birthMonth}-${formState.birthDay}`;
}

function getBirthDayOptions(year: string, month: string) {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const dayCount =
    parsedYear > 0 && parsedMonth > 0
      ? new Date(parsedYear, parsedMonth, 0).getDate()
      : 31;

  return Array.from({ length: dayCount }, (_, index) =>
    String(index + 1).padStart(2, "0"),
  );
}

function formatMemberAgeLabel(value: string) {
  const birthYear = Number(value.slice(0, 4));

  if (/^\d{4}/.test(value) && birthYear > 0) {
    return `${CURRENT_YEAR - birthYear + 1}살`;
  }

  return value;
}

function getBirthYear(value: string) {
  return value.slice(0, 4);
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length >= 10) {
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }

  return value;
}

const RESOURCE_CARD_THEME: Record<
  Exclude<ResourceType, "space">,
  {
    background: string;
    text: string;
    pill: string;
  }
> = {
  pc: {
    background: "bg-[#dfe8ff]",
    text: "text-[#24367f]",
    pill: "bg-[#4562ff] text-white",
  },
  nintendo: {
    background: "bg-[#dff5ea]",
    text: "text-[#1f6a4b]",
    pill: "bg-[#2f9b68] text-white",
  },
  playstation: {
    background: "bg-[#f7dff3]",
    text: "text-[#7e2b78]",
    pill: "bg-[#c14ab4] text-white",
  },
};

function ModeButton({
  selected,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: typeof Search;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[20px] border px-5 py-5 text-left transition ${
        selected
          ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
          : "border-[color:var(--line)] bg-[color:var(--surface-strong)] hover:bg-[color:var(--surface)]"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex size-12 items-center justify-center rounded-2xl ${
            selected
              ? "bg-[color:var(--accent)] text-white"
              : "bg-[color:var(--surface-soft)] text-[color:var(--foreground)]"
          }`}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-lg font-bold text-[color:var(--foreground)]">{title}</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">{description}</div>
        </div>
      </div>
    </button>
  );
}

function MemberButton({
  name,
  gradeOrAge,
  guardianPhone,
  isSelected,
  onSelect,
}: {
  name: string;
  gradeOrAge: string;
  guardianPhone: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[18px] border px-5 py-4 text-left transition ${
        isSelected
          ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
          : "border-[color:var(--line)] bg-[color:var(--surface-strong)] hover:bg-[color:var(--surface)]"
      }`}
    >
      <div className="text-[16px] font-semibold text-[color:var(--foreground)]">{name}</div>
      <div className="mt-1 text-[13px] text-[color:var(--muted)]">
        {formatMemberAgeLabel(gradeOrAge)} · {maskPhone(guardianPhone)}
      </div>
      <div className="mt-3">
        <StatusPill tone={isSelected ? "good" : "neutral"}>
          {isSelected ? "선택 완료" : "선택"}
        </StatusPill>
      </div>
    </button>
  );
}

function ResourceCard({
  label,
  shortLabel,
  icon: Icon,
  theme,
  selected,
  free,
  waiting,
  showCounts = true,
  onClick,
}: {
  label: string;
  shortLabel: string;
  icon: typeof Monitor;
  theme: {
    background: string;
    text: string;
    pill: string;
  };
  selected: boolean;
  free: number;
  waiting: number;
  showCounts?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-full min-h-[176px] rounded-[20px] border p-5 text-left transition ${
        selected
          ? "border-[color:var(--accent)] shadow-[var(--shadow-soft)]"
          : "border-[color:var(--line)]"
      } ${theme.background}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`text-xs uppercase tracking-[0.24em] ${theme.text}`}>{shortLabel}</div>
          <div className={`mt-2 text-3xl font-black tracking-tight ${theme.text}`}>
            {label}
          </div>
        </div>
        <div className="rounded-2xl bg-white/80 p-3 text-[color:var(--foreground)]">
          <Icon className="size-6" />
        </div>
      </div>
      {showCounts ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${theme.pill}`}>
            빈 자리 {free}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-[color:var(--foreground)]">
            대기 {waiting}
          </span>
        </div>
      ) : null}
    </button>
  );
}

function TimeButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] border px-5 py-4 text-left transition ${
        selected
          ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
          : "border-[color:var(--line)] bg-[color:var(--surface-strong)] hover:bg-[color:var(--surface)]"
      }`}
    >
      <div className="text-[16px] font-semibold text-[color:var(--foreground)]">{label}</div>
    </button>
  );
}

function StepGuide({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line)] bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-[12px] font-black text-[color:var(--accent)]">
          안내
        </span>
        <p className="text-[16px] font-bold leading-7 text-[color:var(--foreground)]">
          {children}
        </p>
      </div>
    </div>
  );
}

export function KioskClient({ initial }: { initial: SnapshotEnvelope }) {
  const { snapshot, refresh } = useLiveSnapshot(initial, 5000);
  const [tab, setTab] = useState<"existing" | "new" | null>(null);
  const [step, setStep] = useState<FlowStep>("idle");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [sheetMembers, setSheetMembers] = useState<SheetMember[]>([]);
  const [isMemberSearchLoading, setIsMemberSearchLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [hasSearchedMembers, setHasSearchedMembers] = useState(false);
  const [resourceChoice, setResourceChoice] = useState<KioskResourceChoice | null>(null);
  const [pricingRuleId, setPricingRuleId] = useState("");
  const [formState, setFormState] = useState<MemberFormState>(DEFAULT_FORM);
  const [attemptedNewMemberSubmit, setAttemptedNewMemberSubmit] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);

  const visibleMembers = sheetMembers;
  const selectedMember = sheetMembers.find((member) => member.id === selectedMemberId);
  const selectedResourceType =
    resourceChoice && resourceChoice !== "space" ? resourceChoice : null;
  const pricingRules = selectedResourceType
    ? sortPricingRules(snapshot.pricingRules, selectedResourceType).filter((rule) => !rule.isExtension)
    : [];
  const effectivePricingRuleId =
    pricingRuleId && pricingRules.some((rule) => rule.id === pricingRuleId) ? pricingRuleId : "";
  const birthDateValue = getBirthDateValue(formState);
  const birthDayOptions = getBirthDayOptions(formState.birthYear, formState.birthMonth);

  const identityReady =
    tab === "existing"
      ? Boolean(selectedMember)
      : tab === "new"
        ? Boolean(
            formState.name &&
              formState.schoolName &&
              birthDateValue &&
              formState.gender &&
              formState.guardianPhone,
          )
        : false;
  const canSubmit = Boolean(
    privacyAgreed &&
    identityReady &&
      (resourceChoice === "space" || (selectedResourceType && effectivePricingRuleId)),
  );
  const resourceSummaries = {
    pc: getResourceSummary(snapshot, "pc"),
    nintendo: getResourceSummary(snapshot, "nintendo"),
    playstation: getResourceSummary(snapshot, "playstation"),
  };
  const missingNewMemberFields = {
    name: !formState.name.trim(),
    schoolName: !formState.schoolName.trim(),
    birthDate: !birthDateValue,
    gender: !formState.gender,
    guardianPhone: !formState.guardianPhone.trim(),
  };
  const showNewMemberErrors = attemptedNewMemberSubmit && tab === "new";
  const hasNewMemberErrors = Object.values(missingNewMemberFields).some(Boolean);
  const errorInputClass =
    "border-red-400 bg-red-50 text-red-950 placeholder:text-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100";
  const getInputClassName = (hasError: boolean, className = "text-[16px]") =>
    `toss-input ${className} ${showNewMemberErrors && hasError ? errorInputClass : ""}`;
  const errorText = (message: string) => (
    <p className="mt-1 text-sm font-semibold text-red-600">{message}</p>
  );

  const resetFlow = useCallback(() => {
    setStep("idle");
    setTab(null);
    setSelectedMemberId("");
    setSheetMembers([]);
    setQuery("");
    setHasSearchedMembers(false);
    setResourceChoice(null);
    setPricingRuleId("");
    setFormState(DEFAULT_FORM);
    setAttemptedNewMemberSubmit(false);
    setPrivacyAgreed(false);
    setCompletion(null);
    setNotice("");
  }, []);

  const startReception = () => {
    setStep("entry");
    setTab(null);
    setSelectedMemberId("");
    setSheetMembers([]);
    setQuery("");
    setHasSearchedMembers(false);
    setResourceChoice(null);
    setPricingRuleId("");
    setFormState(DEFAULT_FORM);
    setAttemptedNewMemberSubmit(false);
    setPrivacyAgreed(false);
    setCompletion(null);
    setNotice("");
  };

  const searchSheetMembers = async () => {
    const trimmedQuery = query.trim();
    searchInputRef.current?.blur();

    if (!trimmedQuery) {
      setNotice("이름 또는 연락처를 입력한 뒤 검색해 주세요.");
      setSheetMembers([]);
      setSelectedMemberId("");
      setHasSearchedMembers(false);
      return;
    }

    setIsMemberSearchLoading(true);
    setNotice("");
    setSelectedMemberId("");

    try {
      const params = new URLSearchParams({ q: trimmedQuery });
      const data = await getJson<{ ok: true; members: SheetMember[] }>(
        `/api/sheet-members?${params.toString()}`,
      );

      setSheetMembers(data.members);
      setHasSearchedMembers(true);
    } catch (error) {
      setSheetMembers([]);
      setHasSearchedMembers(true);
      setNotice(error instanceof Error ? error.message : "이용자 검색에 실패했습니다.");
    } finally {
      setIsMemberSearchLoading(false);
      window.setTimeout(() => {
        searchResultsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 80);
    }
  };

  const getSelectedSheetMemberPayload = () => {
    if (!selectedMember) {
      return null;
    }

    const birthYear = selectedMember.gradeOrAge || getBirthYear(selectedMember.birthDate ?? "");

    return {
      member: {
        name: selectedMember.name,
        gradeOrAge: birthYear,
        guardianPhone: selectedMember.guardianPhone,
      },
      sheetMetadata: {
        schoolName: selectedMember.schoolName,
        birthDate: selectedMember.birthDate,
        gender: selectedMember.gender,
      },
    };
  };

  const goBack = () => {
    setNotice("");

    if (step === "existing-member" || step === "new-member") {
      setStep("identity");
      return;
    }

    if (step === "consent") {
      setStep(tab === "existing" ? "existing-member" : "new-member");
      return;
    }

    if (step === "identity") {
      setStep(selectedResourceType ? "pricing" : "entry");
      return;
    }

    if (step === "pricing") {
      setStep("entry");
      return;
    }
  };

  useEffect(() => {
    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      inactivityTimerRef.current = setTimeout(() => {
        resetFlow();
      }, 30_000);
    };

    resetInactivityTimer();

    const eventTypes: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "input",
      "touchstart",
    ];

    eventTypes.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer);
    });

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }

      eventTypes.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
    };
  }, [resetFlow]);

  const speakCompletion = (message: string) => {
    if (!("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "ko-KR";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const finishCompletion = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    resetFlow();
    refresh();
  }, [refresh, resetFlow]);

  const submitVisit = () => {
    startTransition(async () => {
      try {
        if (!canSubmit || !resourceChoice) {
          setNotice("접수 정보를 다시 확인해 주세요.");
          return;
        }

        const identityPayload =
          tab === "existing"
            ? getSelectedSheetMemberPayload()
            : {
                member: {
                  name: formState.name,
                  gradeOrAge: getBirthYear(birthDateValue),
                  guardianPhone: formState.guardianPhone,
                },
                sheetMetadata: {
                  schoolName: formState.schoolName,
                  birthDate: birthDateValue,
                  gender: formState.gender,
                },
              };

        if (!identityPayload) {
          setNotice("이용자를 선택해 주세요.");
          return;
        }

        if (resourceChoice === "space") {
          await postMutation("registerSpaceVisit", {
            ...identityPayload,
            note: "공간이용",
          });
        } else {
          await postMutation("enqueueVisit", {
            ...identityPayload,
            resourceType: selectedResourceType,
            pricingRuleId: effectivePricingRuleId,
          });
        }

        const message =
          resourceChoice === "space"
            ? "접수 완료되었습니다. 재밌게 노세요!"
            : "접수 완료되었습니다. 데스크에 가서 선생님께 문의하세요.";

        setCompletion({
          kind: resourceChoice === "space" ? "space" : "paid",
          message,
        });
        speakCompletion(message);
        refresh();
        completionTimerRef.current = setTimeout(finishCompletion, 8000);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "접수 처리에 실패했습니다.");
      }
    });
  };

  const chooseResource = (nextChoice: KioskResourceChoice) => {
    if (nextChoice === "space") {
      setResourceChoice("space");
      setPricingRuleId("");
      setTab(null);
      setSelectedMemberId("");
      setQuery("");
      setHasSearchedMembers(false);
      setAttemptedNewMemberSubmit(false);
      setPrivacyAgreed(false);
      setNotice("");
      setStep("identity");
      return;
    }

    setResourceChoice(nextChoice);
    setPricingRuleId("");
    setTab(null);
    setSelectedMemberId("");
    setQuery("");
    setHasSearchedMembers(false);
    setAttemptedNewMemberSubmit(false);
    setPrivacyAgreed(false);
    setNotice("");
    setStep("pricing");
  };

  const choosePricingRule = (nextPricingRuleId: string) => {
    setPricingRuleId(nextPricingRuleId);
    setPrivacyAgreed(false);
    setNotice("");
    setStep("identity");
  };

  const goToConsentStep = () => {
    if (tab === "new") {
      setAttemptedNewMemberSubmit(true);

      if (hasNewMemberErrors) {
        setNotice("빨간 표시된 정보를 모두 입력해 주세요.");
        return;
      }
    }

    if (!identityReady) {
      setNotice("이용자 정보를 먼저 선택하거나 입력해 주세요.");
      return;
    }

    setPrivacyAgreed(false);
    setNotice("");
    setStep("consent");
  };

  const updateBirthDatePart = (
    key: "birthYear" | "birthMonth" | "birthDay",
    value: string,
  ) => {
    setFormState((current) => {
      const next = { ...current, [key]: value };
      const validDays = getBirthDayOptions(next.birthYear, next.birthMonth);

      if (next.birthDay && !validDays.includes(next.birthDay)) {
        next.birthDay = validDays.at(-1) ?? "";
      }

      return next;
    });
    setNotice("");
  };

  const kioskShell = (
    children: ReactNode,
    stepLabel: string,
    canGoBack = true,
    guideText?: string,
  ) => (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-5 text-[color:var(--foreground)] sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex min-h-10 items-center justify-between gap-3">
          {canGoBack ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-[13px] font-semibold text-[color:var(--foreground)] shadow-sm"
            >
              <ArrowLeft className="size-4" />
              뒤로
            </button>
          ) : (
            <div />
          )}
          <div className="rounded-full bg-[color:var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--muted)]">
            {stepLabel}
          </div>
        </header>
        {guideText ? <StepGuide>{guideText}</StepGuide> : null}
        {children}
        {notice ? (
          <div className="rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-center text-sm text-[color:var(--foreground)]">
            {notice}
          </div>
        ) : null}
        {completion ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-[#111827]/45 px-5">
            <div className="w-full max-w-md rounded-[28px] bg-white p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-3xl">
                🎉
              </div>
              <h2 className="mt-5 text-[30px] font-black tracking-tight text-[color:var(--foreground)]">
                접수 완료!
              </h2>
              <p className="mt-3 text-[20px] font-bold leading-8 text-[color:var(--foreground)]">
                {completion.message}
              </p>
              <button
                type="button"
                onClick={finishCompletion}
                className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-5 py-4 text-[16px] font-bold text-white"
              >
                확인
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const idleScreen = (
    <section
      className="grid min-h-[84vh] cursor-pointer items-center"
      onClick={startReception}
      role="presentation"
    >
      <div className="relative overflow-hidden rounded-[32px] border border-[color:var(--line)] bg-gradient-to-br from-[#fff7db] via-white to-[#e5f0ff] p-8 text-center shadow-[var(--shadow-soft)] sm:p-12">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[color:var(--accent-soft)] blur-2xl" />
        <div className="absolute -bottom-12 -left-8 size-44 rounded-full bg-[#dff5ea] blur-2xl" />
        <div className="relative">
          <div className="mx-auto inline-flex rounded-full bg-white/80 px-4 py-2 text-sm font-black tracking-[0.2em] text-[color:var(--accent)] shadow-sm">
            NOWON YOUTH CENTER
          </div>
          <h1 className="mt-7 text-[46px] font-black tracking-tight text-[color:var(--foreground)] sm:text-[64px]">
            나놀다판
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[20px] font-bold leading-8 text-[color:var(--foreground)] sm:text-[24px]">
            놀고, 쉬고, 친구와 만나는 청소년 놀이 공간
          </p>
          <p className="mt-3 text-[16px] font-semibold text-[color:var(--muted)]">
            접수하려면 화면을 터치하거나 아래 버튼을 눌러주세요.
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              startReception();
            }}
            className="mt-9 rounded-full bg-[color:var(--accent)] px-10 py-4 text-[18px] font-black text-white shadow-[0_14px_36px_rgba(69,98,255,0.24)]"
          >
            접수 시작하기
          </button>
        </div>
      </div>
    </section>
  );

  const entryScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card rounded-[24px] p-6 sm:p-8">
        <h2 className="text-[30px] font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
          이용 종류를 고르세요
        </h2>
        <p className="mt-3 text-[17px] font-semibold leading-7 text-[color:var(--muted)]">
          유료 놀이는 시간을 고른 뒤 접수하고, 공간 이용은 바로 이용자 선택으로
          넘어갑니다.
        </p>
        <div className="mt-7 grid items-stretch gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <fieldset className="flex h-full flex-col rounded-[18px] border border-[color:var(--line)] px-4 pb-5 pt-3 sm:px-5">
            <legend className="px-3 text-[13px] font-black tracking-[0.22em] text-[color:var(--accent)]">
              유료 놀이
            </legend>
            <div className="grid flex-1 gap-4 md:grid-cols-3">
              {(["pc", "nintendo", "playstation"] as const).map((type) => (
                <ResourceCard
                  key={type}
                  label={type === "playstation" ? "플스" : RESOURCE_TYPE_LABELS[type]}
                  shortLabel={RESOURCE_TYPE_SHORT_LABELS[type]}
                  icon={type === "pc" ? Monitor : Gamepad2}
                  theme={RESOURCE_CARD_THEME[type]}
                  selected={resourceChoice === type}
                  free={resourceSummaries[type].free}
                  waiting={resourceSummaries[type].waiting}
                  showCounts={false}
                  onClick={() => chooseResource(type)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="flex h-full flex-col rounded-[18px] border border-[color:var(--line)] px-4 pb-5 pt-3 sm:px-5">
            <legend className="px-3 text-[13px] font-black tracking-[0.22em] text-[color:var(--muted)]">
              무료
            </legend>
            <ResourceCard
              label="공간 이용"
              shortLabel="SPACE"
              icon={Users}
              theme={{
                background: "bg-[#f2f4f6]",
                text: "text-[#4e5968]",
                pill: "bg-white text-[#4e5968]",
              }}
              selected={resourceChoice === "space"}
              free={0}
              waiting={0}
              showCounts={false}
              onClick={() => chooseResource("space")}
            />
          </fieldset>
        </div>
      </div>
    </section>
  );

  const identityScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <h2 className="text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          이용자를
          <br />
          선택해 주세요
        </h2>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
          <ModeButton
            selected={tab === "existing"}
            icon={Search}
            title="재방문"
            description="이름으로 찾기"
            onClick={() => {
              setTab("existing");
              setAttemptedNewMemberSubmit(false);
              setNotice("");
              setStep("existing-member");
            }}
          />
          <ModeButton
            selected={tab === "new"}
            icon={UserRoundPlus}
            title="첫 방문"
            description="정보 입력"
            onClick={() => {
              setTab("new");
              setAttemptedNewMemberSubmit(false);
              setNotice("");
              setStep("new-member");
            }}
          />
        </div>
      </div>
    </section>
  );

  const existingMemberScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <h2 className="text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          이용자를
          <br />
          찾아주세요
        </h2>
        <label className="mt-6 block text-[16px] font-semibold text-[color:var(--foreground)]">
          이름 또는 연락처
        </label>
        <div className="relative mt-2 flex items-center gap-3 border-b-2 border-[color:var(--line)] px-1 py-1">
          <Search className="size-5 shrink-0 text-[color:var(--muted)]" />
          <input
            ref={searchInputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedMemberId("");
              setSheetMembers([]);
              setHasSearchedMembers(false);
              setNotice("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchSheetMembers();
              }
            }}
            placeholder="예: 김하늘"
            className="toss-input min-w-0 flex-1 border-0 py-3 text-[16px]"
          />
          <button
            type="button"
            onClick={() => void searchSheetMembers()}
            disabled={isMemberSearchLoading}
            aria-busy={isMemberSearchLoading}
            className="shrink-0 rounded-full bg-[color:var(--accent)] px-5 py-2.5 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45"
          >
            검색
          </button>
        </div>
        <div ref={searchResultsRef} className="mt-6 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
          {!isMemberSearchLoading && !hasSearchedMembers ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-6 text-center text-[color:var(--muted)]">
              이름을 다 쓰고 파란 검색 버튼을 눌러요.
            </div>
          ) : null}
          {visibleMembers.slice(0, 8).map((member) => (
            <MemberButton
              key={member.id}
              name={member.name}
              gradeOrAge={member.gradeOrAge}
              guardianPhone={member.guardianPhone}
              isSelected={selectedMemberId === member.id}
              onSelect={() => {
                setSelectedMemberId(member.id);
                setNotice("");
              }}
            />
          ))}
          {!isMemberSearchLoading && hasSearchedMembers && visibleMembers.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-6 text-center text-[color:var(--muted)]">
              <p className="text-[16px] font-semibold">이름이 안 보여요.</p>
              <button
                type="button"
                onClick={() => {
                  setTab("new");
                  setSelectedMemberId("");
                  setSheetMembers([]);
                  setQuery("");
                  setHasSearchedMembers(false);
                  setAttemptedNewMemberSubmit(false);
                  setNotice("");
                  setStep("new-member");
                }}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-[15px] font-bold text-white"
              >
                새 등록으로 접수하기
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={goToConsentStep}
          disabled={!identityReady || isPending}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          다음
        </button>
      </div>
    </section>
  );

  const newMemberScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <h2 className="text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          정보를
          <br />
          입력해 주세요
        </h2>
        <div className="relative mt-6 grid gap-4">
          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            학생 이름
          </label>
          <input
            value={formState.name}
            onChange={(event) =>
              setFormState((current) => ({ ...current, name: event.target.value }))
            }
            className={getInputClassName(missingNewMemberFields.name)}
            placeholder="예: 김하늘"
          />
          {showNewMemberErrors && missingNewMemberFields.name
            ? errorText("학생 이름을 입력해 주세요.")
            : null}

          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            학교명
          </label>
          <input
            value={formState.schoolName}
            onChange={(event) =>
              setFormState((current) => ({ ...current, schoolName: event.target.value }))
            }
            className={getInputClassName(missingNewMemberFields.schoolName)}
            placeholder="예: 판초등학교"
          />
          {showNewMemberErrors && missingNewMemberFields.schoolName
            ? errorText("학교명을 입력해 주세요.")
            : null}

          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            생년월일
          </label>
          <div className="grid grid-cols-3 gap-3">
            <select
              value={formState.birthYear}
              onChange={(event) => updateBirthDatePart("birthYear", event.target.value)}
              className={getInputClassName(
                missingNewMemberFields.birthDate,
                "min-h-[58px] text-[17px] font-semibold",
              )}
            >
              <option value="">연도</option>
              {BIRTH_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
            <select
              value={formState.birthMonth}
              onChange={(event) => updateBirthDatePart("birthMonth", event.target.value)}
              className={getInputClassName(
                missingNewMemberFields.birthDate,
                "min-h-[58px] text-[17px] font-semibold",
              )}
            >
              <option value="">월</option>
              {BIRTH_MONTH_OPTIONS.map((month) => (
                <option key={month} value={month}>
                  {Number(month)}월
                </option>
              ))}
            </select>
            <select
              value={formState.birthDay}
              onChange={(event) => updateBirthDatePart("birthDay", event.target.value)}
              className={getInputClassName(
                missingNewMemberFields.birthDate,
                "min-h-[58px] text-[17px] font-semibold",
              )}
            >
              <option value="">일</option>
              {birthDayOptions.map((day) => (
                <option key={day} value={day}>
                  {Number(day)}일
                </option>
              ))}
            </select>
          </div>
          {showNewMemberErrors && missingNewMemberFields.birthDate
            ? errorText("생년월일을 모두 선택해 주세요.")
            : null}

          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            성별
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["male", "남"],
              ["female", "여"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFormState((current) => ({
                    ...current,
                    gender: value as MemberFormState["gender"],
                  }));
                  setNotice("");
                }}
                className={`rounded-[18px] border px-5 py-4 text-[17px] font-bold transition ${
                  formState.gender === value
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                    : showNewMemberErrors && missingNewMemberFields.gender
                      ? "border-red-400 bg-red-50 text-red-700"
                    : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {showNewMemberErrors && missingNewMemberFields.gender
            ? errorText("성별을 선택해 주세요.")
            : null}

          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            보호자 연락처
          </label>
          <input
            value={formState.guardianPhone}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                guardianPhone: event.target.value,
              }))
            }
            className={getInputClassName(missingNewMemberFields.guardianPhone)}
            placeholder="예: 01012345678"
          />
          {showNewMemberErrors && missingNewMemberFields.guardianPhone
            ? errorText("보호자 연락처를 입력해 주세요.")
            : null}
        </div>
        <button
          type="button"
          onClick={goToConsentStep}
          disabled={isPending}
          className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          다음
        </button>
      </div>
    </section>
  );

  const consentScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <h2 className="text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          개인정보 수집 동의
        </h2>
        <div className="mt-6 space-y-4 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--surface)] p-5">
          <div className="text-[15px] font-semibold text-[color:var(--foreground)]">
            개인정보 수집 및 이용 안내
          </div>
          <div className="space-y-3 text-[15px] font-semibold leading-7 text-[color:var(--foreground)]">
            <p>
              <strong>수집항목</strong>: 학생 이름, 학교명, 생년월일, 성별,
              보호자 연락처, 이용 항목과 접수·이용 기록
            </p>
            <p>
              <strong>이용목적</strong>: 나놀다판 이용 접수, 현장 운영과 안전 확인,
              노원청소년센터 행사 홍보 및 만족도 조사 문자 발송
            </p>
            <p>
              <strong>보유·이용기간</strong>: 운영 및 내부 관리 목적 달성 후 센터 기준에
              따라 보관·파기합니다.
            </p>
            <p>
              <strong>동의 거부 안내</strong>: 개인정보 수집·이용에 동의하지 않을 수
              있으며, 이 경우 키오스크 접수가 제한될 수 있어 선생님께 문의해 주세요.
            </p>
          </div>
        </div>
        <label className="relative mt-5 flex items-start gap-3 rounded-[18px] border border-[color:var(--line)] bg-white p-5">
          <input
            type="checkbox"
            checked={privacyAgreed}
            onChange={(event) => {
              setPrivacyAgreed(event.target.checked);
              setNotice("");
            }}
            className="mt-1 size-5 accent-[color:var(--accent)]"
          />
          <span className="text-[16px] font-semibold leading-7 text-[color:var(--foreground)]">
            위 개인정보 수집 및 이용 안내를 확인했고 동의합니다.
          </span>
        </label>
        <button
          type="button"
          onClick={submitVisit}
          disabled={!canSubmit || isPending}
          className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-[color:var(--accent)] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isPending ? "접수 중..." : "동의하고 접수하기"}
        </button>
      </div>
    </section>
  );

  const pricingScreen = selectedResourceType ? (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <h2 className="text-4xl font-black tracking-tight text-[color:var(--foreground)]">
          시간을 고르세요
        </h2>
        <div className="relative mt-6 grid gap-3">
          {pricingRules.map((rule) => (
            <TimeButton
              key={rule.id}
              label={rule.label}
              selected={effectivePricingRuleId === rule.id}
              onClick={() => choosePricingRule(rule.id)}
            />
          ))}
        </div>
      </div>
    </section>
  ) : null;

  if (step === "idle") {
    return kioskShell(idleScreen, "대기", false);
  }

  if (step === "entry") {
    return kioskShell(
      entryScreen,
      "1 / 5",
      false,
      "먼저 이용할 항목을 선택해 주세요. 공간 이용은 시간 선택 없이 바로 접수로 이어집니다.",
    );
  }

  if (step === "pricing") {
    return kioskShell(
      pricingScreen,
      "2 / 5",
      true,
      "이용 시간을 선택해 주세요. 비용은 키오스크에 표시하지 않고 접수 후 선생님께 문의하도록 안내합니다.",
    );
  }

  if (step === "identity") {
    return kioskShell(
      identityScreen,
      resourceChoice === "space" ? "2 / 4" : "3 / 5",
      true,
      "이미 방문한 적이 있으면 재방문, 처음이면 첫 방문을 선택해 주세요.",
    );
  }

  if (step === "existing-member") {
    return kioskShell(
      existingMemberScreen,
      resourceChoice === "space" ? "3 / 4" : "4 / 5",
      true,
      "이름 또는 연락처를 입력하고 검색한 뒤, 내 이름을 선택해 주세요. 검색되지 않으면 새 등록으로 이어갈 수 있습니다.",
    );
  }

  if (step === "new-member") {
    return kioskShell(
      newMemberScreen,
      resourceChoice === "space" ? "3 / 4" : "4 / 5",
      true,
      "필수 정보를 차례대로 입력해 주세요. 빠진 항목은 빨간색으로 표시됩니다.",
    );
  }

  return kioskShell(
    consentScreen,
    resourceChoice === "space" ? "4 / 4" : "5 / 5",
    true,
    "동의 내용을 확인하고 체크하면 접수가 완료됩니다.",
  );
}
