# 🏦 银行股双擎量化系统 (Bank Quant System)

基于 Cloudflare (Pages + Worker) 构建的 Serverless A股银行股专属量化投研终端。

## ✨ 核心特性
* **0 成本部署**：全套架构依托 Cloudflare 免费额度，无需购买服务器。
* **五维长线打分模型**：融合 5 年均值 ROE、股息率、估值分位、不良率、拨备率进行量化评分。
* **极速并发爬虫**：直连腾讯骨干网 0.05 秒刷新现价，纯 JS 并发抓取东方财富最新财报。
* **AI 策略军师**：接入大模型流式输出 (SSE)，深度解读财报并结合宏观经济给出操作评级。
* **历史回测引擎**：基于 Tushare 历史数据，秒级回测买卖防线，计算年化收益与最大回撤。

## 🛠️ 部署指南
1.  **前端部署**：将 `frontend` 文件夹上传至 Cloudflare Pages。
2.  **后端部署**：在 Cloudflare 创建 Worker，贴入 `backend/worker.js` 代码。
3.  **配置 KV 空间**：绑定名为 `BANK_DB` 的 KV 命名空间用于存储用户配置与缓存。
4.  **接口打通**：在前端 `script.js` 第一行修改 `API_BASE` 为你的 Worker 域名。