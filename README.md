# mini-scan

一个最小可运行的文档扫描小程序项目。

## 目录

- `backend/` FastAPI + OpenCV 扫描后端
- `miniprogram/` 微信小程序前端

## 第一版能力

- 拍照 / 选图
- 上传图片到后端
- 自动检测文档四边形
- 透视矫正
- 基础扫描增强
- 彩色 / 黑白扫描模式

## 后端启动

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

接口：`POST /api/scan?mode=color|bw`

## 小程序

使用微信开发者工具导入 `miniprogram/` 目录，并在 `utils/config.js` 中修改后端地址。
