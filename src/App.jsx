import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Plus, Calendar, Baby, Droplets, Clock, History, BarChart3, X, Check, Edit2, AlertCircle, TrendingUp } from 'lucide-react';

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('PWA registered'))
      .catch(error => console.log('PWA registration failed'));
  });
}

export default function BabyMilkTracker() {
  const [amount, setAmount] = useState('');
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTrendChart, setShowTrendChart] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // 密码保护
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // 正确的密码
  const CORRECT_PASSWORD = 'mumu';
  
  // 编辑状态
  const [editingRecord, setEditingRecord] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editTime, setEditTime] = useState('');
  
  // 检查是否已验证
  useEffect(() => {
    const authToken = localStorage.getItem('baby_tracker_auth');
    if (authToken === 'authenticated') {
      setIsAuthenticated(true);
    }
  }, []);
  
  // 验证密码
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      localStorage.setItem('baby_tracker_auth', 'authenticated');
      setIsAuthenticated(true);
      setPasswordError('');
    } else {
      setPasswordError('密码错误，请重试');
      setPassword('');
    }
  };
  
  // 获取数据（智能合并版本）
  const fetchRecords = async (shouldMerge = false) => {
    try {
      // 添加时间戳参数防止缓存
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/records?_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (shouldMerge) {
          setRecords(prevRecords => {
            const tempRecords = prevRecords.filter(r => r.id.startsWith('temp_'));
            const serverRecords = data.filter(r => !r.id.startsWith('temp_'));
            return [...tempRecords, ...serverRecords];
          });
        } else {
          setRecords(data);
        }
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载数据
  useEffect(() => {
    fetchRecords();
    const interval = setInterval(() => fetchRecords(false), 30000);
    return () => clearInterval(interval);
  }, []);

  // 过滤和排序记录（按显示时间排序）
  const filteredRecords = useMemo(() => {
    return records
      .filter(record => record.dateString === selectedDate)
      .sort((a, b) => {
        // 将 HH:MM 格式转换为可比较的数字
        const timeA = a.displayTime.split(':').map(Number);
        const timeB = b.displayTime.split(':').map(Number);
        const minutesA = timeA[0] * 60 + timeA[1];
        const minutesB = timeB[0] * 60 + timeB[1];
        return minutesB - minutesA; // 倒序：最新的在最上面
      });
  }, [records, selectedDate]);

  // 计算总量
  const totalAmount = useMemo(() => {
    return filteredRecords.reduce((sum, record) => sum + Number(record.amount), 0);
  }, [filteredRecords]);

  // 计算距离上次喂奶的时间（按显示时间计算）
  const timeSinceLastFeed = useMemo(() => {
    const todayRecords = records
      .filter(r => r.dateString === new Date().toISOString().split('T')[0])
      .sort((a, b) => {
        // 按显示时间排序
        const timeA = a.displayTime.split(':').map(Number);
        const timeB = b.displayTime.split(':').map(Number);
        const minutesA = timeA[0] * 60 + timeA[1];
        const minutesB = timeB[0] * 60 + timeB[1];
        return minutesB - minutesA;
      });
    
    if (todayRecords.length === 0) return null;
    
    const lastFeed = todayRecords[0];
    const now = new Date();
    
    // 将显示时间转换为今天的完整时间
    const [hours, minutes] = lastFeed.displayTime.split(':').map(Number);
    const lastFeedTime = new Date();
    lastFeedTime.setHours(hours, minutes, 0, 0);
    
    const diff = now - lastFeedTime;
    
    // 如果差值为负数（可能是编辑了未来的时间），返回0
    if (diff < 0) return null;
    
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours: diffHours, minutes: diffMinutes, isLongGap: diffHours >= 3 };
  }, [records]);

  // 每日统计
  const dailyStats = useMemo(() => {
    const stats = {};
    records.forEach(record => {
      const date = record.dateString;
      stats[date] = (stats[date] || 0) + Number(record.amount);
    });
    
    return Object.entries(stats)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  // 趋势数据（过去15天）
  const trendData = useMemo(() => {
    const last15Days = [];
    const today = new Date();
    
    for (let i = 14; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      const dayTotal = records
        .filter(r => r.dateString === dateString)
        .reduce((sum, r) => sum + Number(r.amount), 0);
      
      last15Days.push({
        date: dateString,
        shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
        total: dayTotal
      });
    }
    
    return last15Days;
  }, [records]);

  // 计算趋势统计
  const trendStats = useMemo(() => {
    const totals = trendData.map(d => d.total).filter(t => t > 0);
    if (totals.length === 0) return { avg: 0, max: 0, min: 0 };
    
    return {
      avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      max: Math.max(...totals),
      min: Math.min(...totals)
    };
  }, [trendData]);

  // 显示成功提示
  const showSuccess = () => {
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
    }, 2000);
  };

  // 添加记录
  const handleAddRecord = async (e) => {
    e.preventDefault();
    if (!amount) return;
    
    setIsSubmitting(true);
    const now = new Date();
    const todayString = new Date().toISOString().split('T')[0];
    
    const newRecord = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: Number(amount),
      timestamp: Date.now(),
      dateString: todayString,
      displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    try {
      setRecords(prevRecords => [...prevRecords, newRecord]);
      setAmount('');
      if (selectedDate !== todayString) {
        setSelectedDate(todayString);
      }
      
      showSuccess();
      
      const response = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: newRecord.amount,
          timestamp: newRecord.timestamp,
          dateString: newRecord.dateString,
          displayTime: newRecord.displayTime
        })
      });
      
      if (response.ok) {
        setTimeout(() => {
          fetchRecords(true);
        }, 10000);
      } else {
        setRecords(prevRecords => prevRecords.filter(r => r.id !== newRecord.id));
        alert('添加失败，请重试');
      }
    } catch (error) {
      console.error('添加记录失败:', error);
      setRecords(prevRecords => prevRecords.filter(r => r.id !== newRecord.id));
      alert('添加失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 开始编辑
  const startEdit = (record) => {
    setEditingRecord(record.id);
    setEditAmount(record.amount.toString());
    setEditTime(record.displayTime);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingRecord(null);
    setEditAmount('');
    setEditTime('');
  };

  // 保存编辑
  const saveEdit = async (record) => {
    if (!editAmount) return;
    
    const originalRecords = [...records];
    
    // 创建更新后的记录数组
    const updatedRecords = records.map(r => {
      if (r.id === record.id) {
        return {
          ...r,
          amount: Number(editAmount),
          displayTime: editTime
        };
      }
      return r;
    });
    
    // 立即更新状态（触发重新渲染和排序）
    setRecords([...updatedRecords]);
    
    cancelEdit();
    showSuccess();
    
    try {
      // 删除旧记录并创建新记录
      await fetch(`/api/records?id=${record.id}`, { method: 'DELETE' });
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(editAmount),
          timestamp: record.timestamp,
          dateString: record.dateString,
          displayTime: editTime
        })
      });
      
      // 5秒后同步服务器数据
      setTimeout(() => {
        fetchRecords(false);
      }, 5000);
    } catch (error) {
      console.error('编辑失败:', error);
      setRecords(originalRecords);
      alert('编辑失败，请重试');
    }
  };

  // 删除记录
  const handleDelete = async (id) => {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    const originalRecords = [...records];
    setRecords(prevRecords => prevRecords.filter(r => r.id !== id));
    
    try {
      const response = await fetch(`/api/records?id=${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setTimeout(() => {
          fetchRecords(false);
        }, 5000);
      } else {
        setRecords(originalRecords);
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('删除失败:', error);
      setRecords(originalRecords);
      alert('删除失败，请重试');
    }
  };

  // 切换日期
  const changeDate = (offset) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // 如果未验证，显示密码输入页面
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
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-rose-400 outline-none transition"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
            </div>
            
            <button
              type="submit"
              disabled={!password}
              className="w-full bg-rose-500 text-white rounded-xl py-3 font-semibold hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              确认
            </button>
          </form>
          
          <div className="mt-6 text-center text-xs text-gray-400">
            首次在此设备访问需要验证密码
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
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
        
        {/* Time Since Last Feed Warning */}
        {isToday && timeSinceLastFeed && (
          <div className={`${timeSinceLastFeed.isLongGap ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'} border rounded-2xl p-4 flex items-center gap-3`}>
            <div className={`${timeSinceLastFeed.isLongGap ? 'text-orange-500' : 'text-blue-500'}`}>
              <AlertCircle size={24} />
            </div>
            <div>
              <div className="font-semibold text-gray-800">
                距离上次喂奶已过
              </div>
              <div className={`text-2xl font-bold ${timeSinceLastFeed.isLongGap ? 'text-orange-600' : 'text-blue-600'}`}>
                {timeSinceLastFeed.hours > 0 && `${timeSinceLastFeed.hours} 小时 `}
                {timeSinceLastFeed.minutes} 分钟
              </div>
            </div>
          </div>
        )}
        
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

        {/* Add Record Form */}
        {isToday ? (
          <form onSubmit={handleAddRecord} className="bg-white rounded-2xl p-4 shadow-sm border border-rose-100">
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
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-rose-400 outline-none transition appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">ml</span>
              </div>
              <button 
                type="submit" 
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
                  type="button"
                  onClick={() => setAmount(val.toString())}
                  className="px-3 py-1.5 bg-rose-50 text-rose-600 text-sm font-medium rounded-lg hover:bg-rose-100 transition whitespace-nowrap"
                >
                  {val}
                </button>
              ))}
            </div>
          </form>
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
                <div key={record.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group">
                  {editingRecord === record.id ? (
                    // 编辑模式
                    <div className="flex-1 flex items-center gap-3">
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
                  ) : (
                    // 显示模式
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
                          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition"
                          aria-label="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(record.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
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
            {/* Modal Header */}
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

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* 统计卡片 */}
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

              {/* 折线图 */}
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="relative h-72">
                  {/* Y轴标签 */}
                  <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-xs text-gray-500 text-right pr-1">
                    <span>1500</span>
                    <span>1200</span>
                    <span>900</span>
                    <span>600</span>
                    <span>300</span>
                    <span>0</span>
                  </div>
                  
                  {/* 图表区域 */}
                  <div className="ml-11 h-full relative pb-8">
                    {/* 网格线 */}
                    <div className="absolute inset-0 bottom-8 flex flex-col justify-between">
                      {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="border-t border-gray-200"></div>
                      ))}
                    </div>
                    
                    {/* 折线 */}
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
                    
                    {/* 数据点 */}
                    <div className="absolute w-full h-full bottom-8" style={{ left: '10px', right: '10px' }}>
                      {trendData.map((d, i) => {
                        const xPercent = (i / (trendData.length - 1)) * 100;
                        const yPercent = 100 - Math.min((d.total / 1500) * 100, 100);
                        const isToday = d.date === new Date().toISOString().split('T')[0];
                        
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
                            {/* 今天的外圈 */}
                            {isToday && (
                              <div className="absolute inset-0 w-5 h-5 rounded-full border-2 border-rose-400 -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%' }}></div>
                            )}
                            {/* 圆点 */}
                            <div className="w-3 h-3 rounded-full bg-white border-2 border-rose-400"></div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* X轴标签 */}
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500">
                      <span>{trendData[0]?.shortDate}</span>
                      <span>{trendData[Math.floor(trendData.length / 2)]?.shortDate}</span>
                      <span>{trendData[trendData.length - 1]?.shortDate}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 说明 */}
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