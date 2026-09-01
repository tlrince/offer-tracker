# 秋招投递记录

静态前端部署在 GitHub Pages，数据通过 Supabase Auth + PostgreSQL + RLS 持久化。

> GitHub Pages 只托管页面，不保存运行时数据。仓库中不包含个人投递记录、Supabase URL、anon key 或登录信息。

## 1. 创建 Supabase 数据库

1. 在 <https://supabase.com/dashboard> 创建项目。
2. 打开 **SQL Editor**，完整执行 [`offer-supabase-setup.sql`](./offer-supabase-setup.sql)。
3. 在 **Project Settings → API** 找到：
   - Project URL
   - `anon` / `publishable` public key
4. 绝不要把 `service_role` key 填入网页或提交到 GitHub。

## 2. 配置 Supabase Auth

在 **Authentication → URL Configuration** 中设置：

- Site URL：`https://<GitHub用户名>.github.io/<仓库名>/`
- Redirect URLs：加入同一个 GitHub Pages URL

如果暂时使用邮箱密码登录，可以按需要决定是否开启 Confirm email。

## 3. 本地预览

```bash
cd ~/Desktop/offer-tracker
python3 -m http.server 8765
```

浏览器打开 <http://localhost:8765>，点击右上角「本地模式」，填写 Project URL 与 anon public key，然后注册或登录。

首次登录时，页面会询问是否把当前 origin 下的本地记录合并到云端。迁移完成后应立即导出一次 JSON 备份。

## 4. 发布到 GitHub Pages

先在 GitHub 创建一个**不含 README 的空仓库**，例如 `offer-tracker`，然后执行：

```bash
cd ~/Desktop/offer-tracker
git remote add origin https://github.com/<GitHub用户名>/offer-tracker.git
git push -u origin main
```

在仓库 **Settings → Pages** 中选择：

- Source：Deploy from a branch
- Branch：`main`
- Folder：`/ (root)`

发布后登录同一个 Supabase 账号即可读取云端数据。

## 同步规则

- 本地修改先写入当前用户的浏览器缓存，再延迟同步到 Supabase。
- 同一记录按 `updated_at` 合并，更新时间较新的版本优先。
- 删除操作使用本地待删除队列；断网恢复后继续同步。
- 每个用户使用独立缓存，数据库通过 RLS 只允许访问自己的数据。
- JSON 导出仍然是独立于云服务的灾备手段。
