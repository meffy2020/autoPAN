# autoPAN

노원청소년센터 3층 나놀다판에서 사용하는 태블릿 접수 키오스크.

청소년/보호자가 키오스크에서 이용 종류를 선택하고 회원 정보를 입력하면, Google Sheets에 접수 기록을 저장한다. 현재 운영 화면은 `/kiosk`를 기준으로 한다.

## Screenshots

![kiosk tablet screenshot](./docs/assets/kiosk-tablet.png)

![kiosk desktop screenshot](./docs/assets/kiosk-home.png)

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Google Sheets API
- Vercel

## Features

- 태블릿 키오스크 접수
- 첫 방문 회원 정보 입력
- 재방문 회원 검색
- PC / 닌텐도 / 플스 / 공간 이용 선택
- 유료 이용 시간권 선택
- Google Sheets 접수 기록 저장
- 30초 무입력 시 첫 화면 복귀
- 배포 환경의 `/kiosk` 라우트 잠금

## Routes

| Route | Description |
| --- | --- |
| `/kiosk` | 현장 접수 키오스크 |
| `/api/sheet-members` | Google Sheets 기존 회원 조회 |
| `/api/mutations` | 접수 및 상태 변경 API |
| `/api/state` | 현재 상태 조회 API |

`src/proxy.ts`에서 공개 접근을 `/kiosk` 중심으로 제한한다.

## Google Sheets

기존 회원 조회는 `사용자DB` 탭을 읽는다. 기본 범위는 `.env.example`의 `GOOGLE_SHEETS_MEMBER_RANGE`를 따른다.

필수 헤더:

- `이름`
- `보호자연락처`

선택 헤더:

- `학교명`
- `생년월일`
- `성별`
- `출생연도`

접수 기록 탭 기본값:

- `컴퓨터`
- `닌텐도`
- `플스`
- `무료콘텐츠`

탭 이름이 다르면 환경변수로 변경한다.

```bash
GOOGLE_SHEETS_PC_TAB_NAME=컴퓨터
GOOGLE_SHEETS_NINTENDO_TAB_NAME=닌텐도
GOOGLE_SHEETS_PLAYSTATION_TAB_NAME=플스
GOOGLE_SHEETS_FREE_TAB_NAME=무료콘텐츠
```

## Environment

```bash
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
GOOGLE_SHEETS_MEMBER_RANGE="'사용자DB'!A:Z"
```

Google Sheets 서비스 계정 이메일은 대상 스프레드시트에 편집자로 공유되어 있어야 한다.

## Development

```bash
npm install
npm run dev
```

```text
http://localhost:3000/kiosk
```

## Checks

```bash
npm run lint
npm run test
npm run build
```

## Deploy

Vercel 배포를 기준으로 한다.

```bash
npx vercel deploy --prod --yes
```

배포 후 확인 항목:

- `/kiosk` 접속
- `/kiosk` 외 경로 리다이렉트
- 기존 회원 검색
- 테스트 접수 Google Sheets 기록

## Project Structure

```text
src/app/kiosk/                  kiosk route
src/components/kiosk-client.tsx kiosk UI
src/app/api/sheet-members/      member lookup API
src/lib/server/google-sheets.ts Google Sheets integration
src/proxy.ts                    kiosk-only routing guard
docs/assets/                    README screenshots
docs/product-spec.md            product notes
```

## Notes

- Docker, Windows local server, Ubuntu self-hosting files are not part of the current operating path.
- Card payment approval is handled outside this app.
- Sensitive Google service account values must not be committed.
