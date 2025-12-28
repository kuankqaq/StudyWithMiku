# Study With Miku 聊天服务器

支持GitHub OAuth登录的实时聊天服务器。

## 🚀 快速开始

### 1. 安装依赖
```bash
cd chat-server
npm install
```

### 2. 配置GitHub OAuth App

#### 创建GitHub OAuth应用
1. 访问 https://github.com/settings/developers
2. 点击 "New OAuth App"
3. 填写信息：
   - **Application name**: Study With Miku Chat
   - **Homepage URL**: `https://your-domain.com` (你的网站地址)
   - **Authorization callback URL**: `http://localhost:3001/auth/github/callback` (开发环境) 或 `https://your-server.com/auth/github/callback` (生产环境)
4. 点击 "Register application"
5. 复制 **Client ID** 和 **Client Secret**

### 3. 配置环境变量
```bash
# 复制配置模板
cp .env.example .env

# 编辑.env文件，填入实际值
```

必填配置：
- `GITHUB_CLIENT_ID`: 你的GitHub OAuth Client ID
- `GITHUB_CLIENT_SECRET`: 你的GitHub OAuth Client Secret
- `SESSION_SECRET`: 随机字符串（可用 `openssl rand -hex 32` 生成）
- `ALLOWED_ORIGINS`: 前端网站地址
- `FRONTEND_URL`: 前端网站地址

### 4. 启动服务器

#### 开发模式
```bash
npm run dev
```

#### 生产模式
```bash
npm start
```

服务器将在 `http://localhost:3001` 启动。

## 📦 生产部署

### 使用PM2（推荐）

1. 安装PM2
```bash
npm install -g pm2
```

2. 启动服务
```bash
pm2 start server.js --name miku-chat
```

3. 查看日志
```bash
pm2 logs miku-chat
```

4. 设置开机自启
```bash
pm2 startup
pm2 save
```

### 使用systemd（Linux）

创建服务文件 `/etc/systemd/system/miku-chat.service`:

```ini
[Unit]
Description=Study With Miku Chat Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/StudyWithMiku/chat-server
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl enable miku-chat
sudo systemctl start miku-chat
```

## 🔒 安全建议

1. **生产环境必须使用HTTPS**
   - 更新 `GITHUB_CALLBACK_URL` 为 `https://...`
   - 设置 `NODE_ENV=production`

2. **更换SESSION_SECRET**
   - 生成强随机密钥：`openssl rand -hex 32`

3. **配置防火墙**
   - 仅开放必要端口（如3001）

4. **使用反向代理**
   - 推荐使用Nginx作为反向代理
   - 示例配置：
   ```nginx
   location /chat/ {
       proxy_pass http://localhost:3001/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
   }
   ```

## 📊 API端点

- `GET /health` - 健康检查
- `GET /auth/github` - GitHub登录
- `GET /auth/github/callback` - OAuth回调
- `GET /auth/user` - 获取当前用户
- `POST /auth/logout` - 登出

## 🔌 Socket.io事件

### 客户端发送
- `chat_message` - 发送消息

### 服务器发送
- `welcome` - 连接欢迎
- `chat_message` - 接收消息
- `online_users` - 在线用户列表

## 🐛 故障排除

### CORS错误
确保 `.env` 中的 `ALLOWED_ORIGINS` 包含你的前端地址。

### GitHub登录失败
1. 检查 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET` 是否正确
2. 确认OAuth App的回调URL与 `GITHUB_CALLBACK_URL` 一致
3. 查看服务器日志获取详细错误信息

### Socket连接失败
1. 确认服务器正在运行
2. 检查防火墙是否阻止了WebSocket连接
3. 验证前端配置的服务器地址正确

## 📝 许可证

MIT License
