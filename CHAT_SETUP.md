# StudyWithMiku - 多人在线聊天室增强版部署指南

本项目在原版 *StudyWithMiku* 的基础上，增加了 **实时多人聊天** 与 **GitHub 登录** 功能。无需复杂的数据库配置，基于 Node.js + Socket.io 实现，支持宝塔面板快速部署。

## 🛠️ 技术栈
- **前端**: 原生 HTML/CSS/JS + Socket.io Client
- **后端**: Node.js + Express + Socket.io
- **认证**: Passport.js (GitHub OAuth)
- **部署**: Nginx 反向代理 + PM2

---

## 🚀 第一步：后端环境准备

### 1. 目录结构
建议在网站根目录下创建一个 `chat-server` 文件夹：
```text
/www/wwwroot/你的域名/
├── index.html          # 前端入口
├── assets/             # 前端资源
└── chat-server/        # [新建] 后端目录
    ├── server.js
    ├── package.json
    └── .env
```

### 2. 初始化项目
在 `chat-server` 目录下打开终端，执行：
```bash
# 初始化
npm init -y

# 安装依赖
npm install express socket.io express-session passport passport-github2 cors dotenv
```

### 3. 配置服务端代码 (`server.js`)
新建 `server.js`，填入以下代码。该代码已包含**静态资源托管**和**WebSocket支持**。

<details>
<summary>点击展开 server.js 完整代码</summary>

```javascript
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 允许跨域 (适配反代环境)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['https://你的域名.com'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = socketIO(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }
});

// Session 配置
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'miku-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

// ⚠️ 关键：托管上级目录的静态文件
app.use(express.static(path.join(__dirname, '../')));

// Passport 配置
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (process.env.GITHUB_CLIENT_ID) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      avatar: profile.photos?.[0]?.value || `https://github.com/${profile.username}.png`,
      type: 'github'
    });
  }));
}

// 路由
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => res.redirect('/?github_auth=success')
);

app.get('/auth/user', (req, res) => {
  res.json({ authenticated: req.isAuthenticated(), user: req.user });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// Socket.io 逻辑
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

const onlineUsers = new Map();

io.on('connection', (socket) => {
  const user = socket.request.session?.passport?.user;
  const userInfo = user ? { ...user, id: socket.id } : {
    id: socket.id,
    type: 'guest',
    displayName: `访客#${Math.floor(Math.random()*1000)}`,
    avatar: 'assets/img/default_avatar.png' // 请确保有默认头像
  };

  onlineUsers.set(socket.id, userInfo);
  io.emit('online_users', Array.from(onlineUsers.values()));
  socket.emit('welcome', { message: '欢迎来到 Miku 自习室！', userInfo });

  socket.on('chat message', (data) => {
    io.emit('chat message', {
      user: onlineUsers.get(socket.id),
      text: data.text,
      timestamp: new Date()
    });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_users', Array.from(onlineUsers.values()));
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```
</details>

---

## 🎨 第二步：前端整合

### 1. 添加文件
将 `chat.css` 和 `chat.js` 分别放入 `assets/css/` 和 `assets/js/` 目录中。

### 2. 修改 `index.html`
在 `<body>` 标签内添加 HTML 结构，并在底部引用 JS。

**HTML 结构:**
```html
<!-- 聊天系统 -->
<div id="chat-container">
  <div id="chat-header">
    <div id="chat-title"><span class="chat-status-indicator"></span> 💬 聊天室</div>
    <div id="chat-online-count">0 在线</div>
    <button id="chat-toggle">▼</button>
  </div>
  <div id="chat-messages"></div>
  <div id="chat-input-area">
    <div id="chat-auth-prompt" style="display: none;">
      <p>登录后显示头像</p>
      <button id="chat-github-login">🔐 GitHub 登录</button>
    </div>
    <div id="chat-user-info" style="display: none;">
      <img id="chat-user-avatar" src="">
      <span id="chat-user-name"></span>
      <button id="chat-logout">退出</button>
    </div>
    <div id="chat-input-wrapper">
      <input type="text" id="chat-input" placeholder="输入消息...">
      <button id="chat-send">发送</button>
    </div>
  </div>
</div>
```

**JS 引用 (推荐使用 BootCDN):**
```html
<!-- 必须放在 body 最底部 -->
<script src="https://cdn.bootcdn.net/ajax/libs/socket.io/4.7.4/socket.io.min.js"></script>
<script src="assets/js/chat.js"></script>
<script>
  // 自动连接当前域名
  window.addEventListener('load', () => {
      window.mikuChat = new MikuChat();
  });
</script>
```

---

## 🔑 第三步：配置 GitHub OAuth

1.  访问 [GitHub Developer Settings](https://github.com/settings/developers)。
2.  创建 **New OAuth App**。
3.  填写信息（**注意 HTTPS**）：
    *   **Homepage URL**: `https://你的域名.com`
    *   **Authorization callback URL**: `https://你的域名.com/auth/github/callback`
4.  获取 `Client ID` 和 `Client Secret`。

### 创建配置文件 `.env`
在 `chat-server/` 目录下新建 `.env` 文件：

```env
PORT=3001
GITHUB_CLIENT_ID=你的Client_ID
GITHUB_CLIENT_SECRET=你的Client_Secret
GITHUB_CALLBACK_URL=https://你的域名.com/auth/github/callback
SESSION_SECRET=随便写一串乱码
```

---

## ⚡ 第四步：Nginx 与 宝塔配置 (最关键)

为了让 https 域名支持 WebSocket，必须配置反向代理。

1.  **启动后端**:
    在宝塔面板 -> 软件商店 -> PM2 管理器 -> 添加项目 -> 选择 `chat-server/server.js` 启动。

2.  **配置反向代理**:
    进入 网站 -> 设置 -> 反向代理 -> 添加反向代理。
    *   **代理目录**: `/`  (必须是根目录)
    *   **目标URL**: `http://127.0.0.1:3001`
    *   **发送域名**: `$host`

3.  **开启 WebSocket 支持 (必做)**:
    在反向代理列表中，点击 **"配置文件"**，完全替换为以下代码：

```nginx
#PROXY-START/
location ^~ /
{
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    
    # --- WebSocket 核心配置 START ---
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # --- WebSocket 核心配置 END ---
    
    add_header X-Cache $upstream_cache_status;
    
    # 静态资源缓存
    set $static_file 0;
    if ( $uri ~* "\.(gif|png|jpg|css|js|woff|woff2)$" ) {
        set $static_file 1;
        expires 1m;
    }
    if ( $static_file = 0 ) {
        add_header Cache-Control no-cache;
    }
}
#PROXY-END/
```

---

## 🆘 常见问题 (Troubleshooting)

| 问题现象 | 可能原因 | 解决方案 |
| :--- | :--- | :--- |
| **0 在线 / 无法连接** | JS 资源被墙 | 检查 `index.html` 是否使用了 BootCDN 的 socket.io 源。 |
| **GitHub 报错 redirect_uri** | 地址不匹配 | 检查 GitHub 后台的回调 URL 是否为 `https`，且去掉了端口号。 |
| **Cannot GET /** | 静态目录配置错误 | 检查 `server.js` 中 `express.static` 是否指向了上级目录 `../`。 |
| **404 Nginx** | 反代配置错误 | 确保反向代理目录是 `/` 而不是 `/chat`。 |
| **Socket 报 400 错误** | Nginx 头缺失 | 检查反代配置文件里是否有 `Upgrade` 和 `Connection "upgrade"`。 |

---

**Enjoy Studying with Miku! 🎧**