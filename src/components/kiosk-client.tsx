"use client";

import type { ReactNode } from "react";
import { useCallback, useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheckBig,
  Gamepad2,
  Monitor,
  Search,
  Ticket,
  UserRoundPlus,
  Users,
} from "lucide-react";

import { PageChrome } from "@/components/page-chrome";
import { StatusPill } from "@/components/ui-primitives";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { postMutation } from "@/lib/client-api";
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_SHORT_LABELS,
  type ResourceType,
} from "@/lib/domain";
import { sortPricingRules, getResourceSummary } from "@/lib/selectors";
import type { SnapshotEnvelope } from "@/lib/snapshot";
import { formatCurrency, formatPhone } from "@/lib/utils";

type VisitResult = {
  visitId: string;
  queueEntryId?: string;
  ticketNumber: string;
  queueStatus: string;
};

type FlowStep =
  | "identity"
  | "existing-member"
  | "new-member"
  | "resource"
  | "pricing"
  | "confirm"
  | "complete";
type KioskResourceChoice = ResourceType | "space";

type MemberFormState = {
  name: string;
  schoolName: string;
  birthDate: string;
  gender: "male" | "female" | "";
  guardianPhone: string;
};

const DEFAULT_FORM: MemberFormState = {
  name: "",
  schoolName: "",
  birthDate: "",
  gender: "",
  guardianPhone: "",
};

const CURRENT_YEAR = new Date().getFullYear();

function formatMemberAgeLabel(value: string) {
  return /^\d{4}$/.test(value) ? `${value}년생` : value;
}

