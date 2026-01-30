import React, { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

// --- 1. 核心配置 ---
import { auth } from './api/firebase';

// --- 2. 业务大页面 (从新路径引入) ---
import { GateScreen } from './components/GateScreen';
import IdentityScreen from './components/auth/IdentityScreen';
import AdminDashboard from './components/admin/AdminDashboard';
import MemberApp from './components/member/MemberApp';

export default function App() {
  // --- 全局状态 ---
  const [user, setUser] = useState(null); 
  const [appData, setAppData] = useState({ 
    role: null,      // 'ADMIN' 或 'MEMBER'
    labName: null,   // 实验室名称
    userName: null   // 用户姓名 (Admin 或 具体成员名)
  }); 
  const [identityStage, setIdentityStage] = useState(false); // 是否处于身份验证阶段

  // --- 初始化匿名登录 ---
  useEffect(() => { 
    const initAuth = async () => { 
      try { 
        await signInAnonymously(auth); 
      } catch (e) {
        console.error("Auth failed", e);
      } 
    }; 
    initAuth(); 
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u)); 
    return () => unsubscribe();
  }, []);

  // --- 登录成功回调 ---
  const handleLoginSuccess = ({ role, labName }) => { 
    if (role === 'ADMIN') {
      setAppData({ role, labName, userName: 'Admin' }); 
    } else { 
      // 成员登录后需要先去 IdentityScreen 验证个人身份
      setAppData({ role, labName, userName: null }); 
      setIdentityStage(true); 
    } 
  };

  // --- 个人身份验证成功回调 ---
  const handleIdentityVerified = (userName) => { 
    setAppData(prev => ({ ...prev, userName })); 
    setIdentityStage(false); 
  };

  // --- 退出登录 ---
  const logout = () => {
    setAppData({ role: null, labName: null, userName: null });
    setIdentityStage(false);
  };

  // --- 渲染逻辑 (像不像一个指示牌？) ---

  // A. 基础加载态
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8"/>
      </div>
    );
  }

  // B. 第一关：选择/创建实验室 (GateScreen)
  if (!appData.labName) {
    return <GateScreen onLoginSuccess={handleLoginSuccess} />;
  }
  
  // C. 管理员端 (AdminDashboard)
  if (appData.role === 'ADMIN') {
    return <AdminDashboard labName={appData.labName} onLogout={logout} />;
  }
  
  // D. 成员身份核验阶段 (IdentityScreen)
  if (identityStage) {
    return <IdentityScreen labName={appData.labName} onIdentityVerified={handleIdentityVerified} />;
  }
  
  // E. 成员正式端 (MemberApp)
  return <MemberApp labName={appData.labName} userName={appData.userName} onLogout={logout} />;
}