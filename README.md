# 导游 Hub

全国导游互助、景区政策共建和团导对接的公益网站。

在线：https://daoyou.chicheng.org

## 本地开发和验证

需要 Node.js 22 或更高版本。

```sh
npm ci
npm test
npm run build
npx wrangler pages dev dist
```

`data/scenic.json` 是景区数据源，构建时生成 `dist/scenic-data.js`。每条来源使用 `sources: [{url,title}]`，不能把多个网址拼成一个字符串。政策状态和证据等级是两个不同字段；“已收录”不等于已查证或仍然有效。

## 数据与账号

Pages Functions 使用 D1 的 `DAOYOU_DB` 保存账号、会话、记录、报名及审计记录。数据库迁移位于 `migrations/`。原 KV 绑定 `DAOYOU_DATA` 保留为历史迁移来源，业务记录首次读取时幂等导入，旧用户在使用原会话或成功登录时迁移；不覆盖或删除原业务数组。旧密码成功登录后自动升级为 scrypt。

生产与预览的 D1、KV 完全分离。发布前在两个环境应用数据库迁移。迁移前的 Pages 部署 ID 和原 KV 保留用于恢复；回滚静态版本不等于回滚数据库，请先检查写入兼容性。

管理员只由 `ADMIN_UIDS` 中明确配置的现有用户 ID 决定，不能通过注册某个邮箱获得。空配置表示不开放后台。维护者应核对账号归属后，从可信管理渠道读取该账号的 UID 并配置，不接受访客自称身份。邮箱目前未做归属认证，不作实名或执业资格认证。后台响应不包含密码哈希或盐。

### 忘记密码

邮件找回服务尚未接入。核实账号归属后，持有该 Cloudflare 账号管理权限的维护者可执行：

```sh
CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID node scripts/issue-password-reset.mjs ACCOUNT_EMAIL /private/path/recovery.json
```

先在生产和预览应用 `0002_password_recovery.sql`。脚本只对生产数据库中已有账号签发链接，不创建账号，不改变权限，不设置或显示新密码。私有 JSON 文件包含登录恢复凭证，应通过已核实的私密渠道交给账号本人，不能放入源码包、公共目录、Issue 或 PR；使用后删除该私有文件。凭证由 32 字节安全随机数生成，数据库仅保存 SHA-256 摘要，15 分钟过期且只能消费一次；重新签发会撤销该账号原有未使用链接。

用户在独立重置页自行输入两次新密码，随后重新登录。成功重置会原子撤销该账号全部 D1 会话，并禁止旧 KV 会话重新迁移，其他未使用重置链接同时作废。页面无第三方资源、禁止缓存及 Referrer，URL 片段中的凭证在页面加载时移除；服务端不以邮箱或用户 ID 作为重置授权。

设计参考：[OWASP 密码找回指南](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)、[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。

登记和发团必须登录；公开列表脱敏证号，联系方式仅向登录用户展示。用户可在“我的”撤回内容。历史匿名记录由维护者核实后处理；源 KV 保留时，删除请求还需要纳入恢复来源/备份清理。

## 参与共建

普通访客使用站内“反馈”表单，无需 GitHub 账号。开发者可修改 `data/scenic.json` 后提 PR。GitHub Issues 亦提供景区反馈模板。请提供实测时间、政策条件和公开证据，不上传私人证件资料。

## 部署

`docs/ci-workflow.yml` 提供可审查的 CI/自动发布模板。目前 GitHub 集成不允许写入工作流文件，模板尚未启用。获得工作流写权限后，将它放入 `.github/workflows/ci.yml`；它会在 PR 和 main 提交上执行测试及构建。main 发布任务还需要：

- GitHub Secret `CLOUDFLARE_API_TOKEN`：限制在本账号、网站发布所需权限的专用凭证。
- GitHub Variable `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账号 ID。
- GitHub Variable `CLOUDFLARE_DEPLOY_ENABLED=true`：仅在专用凭证配置完成后启用自动发布；未配置时只运行验证。
- 如有管理员，确保 `wrangler.toml` 对应环境的 `ADMIN_UIDS` 与已核对的账号一致。

不把本机个人 OAuth 凭证上传到 GitHub。没有专用部署凭证时，不启用自动发布；可以使用本机已授权 Wrangler 执行：

```sh
npm run build
npx wrangler pages deploy dist --project-name daoyou --branch maintenance-audit
# 验证预览后发布 main
npx wrangler pages deploy dist --project-name daoyou --branch main
```

## License

代码 MIT；景区整理数据 CC-BY-SA 4.0，保留原始来源与署名。
