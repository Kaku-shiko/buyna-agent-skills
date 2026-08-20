# 共享 RDS 商家 Schema 迁移

Buyna 商家默认复用已登记的 RDS 实例和 PostgreSQL 数据库。经明确批准的可回滚迁移可以在同一数据库内建立独立商家 Schema；不得因此创建新 RDS、数据库、EC2、Bucket 或 TCP 端口。

```text
RDS: registered-existing-instance
└─ database: registered-existing-database
   ├─ public        资源登记与迁移日志
   ├─ merchant_a    商家 A 数据与本地枚举类型
   └─ merchant_b    商家 B 数据与本地枚举类型
```

标准顺序是：只读盘点 → PITR/逻辑备份 → 源端增量日志 → Schema 复制 → `project_id`/`seller_id` 校验 → ORM 显式 Schema → 候选运行时 → 零积压切换 → 线上验收 → 保留源副本和旧发布。

固定代码入口：`@buyna/postgres-merchant-core/schema-migration`。执行流程入口：`buyna-unified-merchant-architecture`。资源证据入口：`buyna-project-resource-registry`。

应用账号必须是最小权限账号：只能连接已登记数据库并访问自己的 Schema，不能创建数据库/Schema，也不能读取其他商家 Schema。PostgreSQL 枚举类型必须与 ORM 的 Schema 元数据一致；只复制表而不处理枚举会导致运行期类型错误。
