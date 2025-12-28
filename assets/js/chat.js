/**
 * Study With Miku - 聊天系统客户端
 */

class MikuChat {
    // ⚠️ 修改：默认不再连接 localhost:3001，而是空（自动连接当前域名）
    constructor(serverUrl = '') {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.connected = false;
        this.currentUser = null;
        this.minimized = false;

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // 获取DOM元素
        this.elements = {
            container: document.getElementById('chat-container'),
            header: document.getElementById('chat-header'),
            toggle: document.getElementById('chat-toggle'),
            messages: document.getElementById('chat-messages'),
            input: document.getElementById('chat-input'),
            send: document.getElementById('chat-send'),
            onlineCount: document.getElementById('chat-online-count'),
            authPrompt: document.getElementById('chat-auth-prompt'),
            userInfo: document.getElementById('chat-user-info'),
            githubLogin: document.getElementById('chat-github-login'),
            logout: document.getElementById('chat-logout'),
            userName: document.getElementById('chat-user-name'),
            userAvatar: document.getElementById('chat-user-avatar'),
            statusIndicator: document.querySelector('.chat-status-indicator')
        };

        // 如果找不到元素，说明HTML结构没跟上，终止运行
        if (!this.elements.container) return;

        this.bindEvents();
        // 初始化时不一定能马上连上，先显示为Guest
        this.checkAuthStatus(); 
        this.connect();
        this.checkOAuthCallback();
    }

    bindEvents() {
        this.elements.header.addEventListener('click', () => this.toggleMinimize());

        this.elements.send.addEventListener('click', () => this.sendMessage());
        this.elements.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        if(this.elements.githubLogin) {
            this.elements.githubLogin.addEventListener('click', () => this.loginWithGitHub());
        }
        if(this.elements.logout) {
            this.elements.logout.addEventListener('click', () => this.logout());
        }
    }

    connect() {
        if (typeof io === 'undefined') {
            console.error('Socket.io SDK未加载');
            return;
        }

        try {
            // ⚠️ 关键：如果不传 URL，socket.io 会自动连接当前网站
            // 因为我们做了 Nginx 反代，所以这样最稳妥
            const opts = {
                withCredentials: true,
                transports: ['websocket', 'polling']
            };
            
            // 如果传入了具体URL就用具体的，否则用默认(当前域名)
            this.socket = this.serverUrl ? io(this.serverUrl, opts) : io(opts);

            this.socket.on('connect', () => {
                this.connected = true;
                this.updateConnectionStatus(true);
                this.addSystemMessage('🔗 已连接到 Miku 频道');
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
                this.updateConnectionStatus(false);
            });

            // 监听历史消息
            this.socket.on('history', (history) => {
                 this.elements.messages.innerHTML = '';
                 history.forEach(msg => {
                     // 简单适配一下不同格式的消息
                     const formatted = msg.user ? msg : { 
                         text: msg.text, 
                         user: { 
                             type: 'guest', 
                             displayName: msg.name || '同学', 
                             avatar: 'assets/img/default_avatar.png' 
                         }, 
                         timestamp: new Date() 
                     };
                     this.addMessage(formatted);
                 });
                 this.addSystemMessage('Miku 正在看着你学习...');
            });

            // 监听新消息 (根据你 server.js 的事件名可能叫 'chat message' 或 'chat_message')
            // 这里为了保险，两个都监听
            const handleMsg = (msg) => {
                // 如果是简单的文本格式，转换一下结构以适配 UI
                if (!msg.user) {
                    msg = {
                        text: msg.text,
                        user: {
                            displayName: msg.name,
                            avatar: 'https://cdn.icon-icons.com/icons2/1378/PNG/512/avatardefault_92824.png',
                            type: 'guest'
                        },
                        timestamp: new Date()
                    };
                }
                this.addMessage(msg);
            };

            this.socket.on('chat_message', handleMsg);
            this.socket.on('chat message', handleMsg);

            // 在线人数
            this.socket.on('online_users', (list) => this.updateOnlineCount(list.length || list));
            this.socket.on('online count', (count) => this.updateOnlineCount(count));

        } catch (error) {
            console.error('Socket init failed:', error);
        }
    }

