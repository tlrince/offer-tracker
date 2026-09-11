# 秋招投递记录

在线地址：<https://tlrince.github.io/offer-tracker/>

静态页面部署在 GitHub Pages，数据通过 Firebase Authentication + Cloud Firestore 持久化。Firestore 使用 Spark 免费计划，当前数据库明确标记为 `freeTier: true`。

> GitHub Pages 只托管页面，不保存运行时数据。仓库不包含个人投递记录、密码或服务端密钥。`offer-config.js` 是 Firebase 官方设计为公开的 Web 配置，安全边界由 Firestore Security Rules 提供。

## 直接使用

1. 打开在线地址。
2. 点击右上角「云端未登录」。
3. 使用预设的个人账号登录；注册入口已关闭。
4. 登录后，修改会同步到 Cloud Firestore，并在浏览器保留离线缓存。

账号密码保存在本机 macOS Keychain 的 `Firebase offer-tracker owner` 条目中，不写入仓库。

Firebase 项目已经完成：

- 香港区域的 Firestore Native 数据库（Spark 免费层）
- 锁定预设 Owner UID 的 Firestore Security Rules
- Firebase Web App、邮箱密码登录与 GitHub Pages 配置
- 本地缓存、较新版本合并和离线删除队列

## 迁移现有记录

原来的 40 条记录属于 `file://` 页面自己的 localStorage，和 GitHub Pages 是不同的 origin，不能自动共享。

推荐迁移方式：

1. 打开原来的 `~/Desktop/offer.html`。
2. 点击右上角「云端未登录」，使用预设个人账号登录。
3. 首次登录时确认把现有本地记录合并到云端。
4. 等待显示“同步完成”，再登录在线地址核对数量。
5. 额外导出一次 JSON 作为独立备份。

备用方式：先从原页面导出 JSON，再到在线页面登录并导入。

## 本地预览

```bash
cd ~/Desktop/offer-tracker
python3 -m http.server 8765
```

然后打开 <http://localhost:8765>。

## Firebase 配置

- Firebase 项目：`tlrince-offer-tracker`
- Firestore 规则：[`firestore.rules`](./firestore.rules)
- Firestore 索引：[`firestore.indexes.json`](./firestore.indexes.json)
- CLI 配置：[`firebase.json`](./firebase.json)

重新部署安全规则：

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 同步规则

- 修改先写入当前用户的浏览器缓存，再延迟同步到 Firestore。
- 同一记录按 `updatedAt` 合并，更新时间较新的版本优先。
- 删除操作进入本地待删除队列，断网恢复后继续同步。
- 数据存储在 `users/{uid}/applications/{recordId}`，规则同时校验路径 UID 和预设 Owner UID。
- JSON 导出仍然是独立于云服务的灾备手段。
