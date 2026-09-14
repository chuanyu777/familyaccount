# 家庭记账簿后端（Java + Spring Boot + MySQL）

原 Node/Express + SQLite 后端的等价重写，**REST 契约完全不变**（路径、字段名、错误格式 `{error:{code,message}}`、状态码），
前端 Vue 无需任何改动，`web/vite.config.ts` 的 `/api → localhost:3001` 代理照常可用。

## 技术栈
- Java 17 + Spring Boot 3.3 + Spring JDBC（JdbcTemplate）
- MySQL 8（金额一律整数「分」存 BIGINT，对外输出元字符串）
- 测试：JUnit 5 + H2（MySQL 兼容模式，内存库）

## 目录
```
backend/
  src/main/java/com/familyledger/   # Application / common / controller / service / db
  src/main/resources/schema.sql     # 建表（MySQL 8 / H2 兼容）
  src/main/resources/application.yml
  src/test/java/...                 # MoneyTest / MonthUtilTest / SmokeTest
  docker-compose.yml                # MySQL 8 + 应用
  Dockerfile                        # 多阶段 Maven 构建
```

## 运行

### 方式一：Docker（推荐，免装 Java/MySQL）
```bash
cd backend
docker compose up --build
# 后端 http://localhost:3001 ，MySQL localhost:3306
# 前端另起：cd .. && npm run dev:web
```

### 方式二：本地
需要 JDK 17+ 与 MySQL 8，并在 `application.yml` 或环境变量配置连接。
```bash
mvn -s mvn-settings.xml spring-boot:run
```

### 只跑测试
```bash
mvn -s mvn-settings.xml test
```

## 与 Node 版的差异
- 时间戳统一存 VARCHAR(19)（'YYYY-MM-DD HH:MM:SS'），由应用层写入，规避 DB 方言/时区差异。
- 资产快照 upsert 用「先查后插/改」实现，避免 `ON DUPLICATE KEY UPDATE` 的方言绑定。
- 事务用 Spring `@Transactional`（RuntimeException 自动回滚），替代手工 BEGIN/COMMIT/ROLLBACK。
