export const dynamic = "force-dynamic";

export default function BoardPage() {
  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-10 text-[color:var(--foreground)] sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <section className="surface-card rounded-[28px] px-6 py-8 sm:px-8">
          <div className="text-[12px] font-semibold text-[color:var(--accent)]">
            사용 안 함
          </div>
          <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[34px]">
            공개 보드는 지금 사용하지 않습니다.
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-[color:var(--muted)]">
            현재 운영은 키오스크 접수와 관리자 화면 중심입니다. 대기 안내는 공개 보드 대신
            관리자 화면과 TTS 호출로 진행합니다.
          </p>
          <div className="mt-6 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--surface)] px-5 py-4 text-[14px] leading-6 text-[color:var(--muted-strong)]">
            접수는 <strong className="text-[color:var(--foreground)]">/kiosk</strong>, 운영 처리는{" "}
            <strong className="text-[color:var(--foreground)]">/admin</strong> 에서 진행합니다.
          </div>
        </section>
      </div>
    </div>
  );
}
