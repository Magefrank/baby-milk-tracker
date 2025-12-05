import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, Plus, Calendar, Baby, Droplets, Clock, History, BarChart3, X, Check, Edit2, TrendingUp, Timer, AlertCircle } from 'lucide-react';

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('PWA registered'))
      .catch(error => console.log('PWA registration failed'));
  });
}

// 优化的排序函数：增加了"防崩溃"保护
const sortRecordsByTime = (records) => {
  if (!Array.isArray(records)) return [];
  
  return [...records].sort((a, b) => {
    // 保护：如果有坏数据（缺字段），扔到最后
    if (!a || !b) return 0;
    if (!a.dateString && !b.dateString) return 0;
    if (!a.dateString) return 1;
    if (!b.dateString) return -1;

    // 1. 先按日期排序(降序)
    if (a.dateString !== b.dateString) {
      return b.dateString.localeCompare(a.dateString);
    }
    
    // 保护：确保 displayTime 存在
    const timeStrA = a.displayTime || "00:00";
    const timeStrB = b.displayTime || "00:00";

    // 2. 再按显示时间排序(降序)
    try {
      const timeA = timeStrA.split(':').map(Number);
      const timeB = timeStrB.split(':').map(Number);
      const minutesA = (timeA[0] || 0) * 60 + (timeA[1] || 0);
      const minutesB = (timeB[0] || 0) * 60 + (timeB[1] || 0);
      
      if (minutesA !== minutesB) {
        return minutesB - minutesA;
      }
    } catch (e) {
      console.warn('时间解析出错', e);
      return 0;
    }

    // 3. 最后按创建时间戳兜底
    const tsA = a.timestamp || 0;
    const tsB = b.timestamp || 0;
    return tsB - tsA;
  });
};

const STORAGE_KEY = 'baby_tracker_local_cache';

const safeFetch = async (url, options = {}) => {
  try {
    if (window.location.protocol === 'blob:' || window.location.hostname === '') {
      return { ok: false, status: 0, type: 'preview_mode' };
    }
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    console.warn('API error:', error);
    return { ok: false, status: 0, type: 'network_error' };
  }
};

