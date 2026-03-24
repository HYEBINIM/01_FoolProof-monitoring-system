const logger = require('../utils/logger');

class SyncService {
  constructor(sourceDb, targetDb, deviceId = 'FoolProof_Unknown', machineNumber = 1) {
    this.sourceDb = sourceDb;
    this.targetDb = targetDb;
    this.deviceId = deviceId;
    this.machineNumber = machineNumber;
    this.syncInterval = null;
    this.lastSyncTime = {};
    this.isRunning = false;

    // 전체 테이블 목록 (초기 설정용)
    this.allTables = [
      'ar1', 'ar2', 'br1', 'br2', 'cr1', 'cr2', 'dr1', 'dr2', 'er1',
      'control1', 'controll1', 'controll2', 'count1', 'log1', 'param1', 'result1'
    ];

    // 실시간 동기화할 테이블 목록
    this.tables = ['dr1', 'er1', 'result1'];

    // 호기별 테이블 (id가 호기 번호인 테이블)
    this.machineIdTables = ['dr1', 'er1'];

    // mc_code를 사용하는 테이블
    this.mcCodeTables = ['result1'];
  }

  // 타겟 DB에 테이블이 없으면 자동으로 생성
  async ensureTableExists(tableName) {
    try {
      // 소스 DB에서 테이블 존재 여부 확인
      const sourceExists = await this.sourceDb.tableExists(tableName);
      if (!sourceExists) {
        logger.warn(`소스 DB에 ${tableName} 테이블이 존재하지 않습니다.`);
        return false;
      }

      // 타겟 DB에서 테이블 존재 여부 확인
      const targetExists = await this.targetDb.tableExists(tableName);

      if (!targetExists) {
        // 타겟 DB에 테이블이 없으면 소스 DB에서 구조를 가져와서 생성
        logger.info(`타겟 DB에 ${tableName} 테이블이 없습니다. 자동으로 생성합니다...`);
        const createTableSql = await this.sourceDb.getTableStructure(tableName);

        if (!createTableSql) {
          logger.error(`소스 DB에서 ${tableName} 테이블 구조를 가져올 수 없습니다.`);
          return false;
        }

        await this.targetDb.createTable(createTableSql);
        logger.info(`타겟 DB에 ${tableName} 테이블 생성 완료`);
      }

      return true;

    } catch (error) {
      logger.error(`${tableName} 테이블 생성 중 오류 발생:`, error);
      return false;
    }
  }

  // 특정 테이블 동기화
  async syncTable(tableName) {
    try {
      // 테이블 존재 여부 확인 및 자동 생성
      const tableReady = await this.ensureTableExists(tableName);
      if (!tableReady) {
        return { success: false, synced: 0, table: tableName };
      }

      let sourceData;
      let updatedCount = 0;

      // 테이블 종류에 따라 다른 처리
      if (this.machineIdTables.includes(tableName)) {
        // dr1, er1: id가 호기 번호인 테이블 - 해당 호기의 데이터만 업데이트
        sourceData = await this.sourceDb.getDataById(tableName, this.machineNumber);

        if (sourceData.length === 0) {
          logger.debug(`${tableName} 테이블에서 호기 ${this.machineNumber}의 데이터가 없습니다.`);
          return { success: true, synced: 0, table: tableName };
        }

        // id가 호기 번호인 행만 업데이트
        updatedCount = await this.targetDb.updateData(tableName, sourceData, 'id', this.machineNumber);

      } else if (this.mcCodeTables.includes(tableName)) {
        // result1: mc_code에 호기 번호 추가, id를 호기별 범위로 변경
        sourceData = await this.sourceDb.getAllData(tableName);

        if (sourceData.length === 0) {
          logger.debug(`${tableName} 테이블에 동기화할 데이터가 없습니다.`);
          return { success: true, synced: 0, table: tableName };
        }

        // mc_code에 호기 번호 설정, id를 호기별 범위로 변경
        // 1호기: 1~100, 2호기: 101~200, 3호기: 201~300, ...
        const idOffset = (this.machineNumber - 1) * 100;
        const processedData = sourceData.map((row, index) => ({
          ...row,
          id: idOffset + index + 1,
          mc_code: this.machineNumber
        }));

        // REPLACE INTO로 삽입/업데이트
        updatedCount = await this.targetDb.updateData(tableName, processedData, 'mc_code', this.machineNumber);

      } else {
        // 기타 테이블: device_id 추가 (전체 동기화)
        sourceData = await this.sourceDb.getAllData(tableName);

        if (sourceData.length === 0) {
          logger.debug(`${tableName} 테이블에 동기화할 데이터가 없습니다.`);
          return { success: true, synced: 0, table: tableName };
        }

        const processedData = sourceData.map(row => ({
          ...row,
          device_id: this.deviceId
        }));

        // REPLACE INTO 사용 (전체 교체)
        await this.targetDb.replaceDataDirect(tableName, processedData);
        updatedCount = processedData.length;
      }

      logger.info(`${tableName} 테이블 동기화 완료: ${updatedCount}개 행`);
      return { success: true, synced: updatedCount, table: tableName };

    } catch (error) {
      logger.error(`${tableName} 테이블 동기화 중 오류 발생:`, error);
      return { success: false, synced: 0, table: tableName, error: error.message };
    }
  }

