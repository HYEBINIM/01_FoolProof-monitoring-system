# 01_FoolProof-monitoring-system

## F/P 모니터링 시스템 설치 고객사
- Daeoh
- DuckSanJungMil
- MSI

## 개발 notice
테스트: npm start
실행파일: .env에서 호기 바꾸고 npm run build
temp_update_program - 개발용
temp_update_program2 - 설치용 

# MariaDB 실시간 데이터 동기화 시스템

Fool Proof monitoring system for DuckSanJungMil

로컬 MariaDB 데이터베이스의 데이터를 원격 MariaDB 데이터베이스로 실시간으로 동기화하는 Node.js 프로그램입니다.

## 주요 기능

- 실시간 데이터 동기화 (주기적 폴링 방식)
- 모든 테이블 자동 동기화
- 증분 동기화 지원 (새로운 데이터만 전송)
- 자동 재연결 및 오류 처리
- 상세한 로깅 (파일 및 콘솔)
- Graceful shutdown 지원

## 동기화 대상 테이블

- `ar1`, `ar2` - A 라인 데이터
- `br1`, `br2` - B 라인 데이터
- `cr1`, `cr2` - C 라인 데이터
- `dr1`, `dr2` - D 라인 데이터 (상한/하한값)
- `er1` - E 라인 데이터 (온도 보정값)
- `control1` - 제어 데이터
- `controll1`, `controll2` - 제어 데이터 (이미지 정보)
- `count1` - 카운트 데이터
- `log1` - 로그 데이터
- `param1` - 파라미터 데이터
- `result1` - 결과 데이터

## 설치 방법

### 1. Node.js 설치

Node.js 18.x 이상이 필요합니다.

