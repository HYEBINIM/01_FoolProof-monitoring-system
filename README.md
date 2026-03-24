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

- `ar1`, `ar2`
- `br1`, `br2`
- `cr1`, `cr2`
- `dr1`, `dr2` 상한/하한값
- `er1` - 온도 보정값
- `control1`
- `controll1`, `controll2`
- `count1`
- `log1`
- `param1`
- `result1` - 온도 로그 데이터