function getBirthYear(value: string) {
  return value.slice(0, 4);
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
        {formatMemberAgeLabel(gradeOrAge)} · {formatPhone(guardianPhone)}
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
      className={`rounded-[20px] border p-5 text-left transition ${
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
  amount,
  selected,
  onClick,
}: {
  label: string;
  amount: number;
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
      <div className="tabular-nums mt-1 text-[13px] text-[color:var(--muted)]">
        {formatCurrency(amount)}
      </div>
    </button>
  );
}

export function KioskClient({ initial }: { initial: SnapshotEnvelope }) {
  const { snapshot, refresh } = useLiveSnapshot(initial, 5000);
  const [tab, setTab] = useState<"existing" | "new" | null>(null);
  const [step, setStep] = useState<FlowStep>("identity");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [resourceChoice, setResourceChoice] = useState<KioskResourceChoice | null>(null);
  const [pricingRuleId, setPricingRuleId] = useState("");
  const [formState, setFormState] = useState<MemberFormState>(DEFAULT_FORM);
  const [result, setResult] = useState<VisitResult | null>(null);
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleMembers = snapshot.members.filter((member) => {
    if (!deferredQuery.trim()) {
      return true;
    }

    const target = `${member.name} ${member.guardianPhone} ${member.gradeOrAge}`.toLowerCase();
    return target.includes(deferredQuery.trim().toLowerCase());
  });

  const selectedMember = snapshot.members.find((member) => member.id === selectedMemberId);
  const selectedResourceType =
    resourceChoice && resourceChoice !== "space" ? resourceChoice : null;
  const pricingRules = selectedResourceType
    ? sortPricingRules(snapshot.pricingRules, selectedResourceType).filter((rule) => !rule.isExtension)
    : [];
  const effectivePricingRuleId =
    pricingRuleId && pricingRules.some((rule) => rule.id === pricingRuleId) ? pricingRuleId : "";
  const selectedPricingRule = snapshot.pricingRules.find(
    (rule) => rule.id === effectivePricingRuleId,
  );

  const identityReady =
    tab === "existing"
      ? Boolean(selectedMember)
      : tab === "new"
        ? Boolean(
            formState.name &&
              formState.schoolName &&
              formState.birthDate &&
              formState.gender &&
              formState.guardianPhone,
          )
        : false;
  const canSubmit = Boolean(identityReady && selectedResourceType && effectivePricingRuleId);
  const resourceSummaries = {
    pc: getResourceSummary(snapshot, "pc"),
    nintendo: getResourceSummary(snapshot, "nintendo"),
    playstation: getResourceSummary(snapshot, "playstation"),
  };
  const selectedSummary = selectedResourceType ? resourceSummaries[selectedResourceType] : null;
  const willQueue = selectedSummary
    ? selectedSummary.waiting + selectedSummary.ready > 0 || selectedSummary.free <= 0
    : false;

  const resetFlow = useCallback(() => {
    setStep("identity");
    setTab(null);
    setSelectedMemberId("");
    setQuery("");
    setResourceChoice(null);
    setPricingRuleId("");
    setFormState(DEFAULT_FORM);
    setResult(null);
    setNotice("");
  }, []);

  const goBack = () => {
    setNotice("");

    if (step === "existing-member" || step === "new-member") {
      setStep("identity");
      return;
    }

    if (step === "resource") {
      setStep(tab === "existing" ? "existing-member" : "new-member");
      return;
    }

    if (step === "pricing") {
      setStep("resource");
      return;
    }

    if (step === "confirm") {
      setStep("pricing");
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

      eventTypes.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
    };
  }, [resetFlow]);

  const goToResourceStep = () => {
    if (!identityReady) {
      setNotice("먼저 아이 정보를 입력하거나 선택해 주세요.");
      return;
    }

    setNotice("");
    setStep("resource");
  };

  const submitVisit = () => {
    startTransition(async () => {
      try {
        const payload =
          tab === "existing"
            ? {
                existingMemberId: selectedMemberId,
                resourceType: selectedResourceType,
                pricingRuleId: effectivePricingRuleId,
              }
            : {
                member: {
                  name: formState.name,
                  gradeOrAge: getBirthYear(formState.birthDate),
                  guardianPhone: formState.guardianPhone,
                },
                sheetMetadata: {
                  schoolName: formState.schoolName,
                  birthDate: formState.birthDate,
                  gender: formState.gender,
                },
                resourceType: selectedResourceType,
                pricingRuleId: effectivePricingRuleId,
              };

        const nextResult = await postMutation<VisitResult>("enqueueVisit", payload);
        setResult(nextResult);
        setNotice("접수가 완료되었어요.");
        setStep("complete");
        refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "접수 처리에 실패했습니다.");
      }
    });
  };

  const chooseResource = (nextChoice: KioskResourceChoice) => {
    if (nextChoice === "space") {
      startTransition(async () => {
        try {
          const payload =
            tab === "existing"
              ? {
                  existingMemberId: selectedMemberId,
                }
              : {
                member: {
                    name: formState.name,
                    gradeOrAge: getBirthYear(formState.birthDate),
                    guardianPhone: formState.guardianPhone,
                  },
                  sheetMetadata: {
                    schoolName: formState.schoolName,
                    birthDate: formState.birthDate,
                    gender: formState.gender,
                  },
                };

          await postMutation("registerSpaceVisit", payload);
          resetFlow();
          refresh();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "공간 이용 등록에 실패했습니다.");
        }
      });
      return;
    }

    setResourceChoice(nextChoice);
    setPricingRuleId("");
    setNotice("");
    setStep("pricing");
  };

  const choosePricingRule = (nextPricingRuleId: string) => {
    setPricingRuleId(nextPricingRuleId);
    setNotice("");
    setStep("confirm");
  };

  const kioskShell = (children: ReactNode, stepLabel: string, canGoBack = true) => (
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
        {children}
        {notice ? (
          <div className="rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-center text-sm text-[color:var(--foreground)]">
            {notice}
          </div>
        ) : null}
      </div>
    </div>
  );

  const identityScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
          STEP 1
        </div>
        <h2 className="mt-3 text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          방문 유형을
          <br />
          선택해 주세요
        </h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ModeButton
            selected={tab === "existing"}
            icon={Search}
            title="재방문"
            description="이름으로 찾기"
            onClick={() => {
              setTab("existing");
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
        <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
          STEP 2
        </div>
        <h2 className="mt-3 text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          이용자를
          <br />
          찾아주세요
        </h2>
        <label className="mt-6 block text-[16px] font-semibold text-[color:var(--foreground)]">
          이름 또는 연락처
        </label>
        <div className="mt-2 flex items-center gap-3 border-b-2 border-[color:var(--line)] px-1 py-1">
          <Search className="size-5 text-[color:var(--muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 김하늘"
            className="toss-input border-0 py-3 text-[16px]"
          />
        </div>
        <div className="mt-6 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
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
          {visibleMembers.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-6 text-center text-[color:var(--muted)]">
              검색 결과가 없어요. 첫 방문으로 돌아가 새로 등록해 주세요.
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={goToResourceStep}
          disabled={!selectedMember}
          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[color:var(--accent)] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          다음
          <ArrowRight className="size-5" />
        </button>
      </div>
    </section>
  );

  const newMemberScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
          STEP 2
        </div>
        <h2 className="mt-3 text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
          정보를
          <br />
          입력해 주세요
        </h2>
        <div className="mt-6 grid gap-4">
          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            학생 이름
          </label>
          <input
            value={formState.name}
            onChange={(event) =>
              setFormState((current) => ({ ...current, name: event.target.value }))
            }
            className="toss-input text-[16px]"
            placeholder="예: 김하늘"
          />

          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            학교명
          </label>
          <input
            value={formState.schoolName}
            onChange={(event) =>
              setFormState((current) => ({ ...current, schoolName: event.target.value }))
            }
            className="toss-input text-[16px]"
            placeholder="예: 판초등학교"
          />

          <label className="block text-[16px] font-semibold text-[color:var(--foreground)]">
            생년월일
          </label>
          <input
            type="date"
            value={formState.birthDate}
            min={`${CURRENT_YEAR - 25}-01-01`}
            max={`${CURRENT_YEAR}-12-31`}
            onChange={(event) => {
              setFormState((current) => ({ ...current, birthDate: event.target.value }));
              setNotice("");
            }}
            className="toss-input min-h-[58px] text-[17px] font-semibold"
          />

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
                    : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
            className="toss-input text-[16px]"
            placeholder="예: 01012345678"
          />
        </div>
        <button
          type="button"
          onClick={goToResourceStep}
          disabled={!identityReady}
          className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[color:var(--accent)] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          다음
          <ArrowRight className="size-5" />
        </button>
      </div>
    </section>
  );

  const resourceScreen = (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card rounded-[24px] p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
          STEP 3
        </div>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-[color:var(--foreground)]">
          이용 종류를 고르세요
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(["pc", "nintendo", "playstation"] as const).map((type) => (
            <ResourceCard
              key={type}
              label={RESOURCE_TYPE_LABELS[type]}
              shortLabel={RESOURCE_TYPE_SHORT_LABELS[type]}
              icon={type === "pc" ? Monitor : Gamepad2}
              theme={RESOURCE_CARD_THEME[type]}
              selected={resourceChoice === type}
              free={resourceSummaries[type].free}
              waiting={resourceSummaries[type].waiting}
              onClick={() => chooseResource(type)}
            />
          ))}
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
        </div>
      </div>
    </section>
  );

  const pricingScreen = selectedResourceType ? (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
          STEP 4
        </div>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-[color:var(--foreground)]">
          시간을 고르세요
        </h2>
        <p className="mt-3 text-[15px] text-[color:var(--muted)]">
          {RESOURCE_TYPE_LABELS[selectedResourceType]} 이용 시간을 선택하면 접수 확인 화면으로
          넘어갑니다.
        </p>
        <div className="mt-6 grid gap-3">
          {pricingRules.map((rule) => (
            <TimeButton
              key={rule.id}
              label={rule.label}
              amount={rule.amount}
              selected={effectivePricingRuleId === rule.id}
              onClick={() => choosePricingRule(rule.id)}
            />
          ))}
        </div>
      </div>
    </section>
  ) : null;

  const confirmScreen = selectedResourceType && selectedPricingRule ? (
    <section className="grid min-h-[80vh] items-center">
      <div className="surface-card mx-auto w-full max-w-3xl rounded-[24px] p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
          STEP 5
        </div>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-[color:var(--foreground)]">
          접수 내용을 확인하세요
        </h2>

        <div className="mt-6 space-y-4 rounded-[20px] border border-[color:var(--line)] bg-white p-5">
          <div>
            <div className="text-sm text-[color:var(--muted)]">이용자</div>
            <div className="mt-1 text-2xl font-black tracking-tight text-[color:var(--foreground)]">
              {selectedMember?.name ?? formState.name}
            </div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              {formatMemberAgeLabel(
                selectedMember?.gradeOrAge ?? getBirthYear(formState.birthDate),
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-[color:var(--muted)]">놀 거리</div>
            <div className="mt-1 text-2xl font-black tracking-tight text-[color:var(--foreground)]">
              {RESOURCE_TYPE_LABELS[selectedResourceType]}
            </div>
          </div>
          <div>
            <div className="text-sm text-[color:var(--muted)]">시간권</div>
            <div className="mt-1 text-xl font-bold text-[color:var(--foreground)]">
              {selectedPricingRule.label} · {formatCurrency(selectedPricingRule.amount)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={submitVisit}
          disabled={!canSubmit || isPending}
          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[color:var(--accent)] px-6 py-4 text-[16px] font-semibold text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Ticket className="size-5" />
          {isPending ? "접수 중..." : willQueue ? "대기 등록하기" : "관리자 안내 받기"}
        </button>
      </div>
    </section>
  ) : null;

  if (step === "identity") {
    return kioskShell(identityScreen, "1 / 5", false);
  }

  if (step === "existing-member") {
    return kioskShell(existingMemberScreen, "2 / 5");
  }

  if (step === "new-member") {
    return kioskShell(newMemberScreen, "2 / 5");
  }

  if (step === "resource") {
    return kioskShell(resourceScreen, "3 / 5");
  }

  if (step === "pricing") {
    return kioskShell(pricingScreen, "4 / 5");
  }

  if (step === "confirm") {
    return kioskShell(confirmScreen, "5 / 5");
  }

  return (
    <PageChrome active="kiosk" compact>
      {step === "complete" ? (
        <section className="surface-card rounded-[28px] p-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <CircleCheckBig className="size-4" />
              접수 완료
            </div>

            <p className="mt-6 text-lg leading-8 text-[color:var(--muted)]">
              {selectedMember?.name ?? formState.name} 접수 완료
            </p>
            <p className="mt-1 text-base leading-7 text-[color:var(--muted)]">
              {result?.queueStatus === "awaiting_payment"
                ? "관리자에게 가서 결제해 주세요"
                : result?.queueStatus === "ready"
                  ? "호출 안내를 확인해 주세요"
                  : "안내를 기다려 주세요"}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={resetFlow}
                className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-7 py-4 text-[16px] font-semibold text-white"
              >
                다음 친구 접수하기
              </button>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-7 py-4 text-lg font-semibold text-[color:var(--foreground)]"
              >
                다시 선택하기
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </PageChrome>
  );
}