export default function BabyMilkTracker() {
  const [amount, setAmount] = useState('');
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTrendChart, setShowTrendChart] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  const [now, setNow] = useState(new Date());
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const CORRECT_PASSWORD = 'mumu';
  
  const [editingRecord, setEditingRecord] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editTime, setEditTime] = useState('');

  const [deletingId, setDeletingId] = useState(null);
  
  useEffect(() => {
    try {
      const authToken = localStorage.getItem('baby_tracker_auth');
      if (authToken === 'authenticated') {
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.error('LocalStorage 访问受限');
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // 从本地缓存加载
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setRecords(sortRecordsByTime(parsed));
        }
        setLoading(false);
      }
    } catch (e) {
      console.error('读取缓存失败', e);
      setLoading(false);
    }
  }, []);
  
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      try {
        localStorage.setItem('baby_tracker_auth', 'authenticated');
      } catch (e) {}
      setIsAuthenticated(true);
      setPasswordError('');
    } else {
      setPasswordError('密码错误，请重试');
      setPassword('');
    }
  };
  
  const smartMergeRecords = useCallback((serverList, localList) => {
    if (!Array.isArray(serverList)) return localList;
    
    const serverMap = new Map(serverList.map(r => [r.id, r]));
    const nowTs = Date.now();
    const RECENT_THRESHOLD = 5 * 60 * 1000; 

    localList.forEach(local => {
      if (local.updatedAt && (nowTs - local.updatedAt < RECENT_THRESHOLD)) {
        const serverRecord = serverMap.get(local.id);
        
        if (!serverRecord) {
          serverMap.set(local.id, local);
        } else {
          const serverTime = serverRecord.updatedAt || 0;
          if (local.updatedAt > serverTime) {
            serverMap.set(local.id, local);
          }
        }
      }
    });

    return Array.from(serverMap.values());
  }, []);

  const fetchRecords = async () => {
    try {
      const timestamp = new Date().getTime();
      const response = await safeFetch(`/api/records?_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (response && response.ok) {
        const serverData = await response.json();
        setRecords(prevLocalRecords => {
          const merged = smartMergeRecords(serverData, prevLocalRecords);
          const sorted = sortRecordsByTime(merged);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
          } catch(e) {}
          return sorted;
        });
      }
    } catch (error) {
      console.error('获取数据异常', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchRecords();
      const interval = setInterval(() => fetchRecords(), 60000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const filteredRecords = useMemo(() => {
    return records.filter(record => record && record.dateString === selectedDate);
  }, [records, selectedDate]);

  const totalAmount = useMemo(() => {
    return filteredRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  }, [filteredRecords]);

  // 计算距离上次喂奶 (增强防御版)
  const timeSinceLastFeed = useMemo(() => {
    if (!records || records.length === 0) return null;
    
    const lastRecord = records[0];
    
    // 防御：如果最新记录缺少必要字段，跳过
    if (!lastRecord || !lastRecord.dateString || !lastRecord.displayTime) return '数据不全';
    
    try {
      const [year, month, day] = lastRecord.dateString.split('-').map(Number);
      const [hour, minute] = lastRecord.displayTime.split(':').map(Number);
      
      // 使用更稳健的日期构造方式
      const recordDate = new Date(year, month - 1, day, hour, minute);
      
      // 检查日期是否有效
      if (isNaN(recordDate.getTime())) return '时间无效';
      
      const diffInMinutes = Math.floor((now - recordDate) / (1000 * 60));
      
      if (diffInMinutes < 0) return '时间设定在未来'; 
      if (diffInMinutes < 1) return '刚刚';
      
      const hours = Math.floor(diffInMinutes / 60);
      const minutes = diffInMinutes % 60;
      
      if (hours === 0) return `${minutes}分钟前`;
      if (hours > 24) {
          const days = Math.floor(hours / 24);
          return `${days}天前`;
      }
      return `${hours}小时 ${minutes}分钟前`;
    } catch (e) {
      console.error('计算时间差出错', e);
      return '计算出错';
    }
  }, [records, now]);

  const dailyStats = useMemo(() => {
    const stats = {};
    records.forEach(record => {
      if (!record || !record.dateString) return;
      const date = record.dateString;
      stats[date] = (stats[date] || 0) + Number(record.amount || 0);
    });
    
    return Object.entries(stats)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  const trendData = useMemo(() => {
    const last15Days = [];
    const today = new Date();
    
    for (let i = 14; i >= 0; i--) {
      // Safari 兼容的日期操作
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // 手动构建 YYYY-MM-DD，避免时区问题
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dateString = `${y}-${m}-${d}`;
      
      const dayTotal = records
        .filter(r => r && r.dateString === dateString)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      
      last15Days.push({
        date: dateString,
        shortDate: `${Number(m)}/${Number(d)}`,
        total: dayTotal
      });
    }
    
    return last15Days;
  }, [records]);

  const trendStats = useMemo(() => {
    const totals = trendData.map(d => d.total).filter(t => t > 0);
    if (totals.length === 0) return { avg: 0, max: 0, min: 0 };
    
    return {
      avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      max: Math.max(...totals),
      min: Math.min(...totals)
    };
  }, [trendData]);

  const showSuccess = () => {
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
    }, 2000);
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    if (!amount) return;
    
    setIsSubmitting(true);
    const nowTime = new Date();
    // 构造本地日期字符串
    const y = nowTime.getFullYear();
    const m = String(nowTime.getMonth() + 1).padStart(2, '0');
    const d = String(nowTime.getDate()).padStart(2, '0');
    const todayString = `${y}-${m}-${d}`;

    const timestamp = Date.now();
    
    const newRecord = {
      id: `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      amount: Number(amount),
      timestamp: timestamp,
      updatedAt: timestamp,
      dateString: todayString,
      displayTime: nowTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    };
    
    try {
      setRecords(prevRecords => {
        const newRecords = sortRecordsByTime([...prevRecords, newRecord]);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecords));
        } catch(e){}
        return newRecords;
      });
      
      setAmount('');
      if (selectedDate !== todayString) {
        setSelectedDate(todayString);
      }
      showSuccess();
      
      const response = await safeFetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      });
      
      if (response && response.ok) {
        setTimeout(() => fetchRecords(), 5000);
      }
    } catch (error) {
      console.error('添加记录异常:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (record) => {
    if (deletingId) setDeletingId(null);
    setEditingRecord(record.id);
    setEditAmount((record.amount || '').toString());
    setEditTime(record.displayTime || '');
  };

  const cancelEdit = () => {
    setEditingRecord(null);
    setEditAmount('');
    setEditTime('');
  };

  const saveEdit = async (record) => {
    if (!editAmount || !editTime) return;
    
    const timestamp = Date.now();
    
    const updatedRecord = {
      ...record,
      amount: Number(editAmount),
      displayTime: editTime,
      updatedAt: timestamp
    };
    
    setRecords(prev => {
      const updated = prev.map(r => r.id === record.id ? updatedRecord : r);
      const sorted = sortRecordsByTime(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
      } catch(e){}
      return sorted;
    });
    
    cancelEdit();
    showSuccess();
    
    try {
      const deleteResponse = await safeFetch(`/api/records?id=${record.id}`, { 
        method: 'DELETE' 
      });
      
      const createResponse = await safeFetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      });
      
      if (createResponse && createResponse.ok) {
        setTimeout(() => fetchRecords(), 5000);
      }
    } catch (error) {
      console.error('编辑同步失败:', error);
      alert('已保存到本地（网络同步失败）');
    }
  };

  const requestDelete = (id) => {
    if (editingRecord) setEditingRecord(null);
    setDeletingId(id);
  };

  const cancelDelete = () => {
    setDeletingId(null);
  };

  const confirmDelete = async (id) => {
    setDeletingId(null);
    
    setRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch(e){}
      return updated;
    });
    
    try {
      const response = await safeFetch(`/api/records?id=${id}`, {
        method: 'DELETE'
      });
      
      if (response && response.ok) {
        setTimeout(() => fetchRecords(), 5000);
      }
    } catch (error) {
      console.error('删除同步失败:', error);
      alert('已在本地删除（网络同步失败）');
    }
  };

  // 修复 Safari 日期切换问题：手动计算日期
  const changeDate = (offset) => {
    try {
      // 解析当前选中日期的年、月、日
      const [currYear, currMonth, currDay] = selectedDate.split('-').map(Number);
      
      // 创建本地日期对象（注意月份要减1）
      const date = new Date(currYear, currMonth - 1, currDay);
      
      // 增加/减少天数
      date.setDate(date.getDate() + offset);
      
      // 格式化回 YYYY-MM-DD
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      
      setSelectedDate(`${y}-${m}-${d}`);
    } catch(e) {
      console.error('切换日期出错', e);
    }
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-rose-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="bg-rose-100 p-4 rounded-full text-rose-500 inline-block mb-4">
              <Baby size={48} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">沐沐喝奶记</h1>
            <p className="text-gray-500 mt-2">请输入密码访问</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && password) {
                    handlePasswordSubmit(e);
                  }
                }}
                className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-rose-400 outline-none transition"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
            </div>
            
            <button
              onClick={handlePasswordSubmit}
              disabled={!password}
              className="w-full bg-rose-500 text-white rounded-xl py-3 font-semibold hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 加载状态只有在没有记录时才显示
  if (loading && records.length === 0) {
    return (
      <div className="min-h-screen bg-rose-50 flex items-center justify-center">
        <div className="text-rose-400 animate-pulse flex flex-col items-center">
          <Baby size={48} />
          <p className="mt-4 font-medium">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rose-50 font-sans text-gray-800 pb-20 relative">
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
          <div className="bg-green-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
            <div className="bg-white rounded-full p-1">
              <Check size={16} className="text-green-500" />
            </div>
            <span className="font-medium">记录成功！</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-rose-100 p-2 rounded-full text-rose-500">
              <Baby size={24} />
            </div>
            <h1 className="text-xl font-bold text-gray-800">沐沐喝奶记</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowTrendChart(true)}
              className="p-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-purple-50 hover:text-purple-500 transition active:scale-95 flex items-center gap-1 text-sm font-medium"
            >
              <TrendingUp size={20} />
              <span className="hidden sm:inline">趋势</span>
            </button>
            <button 
              onClick={() => setShowStats(true)}
              className="p-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition active:scale-95 flex items-center gap-1 text-sm font-medium"
            >
              <BarChart3 size={20} />
              <span className="hidden sm:inline">统计</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* Date Navigator */}
        <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm">
          <button 
            onClick={() => changeDate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 active:scale-95 transition"
          >
            ←
          </button>
          
          <div className="flex items-center gap-2 font-semibold text-lg text-gray-700">
            <Calendar size={18} className="text-rose-400" />
            {selectedDate}
            {isToday && <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">今天</span>}
          </div>

          <button 
            onClick={() => changeDate(1)}
            disabled={isToday}
            className={`p-2 rounded-full transition ${isToday ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100 active:scale-95'}`}
          >
            →
          </button>
        </div>

        {/* Daily Summary Card */}
        <div className="bg-gradient-to-br from-rose-400 to-rose-500 rounded-3xl p-6 text-white shadow-lg shadow-rose-200">
          <div className="flex flex-col gap-4">
            {/* 距离上次喂奶时间 - 放在最显眼的位置 */}
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-50 font-medium text-sm">
                <Timer size={16} />
                <span>距离上次喂奶</span>
              </div>
              <div className="font-bold text-lg">
                {timeSinceLastFeed || '暂无数据'}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-rose-100 font-medium text-sm flex items-center gap-2">
                  <Droplets size={16} />
                  {isToday ? '今日总量' : '当日总量'}
                </h2>
              </div>
              <div className="text-5xl font-bold tracking-tight mb-1">
                {totalAmount}<span className="text-2xl font-normal opacity-80 ml-1">ml</span>
              </div>
              <div className="text-rose-100 text-sm">
                共喂奶 {filteredRecords.length} 次
              </div>
            </div>
          </div>
        </div>

        {/* Add Record Form */}
        {isToday ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-100">
            <label className="block text-sm font-medium text-gray-600 mb-2 ml-1">
              新增记录
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="输入奶量"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && amount && !isSubmitting) {
                      handleAddRecord(e);
                    }
                  }}
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-rose-400 outline-none transition appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">ml</span>
              </div>
              <button 
                onClick={handleAddRecord}
                disabled={!amount || isSubmitting}
                className="bg-gray-900 text-white rounded-xl px-6 py-3 font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition flex items-center gap-2"
              >
                <Plus size={20} />
                记录
              </button>
            </div>
            
            {/* Quick add suggestions */}
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 hide-scrollbar">
              {[120, 150, 180, 190, 200, 210].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="px-3 py-1.5 bg-rose-50 text-rose-600 text-sm font-medium rounded-lg hover:bg-rose-100 transition whitespace-nowrap"
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm">
            只能记录当天的喂奶数据哦
          </div>
        )}

        {/* Records List */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 ml-1 flex items-center gap-2">
            <History size={18} className="text-gray-400" />
            当日记录
          </h3>
          
          {filteredRecords.length === 0 ? (
            <div className="text-center py-10 opacity-40">
              <Baby size={48} className="mx-auto mb-2 text-gray-400" />
              <p>还没有记录哦</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <div key={record.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group transition-all duration-200">
                  {editingRecord === record.id ? (
                    // 编辑模式
                    <div className="flex-1 flex items-center gap-3 flex-wrap">
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-24 bg-gray-50 border-0 rounded-lg px-3 py-2 text-lg font-bold focus:ring-2 focus:ring-rose-400 outline-none"
                      />
                      <span className="text-sm text-gray-500">ml</span>
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="bg-gray-50 border-0 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 outline-none"
                      />
                      <button
                        onClick={() => saveEdit(record)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition"
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition"
                      >
                        取消
                      </button>
                    </div>
                  ) : deletingId === record.id ? (
                    // 删除确认模式
                    <div className="flex-1 flex items-center justify-between animate-in fade-in slide-in-from-right-5 duration-200">
                      <div className="flex items-center gap-2 text-red-500 font-medium">
                        <AlertCircle size={20} />
                        <span>确认删除这条记录?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => confirmDelete(record.id)}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 shadow-sm transition active:scale-95"
                        >
                          删除
                        </button>
                        <button
                          onClick={cancelDelete}
                          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition active:scale-95"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 正常显示模式
                    <>
                      <div className="flex items-center gap-4">
                        <div className="bg-blue-50 text-blue-500 p-2.5 rounded-xl">
                          <Clock size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-gray-800 text-lg">
                            {record.amount} <span className="text-sm font-normal text-gray-500">ml</span>
                          </div>
                          <div className="text-xs text-gray-400 font-medium">
                            {record.displayTime}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => startEdit(record)}
                          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition active:scale-95"
                          aria-label="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => requestDelete(record.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition active:scale-95"
                          aria-label="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Trend Chart Modal */}
      {showTrendChart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl h-auto max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="text-purple-500" size={20} />
                15天趋势图
              </h2>
              <button 
                onClick={() => setShowTrendChart(false)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="text-xs text-blue-600 font-medium mb-1">平均每日</div>
                  <div className="text-2xl font-bold text-blue-700">{trendStats.avg}<span className="text-sm ml-1">ml</span></div>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <div className="text-xs text-green-600 font-medium mb-1">最高</div>
                  <div className="text-2xl font-bold text-green-700">{trendStats.max}<span className="text-sm ml-1">ml</span></div>
                </div>
                <div className="bg-orange-50 rounded-xl p-4">
                  <div className="text-xs text-orange-600 font-medium mb-1">最低</div>
                  <div className="text-2xl font-bold text-orange-700">{trendStats.min}<span className="text-sm ml-1">ml</span></div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="relative h-72">
                  <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-xs text-gray-500 text-right pr-1">
                    <span>1500</span>
                    <span>1200</span>
                    <span>900</span>
                    <span>600</span>
                    <span>300</span>
                    <span>0</span>
                  </div>
                  
                  <div className="ml-11 h-full relative pb-8">
                    <div className="absolute inset-0 bottom-8 flex flex-col justify-between">
                      {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="border-t border-gray-200"></div>
                      ))}
                    </div>
                    
                    <svg className="absolute w-full h-full bottom-8" style={{ left: '10px', right: '10px', overflow: 'visible' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path
                        d={trendData.map((d, i) => {
                          const x = (i / (trendData.length - 1)) * 100;
                          const y = 100 - Math.min((d.total / 1500) * 100, 100);
                          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="rgb(244, 114, 182)"
                        strokeWidth="0.8"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    
                    <div className="absolute w-full h-full bottom-8" style={{ left: '10px', right: '10px' }}>
                      {trendData.map((d, i) => {
                        const xPercent = (i / (trendData.length - 1)) * 100;
                        const yPercent = 100 - Math.min((d.total / 1500) * 100, 100);
                        const isTodayDate = d.date === new Date().toISOString().split('T')[0];
                        
                        return (
                          <div
                            key={i}
                            className="absolute"
                            style={{
                              left: `${xPercent}%`,
                              top: `${yPercent}%`,
                              transform: 'translate(-50%, -50%)'
                            }}
                          >
                            {isTodayDate && (
                              <div className="absolute inset-0 w-5 h-5 rounded-full border-2 border-rose-400 -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%' }}></div>
                            )}
                            <div className="w-3 h-3 rounded-full bg-white border-2 border-rose-400"></div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500">
                      <span>{trendData[0]?.shortDate}</span>
                      <span>{trendData[Math.floor(trendData.length / 2)]?.shortDate}</span>
                      <span>{trendData[trendData.length - 1]?.shortDate}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 text-sm text-gray-500 text-center">
                显示最近15天的每日总摄入量趋势
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Overlay Modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl h-auto max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 className="text-rose-500" size={20} />
                历史统计
              </h2>
              <button 
                onClick={() => setShowStats(false)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {dailyStats.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  暂无历史数据
                </div>
              ) : (
                dailyStats.map((stat, index) => (
                  <div 
                    key={stat.date} 
                    className={`flex items-center justify-between p-4 rounded-xl border ${index === 0 ? 'bg-rose-50 border-rose-100' : 'bg-white border-gray-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-10 rounded-full ${index === 0 ? 'bg-rose-400' : 'bg-gray-200'}`}></div>
                      <div>
                        <div className={`font-semibold ${index === 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                          {stat.date}
                        </div>
                        <div className="text-xs text-gray-400">
                          {stat.date === new Date().toISOString().split('T')[0] ? '今天' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xl text-gray-800">
                        {stat.total} <span className="text-sm font-normal text-gray-400">ml</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 shrink-0 text-center text-xs text-gray-400">
              仅统计有记录的日期
            </div>
          </div>
        </div>
      )}
    </div>
  );
}