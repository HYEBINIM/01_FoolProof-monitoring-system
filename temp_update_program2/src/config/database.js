const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor(config, name = 'database') {
    this.config = config;
    this.name = name;
    this.pool = null;
  }

  async connect() {
    try {
      // 먼저 데이터베이스 없이 연결 시도
      const tempPool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });

      try {
        // 데이터베이스가 있는지 확인
        const connection = await tempPool.getConnection();
        const [databases] = await connection.query(`SHOW DATABASES LIKE '${this.config.database}'`);

        if (databases.length === 0) {
          // 데이터베이스가 없으면 생성
          logger.info(`${this.name} 데이터베이스 '${this.config.database}'가 없습니다. 생성합니다...`);
          await connection.query(`CREATE DATABASE ${this.config.database}`);
          logger.info(`${this.name} 데이터베이스 '${this.config.database}' 생성 완료`);
        }

        connection.release();
        await tempPool.end();
      } catch (error) {
        await tempPool.end();
        throw error;
      }

      // 이제 데이터베이스를 지정하여 연결
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });

      // 연결 테스트
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      logger.info(`${this.name} 데이터베이스 연결 성공: ${this.config.host}:${this.config.port}/${this.config.database}`);
      return true;
    } catch (error) {
      logger.error(`${this.name} 데이터베이스 연결 실패:`, error);
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      // 파라미터가 있으면 execute (prepared statement), 없으면 query 사용
      const [rows] = params.length > 0
        ? await this.pool.execute(sql, params)
        : await this.pool.query(sql);
      return rows;
    } catch (error) {
      logger.error(`${this.name} 쿼리 실행 실패:`, { sql, error: error.message });
      throw error;
    }
  }

  async getConnection() {
    return await this.pool.getConnection();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info(`${this.name} 데이터베이스 연결 종료`);
    }
  }

  // 테이블의 모든 데이터 가져오기
  async getAllData(tableName) {
    const sql = `SELECT * FROM ${tableName}`;
    return await this.query(sql);
  }

  // 특정 id의 데이터만 가져오기 (dr1, er1 등 호기별 테이블용)
  async getDataById(tableName, id) {
    const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
    return await this.query(sql, [id]);
  }

  // 테이블의 특정 행 가져오기
  async getRowById(tableName, id) {
    const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
    const rows = await this.query(sql, [id]);
    return rows[0] || null;
  }

  // 테이블의 최대 ID 가져오기
  async getMaxId(tableName) {
    const sql = `SELECT MAX(id) as maxId FROM ${tableName}`;
    const rows = await this.query(sql);
    return rows[0]?.maxId || 0;
  }

  // REPLACE INTO를 사용한 데이터 동기화 (이미 처리된 데이터)
  async replaceDataDirect(tableName, data) {
    if (!data || data.length === 0) {
      return;
    }

    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();

      for (const row of data) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        const values = columns.map(col => row[col]);

        await connection.execute(sql, values);
      }

      await connection.commit();
      logger.debug(`${tableName} 테이블에 ${data.length}개 행 동기화 완료`);
    } catch (error) {
      await connection.rollback();
      logger.error(`${tableName} 테이블 동기화 실패:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // REPLACE INTO를 사용한 데이터 동기화 (레거시 - 하위 호환성)
  async replaceData(tableName, data, deviceId = null) {
    if (!data || data.length === 0) {
      return;
    }

    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();

      for (const row of data) {
        // deviceId가 제공되면 각 행에 추가
        const rowData = deviceId ? { ...row, device_id: deviceId } : row;
        const columns = Object.keys(rowData);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        const values = columns.map(col => rowData[col]);

        await connection.execute(sql, values);
      }

      await connection.commit();
      logger.debug(`${tableName} 테이블에 ${data.length}개 행 동기화 완료`);
    } catch (error) {
      await connection.rollback();
      logger.error(`${tableName} 테이블 동기화 실패:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // REPLACE INTO를 사용한 데이터 업데이트 (없으면 INSERT, 있으면 UPDATE)
  async updateData(tableName, data, whereColumn, whereValue) {
    if (!data || data.length === 0) {
      return 0;
    }

    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      let updatedCount = 0;

      for (const row of data) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        const values = columns.map(col => row[col]);

        const [result] = await connection.execute(sql, values);
        updatedCount += result.affectedRows;
      }

      await connection.commit();
      logger.debug(`${tableName} 테이블에서 ${whereColumn}=${whereValue}인 ${updatedCount}개 행 업데이트 완료`);
      return updatedCount;
    } catch (error) {
      await connection.rollback();
      logger.error(`${tableName} 테이블 업데이트 실패:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 테이블 존재 여부 확인
  async tableExists(tableName) {
    const sql = `SHOW TABLES LIKE '${tableName}'`;
    const rows = await this.query(sql);
    return rows.length > 0;
  }

  // 테이블 구조(CREATE TABLE 문) 가져오기
  async getTableStructure(tableName) {
    const sql = `SHOW CREATE TABLE ${tableName}`;
    const rows = await this.query(sql);
    if (rows.length > 0) {
      return rows[0]['Create Table'];
    }
    return null;
  }

  // 테이블 생성
  async createTable(createTableSql) {
    await this.query(createTableSql);
    logger.info(`${this.name} 테이블 생성 완료`);
  }

  // 테이블 목록 가져오기
  async getTables() {
    const sql = `SHOW TABLES`;
    const rows = await this.query(sql);
    const tableKey = `Tables_in_${this.config.database}`;
    return rows.map(row => row[tableKey]);
  }

  // 테이블에 device_id 컬럼이 있는지 확인
  async hasDeviceIdColumn(tableName) {
    const sql = `SHOW COLUMNS FROM ${tableName} WHERE Field = 'device_id'`;
    const rows = await this.query(sql);
    return rows.length > 0;
  }

  // 테이블에 device_id 컬럼 추가
  async addDeviceIdColumn(tableName) {
    const sql = `ALTER TABLE ${tableName} ADD COLUMN device_id VARCHAR(50) NOT NULL DEFAULT 'Unknown' AFTER id`;
    await this.query(sql);
    logger.info(`${this.name} ${tableName} 테이블에 device_id 컬럼 추가 완료`);
  }

  // 테이블에 device_id 인덱스 추가
  async addDeviceIdIndex(tableName) {
    try {
      const sql = `ALTER TABLE ${tableName} ADD INDEX idx_device_id (device_id)`;
      await this.query(sql);
      logger.info(`${this.name} ${tableName} 테이블에 device_id 인덱스 추가 완료`);
    } catch (error) {
      // 인덱스가 이미 존재하는 경우 무시
      if (error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }
  }
}

module.exports = DatabaseConnection;
