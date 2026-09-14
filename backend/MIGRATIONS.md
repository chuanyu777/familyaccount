# 数据库迁移与后续维护

项目自带一个轻量版本化迁移器（`com.familyledger.db.Migrator`），**每次后端启动会自动执行未应用的脚本**，不需要手工跑 SQL。

## 一、机制速览

- 脚本目录：`backend/src/main/resources/db/migration/`
- 命名规则：`V{版本号}__{简述}.sql`，例如 `V2__add_txn_tag.sql`（版本号纯数字，两个下划线）
- 执行记录表：`schema_migration`（version / name / checksum / applied_at / execution_ms）
- 启动时流程：建历史表 → 首次运行把 `V1` 登记为基线（不执行）→ 按版本号顺序执行未应用的脚本
- `V1__baseline.sql` 是**空的**锚点文件，代表「`schema.sql` 建出的初始结构」，**永远不要往里写内容**
- 已应用的脚本如果被人改动，启动时**直接报错拒绝启动**（校验和不匹配）

## 二、改需求的标准流程

### 1）只改代码、不动表结构
直接改代码 → 上传 → `docker compose -f deploy/docker-compose.prod.yml up -d --build`。数据不动。

### 2）要加字段 / 加表（最常见的需求迭代）

以「给账目加一个备注标签」为例：

```bash
# ① 新增迁移脚本（版本号取当前最大 +1）
backend/src/main/resources/db/migration/V2__add_txn_tag.sql
```

```sql
-- 加字段：允许为空或给默认值，保证老代码也能跑
ALTER TABLE txn ADD COLUMN tag VARCHAR(32) NULL;

-- 需要的话顺便做历史数据订正
UPDATE txn SET tag = '未分类' WHERE tag IS NULL;
```

```bash
# ② 本地跑测试（H2 会真实执行一遍迁移脚本）
mvn -s mvn-settings.xml test

# ③ 服务器先备份
./deploy/backup.sh

# ④ 上传代码后重建启动
docker compose -f deploy/docker-compose.prod.yml up -d --build

# ⑤ 看日志确认迁移执行了
docker compose -f deploy/docker-compose.prod.yml logs app | grep migrate
```

### 3）要删字段 / 改字段名 / 改字段类型（有风险，分两步走）

不要一次到位，否则「新代码 + 老数据」或「老代码 + 新数据」在回滚窗口内会出问题：

| 阶段 | 迁移脚本 | 说明 |
|------|----------|------|
| 第 1 次发布 | `V3__add_new_col.sql` 加新列 + 数据搬迁 | 代码同时写新旧两列（或双读），保持兼容 |
| 第 2 次发布（确认稳定后） | `V4__drop_old_col.sql` 删旧列 | 代码去掉旧列引用 |

### 4）纯历史数据订正

同样写成一个迁移脚本，用 `UPDATE` / `INSERT`，并且**用 WHERE 限定范围**，避免误伤：

```sql
-- V5__fix_member_name.sql
UPDATE member SET name = '爸爸' WHERE id = 2 AND name = '我';
```

## 三、铁律

1. **已应用过的脚本禁止修改**（校验和会拦截）。发现写错了，新增一个更高版本的脚本来修正。
2. **版本号只增不重复**，不要插队（已经跑到 V5 的库不会再执行 V3）。
3. 脚本要 **MySQL 与 H2 都兼容**。测试库是 H2，写 MySQL 专有语法（如 `ALGORITHM=INSTANT`）会导致本地测试挂掉；实在要用，请注明并考虑拆分。
4. **执行顺序：先备份，再发布**。
5. 脚本里尽量不用 `DROP TABLE` / `TRUNCATE`；真要删数据，先备份。

## 四、常用查询

```sql
-- 已应用了哪些脚本
SELECT version, name, applied_at, execution_ms FROM schema_migration ORDER BY version;
```

## 五、出错了怎么办

- **迁移脚本执行失败**：后端启动会直接失败并打印错误，容器会不断重启。此时数据库可能处于「部分应用」状态 → 用 `./deploy/restore.sh <备份>` 恢复，修好脚本再发布。
- **想回滚代码版本**：代码回滚后，数据库的新列还在，但旧代码不认识它（通常无害，前提是新增列允许为空）。删列操作务必按「两步走」延后执行。
- **迁移脚本被改过导致拒绝启动**：把脚本内容还原成原样即可（历史表里存了原始校验和）。
