require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const cors = require('cors');
const path = require('path'); // ✅ 新增：引入 path 模块

const app = express();
const server = http.createServer(app);

// CORS配置 (既然现在前后端同源，其实可以简化，但保留也没事)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['https://study.kuank.top', 'http://localhost:3000'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Session配置
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'miku-study-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 注意：如果配置了反代且没有在Node层配置SSL，这里设为false即可，Nginx会处理SSL
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

// ✅ 关键修改：托管上一级目录的静态文件 (index.html, css, js)
// 这样浏览器访问 "/" 时，Node 就会自动返回 index.html
app.use(express.static(path.join(__dirname, '../')));

// Passport序列化
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// GitHub OAuth策略
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || 'https://study.kuank.top/auth/github/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      avatar: profile.photos?.[0]?.value || `https://github.com/${profile.username}.png`,
      profileUrl: profile.profileUrl
    };
    return done(null, user);
  }));
}

// GitHub OAuth路由
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    // ✅ 修改：登录成功后，直接重定向回网站根目录
    res.redirect('/?github_auth=success');
  }
);

// 获取当前用户信息
app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

// 登出
app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    // 登出后重定向回首页，或者返回JSON让前端处理
    if (err) { return res.status(500).json({ error: 'Logout failed' }); }
    res.redirect('/'); 
  });
});

// Socket.io session共享
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// 在线用户管理
const onlineUsers = new Map();

// Socket.io连接处理
io.on('connection', (socket) => {
  // 获取用户信息（如果已登录）
  const session = socket.request.session;
  const user = session?.passport?.user;
  
  let userInfo;
  if (user) {
    // GitHub登录用户
    userInfo = {
      id: socket.id,
      type: 'github',
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar
    };
  } else {
    // 匿名访客
    const guestId = Math.floor(Math.random() * 10000);
    userInfo = {
      id: socket.id,
      type: 'guest',
      username: `guest_${guestId}`,
      displayName: `访客#${guestId}`,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${guestId}`
    };
  }

  onlineUsers.set(socket.id, userInfo);

  // 向所有客户端广播在线用户列表
  io.emit('online_users', Array.from(onlineUsers.values()));

  // 欢迎消息 (如果之前前端写了 history 监听，这里 welcome 监听也可以保留)
  socket.emit('welcome', {
    message: '欢迎来到 Miku 自习室！',
    userInfo: userInfo
  });

  // 接收聊天消息
  socket.on('chat_message', (data) => { // 兼容前端事件名
     handleMessage(socket, data);
  });
  socket.on('chat message', (data) => { // 兼容前端可能写的旧事件名
     handleMessage(socket, data);
  });

  function handleMessage(socket, data) {
    const sender = onlineUsers.get(socket.id);
    if(!sender) return;

    const message = {
      id: Date.now(),
      user: sender, // 包含头像、名字、类型
      text: data.text || data, // 兼容对象或纯文本
      timestamp: new Date().toISOString()
    };
    
    // 广播消息给所有用户
    io.emit('chat_message', message);
  }

  // 用户断开连接
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_users', Array.from(onlineUsers.values()));
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', online: onlineUsers.size });
});

// 启动服务器
const PORT = process.env.PORT || 3001; // 保持和你反代一致的端口
server.listen(PORT, () => {
  console.log(`🚀 Miku 服务运行中: http://localhost:${PORT}`);
});