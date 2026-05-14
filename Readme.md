# 나놀다판 운영 자동화

현장 종이 접수증과 구글 스프레드시트 운영을 `키오스크 + 관리자 화면 + 대기 보드` 구조로 바꾸기 위한 Next.js 앱입니다.

## 포함된 기능

- `kiosk`: 재방문 회원 검색, 신규 등록, 자원/시간권 선택, 대기 등록, 번호 발급
- `admin`: 결제기록, 세션 시작/종료, 연장, 노쇼 처리, 리포트, 알림 설정
- `board`: 입장 가능 번호 표시, 현재 이용 현황, 브라우저 TTS 호출
- `PWA`: 태블릿 설치형 운영을 위한 manifest + service worker
- `Local PostgreSQL-ready`: 기본은 데모 모드지만, Drizzle 스키마와 로컬 PostgreSQL 연결 준비를 포함

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 아래 경로를 열면 됩니다.

- `/`
- `/kiosk`
- `/admin`
- `/board`

## Docker 로컬 테스트

DB 없이 현재 메모리 기반 데모 저장소로만 테스트하려면 아래 명령을 사용합니다.

```bash
npm run docker:up
```

직접 실행하려면 아래 명령도 같습니다.

```bash
COMPOSE_BAKE=false docker compose up --build -d
```

이 머신에서는 Docker Desktop의 `compose + bake/buildx` 기본 경로가 `exporting to image` 단계에서 멈추는 경우가 있어 `COMPOSE_BAKE=false`를 기본값으로 사용합니다.

브라우저에서 아래 주소를 열면 됩니다.

- `http://localhost:3000`
- `http://localhost:3000/kiosk`
- `http://localhost:3000/admin`
- `http://localhost:3000/board`

이 모드는 `DATABASE_URL`을 넣지 않으므로 Postgres 없이도 바로 실행됩니다. 컨테이너를 재시작하면 데이터는 초기화됩니다.

중지와 로그 확인은 아래 명령을 사용합니다.

```bash
npm run docker:logs
npm run docker:down
```

## 데모 모드

- 기본값은 서버 메모리 기반 데모 저장소입니다.
- 재시작하면 데이터는 초기화됩니다.
- 관리자 화면의 `데모 초기화` 버튼으로 시드 상태를 다시 만들 수 있습니다.

## 로컬 PostgreSQL 준비

`.env.example`을 참고해서 아래 값을 채웁니다.

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/autopan
```

마이그레이션과 시드는 아래 명령을 사용합니다.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Drizzle 스키마는 [src/db/schema.ts](/Users/ksj/Desktop/02_Work/Projects/autoPAN/src/db/schema.ts), 생성된 SQL은 [src/db/migrations/0000_whole_klaw.sql](/Users/ksj/Desktop/02_Work/Projects/autoPAN/src/db/migrations/0000_whole_klaw.sql) 에 있습니다.

## Ubuntu 자체호스팅

센터 내부 윈도우/우분투 서버로 직접 운영할 때는 아래 문서를 따릅니다.

- [Ubuntu self-hosting guide](./docs/ubuntu-self-hosting.md)
- [Local network runbook](./docs/local-network-runbook.md)
- [Systemd service examples](./deploy/systemd/)
- [Caddy config](./deploy/caddy/Caddyfile)
- [Backup script](./scripts/backup-postgres.sh)

## 참고 메모

- 현재 구현은 실시간 구독 대신 3~5초 폴링으로 화면을 동기화합니다.
- 브라우저 TTS는 `/board` 화면이 `tts_events`를 읽고 `speechSynthesis`로 재생합니다.
- 실제 카드 승인 단말 연동, 먹거리 POS, 모바일 원격 예약은 v1 범위에서 제외했습니다.
