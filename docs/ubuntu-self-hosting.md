# Ubuntu Self-Hosting Guide

이 문서는 autoPAN을 센터 내부 Ubuntu 서버 1대에 올려서 운영할 때의 기준 설치 절차를 정리한다.

## 권장 구성

- 서버: Ubuntu Server 22.04 LTS 이상
- 앱 런타임: Node.js LTS
- 웹앱: Next.js production build
- 데이터베이스: PostgreSQL
- 리버스 프록시: Caddy
- 서비스 관리: systemd
- 백업: `pg_dump` + systemd timer

## 네트워크 구조

- 서버는 내부망에서만 접근 가능한 고정 IP를 받는다.
- 앱은 `127.0.0.1:3000`에서만 실행한다.
- Caddy가 `:80`에서 요청을 받고 Next.js로 전달한다.
- 관리자 PC, 키오스크 태블릿, 보드 화면은 같은 LAN의 브라우저로 접속한다.

## 설치 순서

1. Ubuntu Server를 설치하고 서버 전용 계정을 만든다.
2. 필수 패키지를 설치한다.
3. 저장소를 `/opt/autopan`에 배포한다.
4. 의존성을 설치하고 production build를 만든다.
5. PostgreSQL 데이터베이스와 계정을 만든다.
6. systemd 서비스와 백업 타이머를 등록한다.
7. Caddy를 설정하고 내부망에서 접속을 확인한다.

## 예시 패키지 설치

```bash
sudo apt update
sudo apt install -y git curl ca-certificates postgresql caddy
```

Node.js는 배포 정책에 맞는 LTS 버전으로 설치한다. 서버에서 `node -v`와 `npm -v`가 동작하는지 먼저 확인한다.

## 배포 위치

권장 경로는 다음과 같다.

- 앱 코드: `/opt/autopan`
- 앱 환경파일: `/etc/autopan/autopan.env`
- 백업 환경파일: `/etc/autopan/backup.env`
- 백업 저장소: `/var/backups/autopan`
- systemd 단위 파일: `/etc/systemd/system/`
- Caddy 설정: `/etc/caddy/Caddyfile`

백업 환경파일에는 `PGPASSWORD` 또는 PostgreSQL 인증 방식에 맞는 접속 정보가 들어가야 한다. 가능하면 운영 계정과 백업 계정을 분리한다.

## 앱 시작 확인

```bash
cd /opt/autopan
npm run build
npm run start -- -p 3000 -H 127.0.0.1
```

브라우저에서 다음 주소를 확인한다.

- `http://SERVER_IP/`
- `http://SERVER_IP/kiosk`
- `http://SERVER_IP/admin`
- `http://SERVER_IP/board`

## PostgreSQL 백업 정책

- 백업은 매일 1회 실행한다.
- 백업 파일은 최소 14일 보관한다.
- 복구 테스트를 실제로 해본 백업만 신뢰한다.
- 백업 파일은 운영 디스크와 분리된 위치나 외장 저장장치에 추가 복사하는 편이 안전하다.

## 복구 예시

```bash
createdb -h 127.0.0.1 -U autopan autopan_restore
pg_restore -h 127.0.0.1 -U autopan -d autopan_restore /var/backups/autopan/autopan-YYYYMMDD-HHMMSS.dump
```

## 장애 점검 순서

1. `systemctl status autopan`
2. `systemctl status caddy`
3. `journalctl -u autopan -n 100 --no-pager`
4. `journalctl -u caddy -n 100 --no-pager`
5. `psql` 접속과 `pg_isready`

## 운영 메모

- 서버가 꺼지면 전체 서비스가 멈춘다.
- 서버 재부팅 후 앱과 DB가 자동 기동되는지 반드시 확인한다.
- 내부망 IP가 바뀌지 않도록 DHCP 예약 또는 고정 IP를 사용한다.
- 학생 개인정보는 공개 보드에 노출하지 않는다.
