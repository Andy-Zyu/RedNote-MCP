const { useState, useEffect, useRef } = React;

// API 客户端
const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';

const api = {
  getAccounts: () => fetch(`${API_BASE}/accounts`).then(r => r.json()),
  createAccount: (name) => fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }).then(r => r.json()),
  deleteAccount: (id) => fetch(`${API_BASE}/accounts/${id}`, { method: 'DELETE' }).then(r => r.json()),
  updateAccount: (id, name) => fetch(`${API_BASE}/accounts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }).then(r => r.json()),
  setDefault: (id) => fetch(`${API_BASE}/accounts/${id}/default`, { method: 'POST' }).then(r => r.json()),
  startScan: (id) => fetch(`${API_BASE}/scan/${id}`, { method: 'POST' }).then(r => r.json()),
  abortScan: (id) => fetch(`${API_BASE}/scan/${id}/abort`, { method: 'POST' }).then(r => r.json()),
  relogin: (id) => fetch(`${API_BASE}/accounts/${id}/relogin`, { method: 'POST' }).then(r => r.json())
};

// WebSocket Hook
function useWebSocket(onMessage) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = () => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WebSocket 已连接');
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    };

    ws.current.onclose = () => {
      console.log('WebSocket 断开，3秒后重连');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket 错误:', error);
    };
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (ws.current) ws.current.close();
    };
  }, []);

  return ws.current;
}

// 装饰元素组件
function StarDecor({ className = '', color = '#FFE066' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color} stroke="#1A1A2E" strokeWidth="2">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function CircleRing({ className = '', color = '#A8E6CF' }) {
  return (
    <svg className={className} width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="15" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="20" cy="20" r="8" fill="none" stroke="#1A1A2E" strokeWidth="2" />
    </svg>
  );
}

function DotsGrid({ className = '', color = '#FFE066', rows = 3, cols = 3 }) {
  return (
    <svg className={className} width={cols * 12} height={rows * 12} viewBox={`0 0 ${cols * 12} ${rows * 12}`}>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const x = (i % cols) * 12 + 6;
        const y = Math.floor(i / cols) * 12 + 6;
        return <circle key={i} cx={x} cy={y} r="2" fill={color} />;
      })}
    </svg>
  );
}

// 扫码弹窗组件
function ScanModal({ accountId, accountName, onClose }) {
  const [qrcode, setQrcode] = useState('');
  const [status, setStatus] = useState('等待二维码...');
  const [error, setError] = useState('');

  useWebSocket((msg) => {
    if (msg.scanId !== accountId) return;

    if (msg.type === 'qrcode') {
      setQrcode(msg.data);
      setStatus('请使用小红书 App 扫码');
    } else if (msg.type === 'status') {
      setStatus(msg.status);
    } else if (msg.type === 'success') {
      setStatus('登录成功！');
      setTimeout(onClose, 1500);
    } else if (msg.type === 'error') {
      setError(msg.error);
    }
  });

  useEffect(() => {
    api.startScan(accountId).catch(err => {
      setError(err.message || '启动扫码失败');
    });
  }, [accountId]);

  const handleCancel = async () => {
    await api.abortScan(accountId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="brutalist-card rounded-xl p-6 max-w-md w-full shadow-brutal-lg animate-[scale-in_0.2s_ease-out]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-dark">扫码登录 - {accountName}</h2>
          <button
            onClick={handleCancel}
            className="w-8 h-8 flex items-center justify-center rounded-lg border-[3px] border-dark hover:bg-coral/20 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="#1A1A2E" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="text-center py-8">
            <div className="inline-block px-4 py-2 bg-coral/20 border-[3px] border-dark rounded-lg mb-4">
              <span className="text-dark font-bold">{error}</span>
            </div>
            <button
              onClick={handleCancel}
              className="px-6 py-2 bg-text-light/20 border-[3px] border-dark rounded-lg font-bold text-dark hover:shadow-brutal-sm transition-all"
            >
              关闭
            </button>
          </div>
        ) : (
          <div className="text-center">
            {qrcode ? (
              <div className="inline-block border-[3px] border-dark rounded-xl overflow-hidden mb-4 shadow-brutal-sm">
                <img src={qrcode} alt="二维码" className="w-64 h-64" />
              </div>
            ) : (
              <div className="w-64 h-64 mx-auto mb-4 bg-mint/10 border-[3px] border-dark rounded-xl flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-[3px] border-pink"></div>
              </div>
            )}
            <p className="text-text-muted font-medium">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 账号卡片组件
function AccountCard({ account, onRename, onDelete, onSetDefault, onScan, onRelogin }) {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(account.name);

  const handleRename = async () => {
    if (newName && newName !== account.name) {
      await onRename(account.id, newName);
    }
    setIsEditing(false);
  };

  const statusColor = account.hasCookies ? 'bg-mint/20 text-mint-dark border-mint' : 'bg-text-light/20 text-text-light border-text-light';
  const statusText = account.hasCookies ? '已登录' : '未登录';

  return (
    <div className="brutalist-card rounded-xl p-6 shadow-brutal-md">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {isEditing ? (
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyPress={(e) => e.key === 'Enter' && handleRename()}
              className="border-[3px] border-dark rounded-lg px-3 py-2 w-full font-bold text-dark focus:outline-none focus:ring-3 focus:ring-dark"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-bold text-dark">{account.name}</h3>
              {account.isDefault && (
                <span className="text-2xl" title="默认账号">⭐</span>
              )}
            </div>
          )}
          <p className="text-sm text-text-muted font-medium">ID: {account.id.slice(0, 8)}</p>
        </div>
        <span className={`text-xs font-black px-3 py-1 rounded-lg border-[3px] ${statusColor}`}>
          {statusText}
        </span>
      </div>

      {account.lastLoginAt && (
        <p className="text-xs text-text-light mb-4 font-medium">
          最后登录: {new Date(account.lastLoginAt).toLocaleString('zh-CN')}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {!account.hasCookies && (
          <button
            onClick={() => onScan(account)}
            className="px-4 py-2 bg-pink border-[3px] border-dark text-dark text-sm rounded-lg font-black hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
          >
            扫码登录
          </button>
        )}
        {account.hasCookies && (
          <button
            onClick={() => onRelogin(account)}
            className="px-4 py-2 bg-sky border-[3px] border-dark text-dark text-sm rounded-lg font-black hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
          >
            重新登录
          </button>
        )}
        <button
          onClick={() => setIsEditing(true)}
          className="px-4 py-2 bg-purple border-[3px] border-dark text-dark text-sm rounded-lg font-black hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
        >
          重命名
        </button>
        {!account.isDefault && (
          <button
            onClick={() => onSetDefault(account.id)}
            className="px-4 py-2 bg-yellow border-[3px] border-dark text-dark text-sm rounded-lg font-black hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
          >
            设为默认
          </button>
        )}
        <button
          onClick={() => onDelete(account.id)}
          className="px-4 py-2 bg-coral border-[3px] border-dark text-dark text-sm rounded-lg font-black hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
        >
          删除
        </button>
      </div>
    </div>
  );
}

// 主应用组件
function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [scanningAccount, setScanningAccount] = useState(null);

  useWebSocket((msg) => {
    if (msg.type === 'accounts') {
      setAccounts(msg.accounts);
    }
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await api.getAccounts();
      setAccounts(data);
      setError('');
    } catch (err) {
      setError('加载账号列表失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) return;

    try {
      await api.createAccount(newAccountName.trim());
      setNewAccountName('');
      setShowAddModal(false);
    } catch (err) {
      alert('创建账号失败');
      console.error(err);
    }
  };

  const handleRename = async (id, name) => {
    try {
      await api.updateAccount(id, name);
    } catch (err) {
      alert('重命名失败');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个账号吗？')) return;

    try {
      await api.deleteAccount(id);
    } catch (err) {
      alert('删除失败');
      console.error(err);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await api.setDefault(id);
      await loadAccounts();
    } catch (err) {
      alert('设置默认账号失败');
      console.error(err);
    }
  };

  const handleScan = (account) => {
    setScanningAccount(account);
  };

  const handleRelogin = async (account) => {
    try {
      const data = await api.relogin(account.id);
      if (data.error) {
        alert('重新登录失败：' + data.error);
        return;
      }
      alert(`已清除账号 "${account.name}" 的登录信息，请在浏览器中完成扫码登录`);
      await loadAccounts();
    } catch (err) {
      alert('重新登录失败：' + (err.message || '未知错误'));
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-16 w-16 border-b-[4px] border-mint"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg py-12 px-4 relative overflow-hidden">
      {/* 背景装饰元素 */}
      <StarDecor className="absolute top-20 left-16 w-8 h-8 opacity-30 animate-bob" color="#FFE066" />
      <CircleRing className="absolute top-32 right-20 opacity-20 animate-wiggle" color="#A8E6CF" />
      <DotsGrid className="absolute bottom-32 left-12 opacity-15" color="#C5A3FF" rows={3} cols={4} />
      <StarDecor className="absolute bottom-20 right-16 w-6 h-6 opacity-25" color="#FFB7C5" />
      <CircleRing className="absolute top-[50%] left-8 opacity-15" color="#FFE066" />
      <DotsGrid className="absolute top-40 right-12 opacity-10" color="#87CEEB" rows={2} cols={3} />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Logo 和品牌标题 */}
        <div className="flex items-center justify-center mb-8">
          <img src="./pigbun-logo.svg" alt="PigBun-AI" className="w-16 h-16 mr-4" />
          <div>
            <h1 className="text-2xl font-bold text-dark font-display">PigBun-AI</h1>
            <p className="text-sm text-text-muted font-body">小红书多账号管理</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-4">
          <h2 className="text-3xl md:text-4xl font-bold text-dark">账号管理</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-mint border-[3px] border-dark rounded-xl font-black text-dark hover:shadow-brutal-md hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all flex items-center gap-2 shadow-brutal-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            添加账号
          </button>
        </div>

        {error && (
          <div className="brutalist-card bg-coral/20 border-coral px-6 py-4 rounded-xl mb-6 shadow-brutal-sm">
            <span className="text-dark font-bold">{error}</span>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-block mb-6">
              <svg className="w-24 h-24 text-text-light" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-text-muted text-lg mb-6 font-medium">还没有账号</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-8 py-4 bg-mint border-[3px] border-dark rounded-xl font-black text-dark hover:shadow-brutal-lg hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all shadow-brutal-md"
            >
              添加第一个账号
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onRename={handleRename}
                onDelete={handleDelete}
                onSetDefault={handleSetDefault}
                onScan={handleScan}
                onRelogin={handleRelogin}
              />
            ))}
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="brutalist-card rounded-xl p-6 max-w-md w-full shadow-brutal-lg">
              <h2 className="text-xl font-bold mb-6 text-dark">添加新账号</h2>
              <input
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddAccount()}
                placeholder="输入账号名称"
                className="w-full border-[3px] border-dark rounded-lg px-4 py-3 mb-6 font-medium text-dark placeholder-text-light focus:outline-none focus:ring-3 focus:ring-dark"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewAccountName('');
                  }}
                  className="px-6 py-2 bg-text-light/20 border-[3px] border-dark rounded-lg font-black text-dark hover:shadow-brutal-sm transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleAddAccount}
                  className="px-6 py-2 bg-mint border-[3px] border-dark rounded-lg font-black text-dark hover:shadow-brutal-sm hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        )}

        {scanningAccount && (
          <ScanModal
            accountId={scanningAccount.id}
            accountName={scanningAccount.name}
            onClose={() => setScanningAccount(null)}
          />
        )}
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
