# 秋招投递记录

在线地址：<https://tlrince.github.io/offer-tracker/>

静态前端部署在 GitHub Pages，数据通过 Supabase Auth + PostgreSQL + RLS 持久化。

> GitHub Pages 只托管页面，不保存运行时数据。仓库不包含个人投递记录、密码或 `service_role` 等服务端密钥。`offer-config.js` 中的 Project URL 与 publishable key 本来就是前端公开配置，安全边界由 RLS 提供。

## 直接使用

1. 打开在线地址。
2. 点击右上角「云端未登录」。
3. 使用至少 8 位密码注册并登录。
4. 登录后，所有修改会写入 Supabase，并在当前浏览器保留离线缓存。

当前 Supabase 项目已经完成：

- `applications` 表与索引
- 用户级 Row Level Security（SELECT / INSERT / UPDATE / DELETE）
- GitHub Pages Site URL 与 Redirect URL
- 邮箱密码认证

## 迁移现有记录

现有记录属于原 `file://` 页面自己的 localStorage，和 GitHub Pages 是两个不同的 origin，不能自动共享。

推荐迁移方式：

1. 打开原来的 `~/Desktop/offer.html`。
2. 点击右上角「云端未登录」并注册/登录。
3. 首次登录时确认把现有本地记录合并到云端。
4. 等待提示同步完成，再登录在线地址核对数量。
5. 额外导出一次 JSON 作为独立备份。

备用方式：先从原页面导出 JSON，再到在线页面登录并导入。

## 本地预览

```bash
cd ~/Desktop/offer-tracker
python3 -m http.server 8765
```

然后打开 <http://localhost:8765>。

## 自建 Supabase 项目

如果需要 fork 并接入自己的 Supabase：

1. 创建 Supabase 项目。
2. 执行 [`offer-supabase-setup.sql`](./offer-supabase-setup.sql)，或运行 `supabase db push`。
3. 修改 `offer-config.js` 中的 Project URL 与 publishable key。
4. 在 Auth URL Configuration 中配置自己的站点和回调地址。
5. 绝不要把 `service_role` 或 secret key 写入前端或提交到 GitHub。

Supabase 本地配置与迁移位于 `supabase/`。

## 同步规则

- 修改先写入当前用户的浏览器缓存，再延迟同步到 Supabase。
- 同一记录按 `updated_at` 合并，更新时间较新的版本优先。
- 删除操作进入本地待删除队列，断网恢复后继续同步。
- 每个用户使用独立缓存，数据库通过 RLS 只允许访问自己的数据。
- JSON 导出仍然是独立于云服务的灾备手段。