- [Node.js 공식 웹사이트](https://nodejs.org/)에서 다운로드하여 설치

### 2. 프로젝트 설정

```bash
# 의존성 패키지 설치
npm install
```

### 3. 환경 변수 설정

`.env.example` 파일을 `.env`로 복사하고 데이터베이스 정보를 입력합니다.

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

`.env` 파일을 열어서 다음 정보를 수정합니다:

```env
# 소스 데이터베이스 (데이터를 가져올 로컬 DB)
SOURCE_DB_HOST=127.0.0.1
SOURCE_DB_PORT=3306
SOURCE_DB_USER=root
SOURCE_DB_PASSWORD=your_password
SOURCE_DB_NAME=dataset

# 타겟 데이터베이스 (데이터를 보낼 원격 DB)
TARGET_DB_HOST=192.168.1.100
TARGET_DB_PORT=3306
TARGET_DB_USER=root
TARGET_DB_PASSWORD=your_password
TARGET_DB_NAME=dataset

# 동기화 주기 (밀리초)
SYNC_INTERVAL=5000

# 로그 레벨
LOG_LEVEL=info
```

### 4. 원격 데이터베이스 준비

원격 데이터베이스에 동일한 테이블 구조를 생성해야 합니다.

제공된 SQL 파일을 원격 데이터베이스에서 실행하거나, 다음 방법으로 테이블 구조를 복사할 수 있습니다:

```sql
-- 로컬 DB에서 테이블 구조 내보내기
mysqldump -u root -p --no-data dataset > schema.sql

-- 원격 DB에서 테이블 구조 가져오기
mysql -h 192.168.1.100 -u root -p dataset < schema.sql
```

## 사용 방법

### 프로그램 실행

```bash
# 실시간 동기화 시작
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

### 프로그램 종료

- `Ctrl + C`를 눌러서 안전하게 종료

## 동작 방식

1. **주기적 폴링**: 설정된 주기(기본 5초)마다 소스 DB의 데이터를 확인
2. **전체 동기화**: 모든 테이블의 데이터를 `REPLACE INTO` 문으로 타겟 DB에 반영
3. **자동 충돌 해결**: `REPLACE INTO`는 기존 데이터를 자동으로 업데이트
4. **오류 복구**: 연결 오류 시 자동으로 재연결 시도

## 로그 확인

로그는 다음 위치에 저장됩니다:

- `logs/combined.log` - 모든 로그
- `logs/error.log` - 에러 로그만

콘솔에서도 실시간으로 로그를 확인할 수 있습니다.

## 동기화 모드

### 1. 전체 동기화 (기본)

모든 데이터를 매번 동기화합니다. 데이터 양이 적을 때 권장됩니다.

```javascript
syncService.startRealtimeSync(5000); // 5초마다 전체 동기화
```

### 2. 증분 동기화

새로 추가된 데이터만 동기화합니다. 데이터 양이 많을 때 권장됩니다.

코드를 다음과 같이 수정:

```javascript
// src/index.js에서
// syncService.startRealtimeSync(syncInterval);
// 대신에:
setInterval(async () => {
  await syncService.syncAllTablesIncremental();
}, syncInterval);
```

## 네트워크 설정

### 방화벽 설정

원격 서버의 MariaDB 포트(기본 3306)가 열려있어야 합니다.

**Windows 방화벽 (원격 서버):**
```bash
netsh advfirewall firewall add rule name="MariaDB" dir=in action=allow protocol=TCP localport=3306
```

**Linux 방화벽 (원격 서버):**
```bash
sudo ufw allow 3306/tcp
```

### MariaDB 원격 접속 허용

원격 서버의 MariaDB 설정을 수정해야 합니다.

**1. 설정 파일 수정 (`my.ini` 또는 `my.cnf`):**

```ini
[mysqld]
bind-address = 0.0.0.0
```

**2. 사용자 권한 설정:**

```sql
-- 특정 IP에서만 접속 허용
CREATE USER 'root'@'192.168.1.50' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON dataset.* TO 'root'@'192.168.1.50';

-- 또는 모든 IP에서 접속 허용 (보안 주의)
CREATE USER 'root'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON dataset.* TO 'root'@'%';

FLUSH PRIVILEGES;
```

**3. MariaDB 재시작:**

```bash
# Windows
net stop MariaDB
net start MariaDB

# Linux
sudo systemctl restart mariadb
```

## 문제 해결

### 연결 오류

```
Error: connect ECONNREFUSED
```

**해결 방법:**
1. 원격 서버의 MariaDB가 실행 중인지 확인
2. 방화벽 설정 확인
3. `bind-address` 설정 확인
4. 네트워크 연결 확인

### 권한 오류

```
Error: Access denied for user
```

**해결 방법:**
1. 사용자 이름과 비밀번호 확인
2. 원격 접속 권한 확인
3. 호스트 권한 확인 (`SHOW GRANTS FOR 'user'@'host';`)

### 테이블 없음 오류

```
Table 'dataset.xxx' doesn't exist
```

**해결 방법:**
1. 원격 DB에 테이블 구조 생성
2. 테이블 이름 확인

## 성능 최적화

### 동기화 주기 조정

- 데이터 변경이 빈번하지 않으면 주기를 늘려서 부하 감소
- 실시간성이 중요하면 주기를 줄임 (최소 1000ms 권장)

```env
SYNC_INTERVAL=10000  # 10초
```

### 네트워크 최적화

- 가능하면 동일 네트워크 내에서 운영
- VPN 사용 시 대역폭 확인

### 데이터베이스 최적화

- 인덱스 최적화
- 연결 풀 크기 조정 (`src/config/database.js`의 `connectionLimit`)

## 시스템 요구사항

- Node.js 18.x 이상
- MariaDB 10.x 이상 또는 MySQL 5.7 이상
- 최소 RAM: 512MB
- 네트워크: 안정적인 연결 (원격 DB와 통신)

## 보안 권장사항

1. `.env` 파일을 절대 공유하지 마세요
2. 강력한 데이터베이스 비밀번호 사용
3. 가능하면 SSL/TLS 연결 사용
4. 원격 접속은 특정 IP만 허용
5. 정기적인 백업 수행

## 라이선스

MIT License

## 문의

문제가 발생하면 GitHub Issues에 등록해주세요.