  // 모든 테이블 동기화
  async syncAllTables() {
    if (this.isRunning) {
      logger.warn('동기화가 이미 실행 중입니다.');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    logger.info('=== 데이터베이스 동기화 시작 ===');

    const results = [];

    for (const table of this.tables) {
      const result = await this.syncTable(table);
      results.push(result);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const successCount = results.filter(r => r.success).length;
    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);

    logger.info(`=== 동기화 완료: ${successCount}/${this.tables.length} 테이블 성공, ${totalSynced}개 행 동기화, 소요시간: ${duration}초 ===`);

    this.isRunning = false;
    return results;
  }

  // 실시간 동기화 시작 (주기적 실행)
  startRealtimeSync(intervalMs = 5000) {
    if (this.syncInterval) {
      logger.warn('실시간 동기화가 이미 실행 중입니다.');
      return;
    }

    logger.info(`실시간 동기화 시작: ${intervalMs}ms 주기`);

    // 즉시 한 번 실행
    this.syncAllTables();

    // 주기적으로 실행
    this.syncInterval = setInterval(async () => {
      await this.syncAllTables();
    }, intervalMs);
  }

  // 실시간 동기화 중지
  stopRealtimeSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('실시간 동기화 중지');
    }
  }

  // 증분 동기화 (변경된 데이터만 동기화)
  async syncIncremental(tableName) {
    try {
      // 타겟 DB의 최대 ID 가져오기
      const targetMaxId = await this.targetDb.getMaxId(tableName);

      // 소스 DB에서 최대 ID보다 큰 데이터만 가져오기
      const sql = `SELECT * FROM ${tableName} WHERE id > ?`;
      const newData = await this.sourceDb.query(sql, [targetMaxId]);

      if (newData.length === 0) {
        logger.debug(`${tableName} 테이블에 새로운 데이터가 없습니다.`);
        return { success: true, synced: 0, table: tableName };
      }

      // 타겟 DB로 새 데이터 동기화
      await this.targetDb.replaceData(tableName, newData);

      logger.info(`${tableName} 테이블 증분 동기화 완료: ${newData.length}개 새 행`);
      return { success: true, synced: newData.length, table: tableName };

    } catch (error) {
      logger.error(`${tableName} 테이블 증분 동기화 중 오류 발생:`, error);
      return { success: false, synced: 0, table: tableName, error: error.message };
    }
  }

  // 모든 테이블 증분 동기화
  async syncAllTablesIncremental() {
    if (this.isRunning) {
      logger.warn('동기화가 이미 실행 중입니다.');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    logger.info('=== 증분 동기화 시작 ===');

    const results = [];

    for (const table of this.tables) {
      const result = await this.syncIncremental(table);
      results.push(result);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const successCount = results.filter(r => r.success).length;
    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);

    logger.info(`=== 증분 동기화 완료: ${successCount}/${this.tables.length} 테이블 성공, ${totalSynced}개 새 행 동기화, 소요시간: ${duration}초 ===`);

    this.isRunning = false;
    return results;
  }

  // 모든 테이블 체크 및 생성
  async checkAndCreateAllTables() {
    logger.info('=== 테이블 구조 확인 시작 ===');
    let createdCount = 0;
    let existingCount = 0;
    let failedCount = 0;

    for (const table of this.allTables) {
      try {
        const sourceExists = await this.sourceDb.tableExists(table);
        if (!sourceExists) {
          logger.warn(`소스 DB에 ${table} 테이블이 존재하지 않습니다.`);
          failedCount++;
          continue;
        }

        const targetExists = await this.targetDb.tableExists(table);
        if (targetExists) {
          logger.info(`타겟 DB에 ${table} 테이블이 이미 존재합니다.`);
          existingCount++;
        } else {
          logger.info(`타겟 DB에 ${table} 테이블을 생성합니다...`);
          const created = await this.ensureTableExists(table);
          if (created) {
            createdCount++;
          } else {
            failedCount++;
          }
        }
      } catch (error) {
        logger.error(`${table} 테이블 체크 중 오류:`, error);
        failedCount++;
      }
    }

    logger.info(`=== 테이블 구조 확인 완료 ===`);
    logger.info(`기존 테이블: ${existingCount}개, 새로 생성: ${createdCount}개, 실패: ${failedCount}개`);
    logger.info(`실시간 동기화 대상: ${this.tables.join(', ')}`);

    return {
      existing: existingCount,
      created: createdCount,
      failed: failedCount,
      total: this.tables.length
    };
  }
}

module.exports = SyncService;
