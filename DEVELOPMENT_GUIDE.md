# autoPAN 개발 가이드

## 현재 기준

autoPAN은 노원청소년센터 3층 나놀다판에서 쓰는 태블릿 접수 키오스크다. 현재 운영 기준은 **Vercel 배포 + Google Sheets 연동 + `/kiosk` 잠금 흐름**이다.

Docker, Windows 노트북 서버, Ubuntu 자체 호스팅, systemd, Caddy, PostgreSQL 백업 운영은 현재 기준에서 제외한다.

## 핵심 화면

- `/kiosk`: 청소년/보호자 접수 화면. 현재 운영의 중심이다.
- `/admin`, `/board`, `/reports`: 코드에는 남아 있지만 현재 배포 운영에서는 `/kiosk` 잠금 정책 때문에 외부 운영 화면으로 열지 않는다.

## 기술 스택

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Google Sheets API
- Vercel

## 데이터 원칙

- 기존 회원 조회는 Google Sheets의 `사용자DB` 탭을 읽는다.
- 접수 기록은 이용 종류별 Google Sheets 탭에 쓴다.
- 서비스 계정 이메일은 대상 스프레드시트의 편집자로 공유되어 있어야 한다.
- 제목 행, 수식 열, 탭 이름은 운영 중 함부로 바꾸지 않는다.

## 주요 파일

```text
src/app/kiosk/page.tsx          키오스크 라우트
src/components/kiosk-client.tsx 키오스크 접수 UI
src/app/api/sheet-members/      기존 회원 조회 API
src/lib/server/google-sheets.ts Google Sheets 연동
src/proxy.ts                    /kiosk 잠금 라우팅
.env.example                    환경변수 예시
README.md                       GitHub 소개 및 인수인계 문서
```

## 개발 실행

```bash
npm install
npm run dev
```

확인 주소:

```text
http://localhost:3000/kiosk
```

## 검증

변경 후 기본적으로 아래를 확인한다.

```bash
npm run lint
npm run test
npm run build
```

Google Sheets 연동을 바꿨다면 추가로 확인한다.

1. `사용자DB`에서 기존 회원 검색이 되는지
2. 신규 접수가 대상 탭에 기록되는지
3. 공간 이용 접수가 무료콘텐츠 탭에 기록되는지
4. 수식 열이나 보호해야 할 열이 덮어써지지 않는지

## UI 원칙

- 태블릿 터치가 우선이다.
- 한 화면에 하나의 결정을 요구한다.
- 안내 문구는 짧고 현장 단어를 쓴다.
- 코치마크나 설명 카드보다 실제 선택 버튼을 먼저 보이게 한다.
- 30초 무반응 시 첫 화면 복귀 흐름을 유지한다.

## 배포 원칙

- 운영 배포는 Vercel 기준이다.
- Vercel 환경변수에 Google Sheets 키가 들어 있어야 한다.
- 배포 후 `/kiosk` 접속, 경로 잠금, 기존 회원 검색, 테스트 접수 기록을 확인한다.

## 수정 시 주의

- `/kiosk` 잠금 정책을 임의로 풀지 않는다.
- Google Sheets 헤더 매핑을 바꿀 때는 실제 운영 시트 이름과 헤더를 확인한다.
- 민감한 서비스 계정 키는 저장소에 커밋하지 않는다.
- 현장 담당자가 이해하기 어려운 관리자용 기능을 키오스크에 노출하지 않는다.