    async checkAuthStatus() {
        // 如果后端还没写 auth 接口，这里可能会 404，不影响聊天
        try {
            const response = await fetch('/auth/user');
            if(response.ok) {
                const data = await response.json();
                if (data.authenticated) {
                    this.currentUser = data.user;
                    this.showUserInfo();
                    return;
                }
            }
            this.showAuthPrompt();
        } catch (error) {
            // 后端没有 Auth 接口，保持 Guest 状态
            this.showAuthPrompt();
        }
    }

    checkOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        // 如果是从 GitHub 回调回来的
        if (urlParams.get('code')) {
             // 清理一下 URL，看起来干净点
             window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    loginWithGitHub() {
        // 这里的地址要和 Nginx 反代的地址一致
        window.location.href = '/auth/github';
    }

    async logout() {
        try {
            await fetch('/auth/logout'); // 简单请求
            window.location.reload();
        } catch (error) {
            window.location.reload();
        }
    }

    showAuthPrompt() {
        if(this.elements.authPrompt) this.elements.authPrompt.style.display = 'block';
        if(this.elements.userInfo) this.elements.userInfo.style.display = 'none';
    }

    showUserInfo() {
        if(this.elements.authPrompt) this.elements.authPrompt.style.display = 'none';
        if(this.elements.userInfo) {
            this.elements.userInfo.style.display = 'flex';
            if (this.currentUser) {
                this.elements.userName.textContent = this.currentUser.displayName || this.currentUser.username;
                this.elements.userAvatar.src = this.currentUser.avatar;
            }
        }
    }

    sendMessage() {
        const text = this.elements.input.value.trim();
        if (!text) return;
        
        // 发送通用格式
        this.socket.emit('chat message', { 
            text: text,
            // 如果已经登录，后端会自己读 Session，这里传 ID 只是作为备用
            tempId: Math.random()
        });
        
        this.elements.input.value = '';
    }

    addMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';

        const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        
        // 安全处理
        const safeText = this.escapeHtml(message.text);
        const avatar = (message.user && message.user.avatar) ? message.user.avatar : 'assets/img/default_avatar.png';
        const name = (message.user && message.user.displayName) ? message.user.displayName : (message.name || '同学');
        const type = (message.user && message.user.type) ? message.user.type : 'guest';

        messageEl.innerHTML = `
            <img src="${avatar}" class="chat-message-avatar" onerror="this.src='https://cdn.icon-icons.com/icons2/1378/PNG/512/avatardefault_92824.png'">
            <div class="chat-message-content">
                <div class="chat-message-username ${type}">
                    ${this.escapeHtml(name)}
                    ${type === 'github' ? '<span class="chat-message-badge">Dev</span>' : ''}
                </div>
                <div class="chat-message-text">${safeText}</div>
                <div class="chat-message-time">${timeStr}</div>
            </div>
        `;

        this.elements.messages.appendChild(messageEl);
        this.scrollToBottom();
    }

    addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'chat-system-message';
        div.textContent = text;
        this.elements.messages.appendChild(div);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    toggleMinimize() {
        this.minimized = !this.minimized;
        if (this.minimized) {
            this.elements.container.classList.add('minimized');
            this.elements.toggle.innerHTML = '&#9650;'; // 向上箭头
        } else {
            this.elements.container.classList.remove('minimized');
            this.elements.toggle.innerHTML = '&#9660;'; // 向下箭头
        }
    }

    updateOnlineCount(count) {
        if(this.elements.onlineCount) this.elements.onlineCount.textContent = `${count} 在线`;
    }

    updateConnectionStatus(connected) {
        if (this.elements.statusIndicator) {
            if (connected) {
                this.elements.statusIndicator.classList.remove('disconnected');
                this.elements.statusIndicator.style.background = '#39d2c0';
            } else {
                this.elements.statusIndicator.classList.add('disconnected');
                this.elements.statusIndicator.style.background = '#ff5555';
            }
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// 初始化
window.MikuChat = MikuChat;