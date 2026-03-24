require('dotenv').config();
const DatabaseConnection = require('./config/database');
const SyncService = require('./services/syncService');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

// 로그 디렉토리 생성
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 소스 데이터베이스 설정 (데이터를 가져올 DB)
const sourceConfig = {
  host: process.env.SOURCE_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.SOURCE_DB_PORT) || 3306,
  user: process.env.SOURCE_DB_USER || 'root',
  password: process.env.SOURCE_DB_PASSWORD || '',
  database: process.env.SOURCE_DB_NAME || 'dataset'
};

// 타겟 데이터베이스 설정 (데이터를 보낼 원격 DB)
const targetConfig = {
  host: process.env.TARGET_DB_HOST || '192.168.1.100',
  port: parseInt(process.env.TARGET_DB_PORT) || 3306,
  user: process.env.TARGET_DB_USER || 'root',
  password: process.env.TARGET_DB_PASSWORD || '',
  database: process.env.TARGET_DB_NAME || 'dataset'
};

// 동기화 주기 (밀리초)
const syncInterval = parseInt(process.env.SYNC_INTERVAL) || 5000;

// 장비 ID
const deviceId = process.env.DEVICE_ID || 'FoolProof_Unknown';

// 호기 번호
const machineNumber = parseInt(process.env.MACHINE_NUMBER) || 1;

async function main() {
  let sourceDb = null;
  let targetDb = null;
  let syncService = null;

  try {
    logger.info('=========================================');
    logger.info('MariaDB 실시간 데이터 동기화 시스템 시작');
    logger.info('=========================================');

    // 소스 데이터베이스 연결
    logger.info('소스 데이터베이스 연결 중...');
    sourceDb = new DatabaseConnection(sourceConfig, '소스');
    await sourceDb.connect();

    // 타겟 데이터베이스 연결
    logger.info('타겟 데이터베이스 연결 중...');
    targetDb = new DatabaseConnection(targetConfig, '타겟');
    await targetDb.connect();

    // 동기화 서비스 생성
    syncService = new SyncService(sourceDb, targetDb, deviceId, machineNumber);

    // 장비 정보 출력
    logger.info(`장비 ID: ${deviceId}, 호기: ${machineNumber}`);

    // 테이블 구조 확인 및 자동 생성
    logger.info('타겟 데이터베이스 테이블 구조를 확인하고 필요시 생성합니다...');
    await syncService.checkAndCreateAllTables();

    // 실시간 동기화 시작
    syncService.startRealtimeSync(syncInterval);

    logger.info('=========================================');
    logger.info('실시간 동기화가 실행 중입니다.');
    logger.info('종료하려면 Ctrl+C를 누르세요.');
    logger.info('=========================================');

  } catch (error) {
    logger.error('프로그램 실행 중 오류 발생:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\n프로그램 종료 중...');

    if (syncService) {
      syncService.stopRealtimeSync();
    }

    if (sourceDb) {
      await sourceDb.close();
    }

    if (targetDb) {
      await targetDb.close();
    }

    logger.info('프로그램이 정상적으로 종료되었습니다.');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('\n프로그램 종료 중...');

    if (syncService) {
      syncService.stopRealtimeSync();
    }

    if (sourceDb) {
      await sourceDb.close();
    }

    if (targetDb) {
      await targetDb.close();
    }

    logger.info('프로그램이 정상적으로 종료되었습니다.');
    process.exit(0);
  });

  // 에러 핸들러
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('처리되지 않은 Promise 거부:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('처리되지 않은 예외:', error);
    process.exit(1);
  });
}

// 프로그램 시작
main();
