import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Plus, Calendar, Baby, Droplets, Clock, History, BarChart3, X, Check } from 'lucide-react';

export default function BabyMilkTracker() {
  const [amount, setAmount] = useState('');
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // 获取数据
  const fetchRecords = async () => {
    try {
      const response = await fetch('/api/records');
      if (response.ok) {
        const data = await response.json();
        setRecords(data);
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
    // 每30秒自动刷新一次
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, []);

  // 过滤和排序记录
  const filteredRecords = useMemo(() => {
    return records
      .filter(record => record.dateString === selectedDate)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [records, selectedDate]);

  // 计算总量
  const totalAmount = useMemo(() => {
    return filteredRecords.reduce((sum, record) => sum + Number(record.amount), 0);
  }, [filteredRecords]);

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

  // 显示成功提示
  const showSuccess = () => {
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
    }, 2000);
  };

  // 添加记录（乐观更新版本）
  const handleAddRecord = async (e) => {
    e.preventDefault();
    if (!amount) return;
    
    setIsSubmitting(true);
    const now = new Date();
    const todayString = new Date().toISOString().split('T')[0];
    
    const newRecord = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // 临时 ID
      amount: Number(amount),
      timestamp: Date.now(),
      dateString: todayString,
      displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    try {
      // 1. 乐观更新：立即添加到本地列表
      setRecords(prevRecords => [...prevRecords, newRecord]);
      setAmount('');
      if (selectedDate !== todayString) {
        setSelectedDate(todayString);
      }
      
      // 显示成功提示
      showSuccess();
      
      // 2. 发送到服务器
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
        // 3. 3秒后刷新，确保从 KV 获取最新数据（包含真实 ID）
        setTimeout(() => {
          fetchRecords();
        }, 3000);
      } else {
        // 如果保存失败，移除刚才添加的记录
        setRecords(prevRecords => prevRecords.filter(r => r.id !== newRecord.id));
        alert('添加失败，请重试');
      }
    } catch (error) {
      console.error('添加记录失败:', error);
      // 如果出错，移除刚才添加的记录
      setRecords(prevRecords => prevRecords.filter(r => r.id !== newRecord.id));
      alert('添加失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除记录
  const handleDelete = async (id) => {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    // 保存原始记录，以便失败时恢复
    const originalRecords = [...records];
    
    // 乐观更新：立即从列表中移除
    setRecords(prevRecords => prevRecords.filter(r => r.id !== id));
    
    try {
      const response = await fetch(`/api/records?id=${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // 2秒后刷新，确保同步
        setTimeout(() => {
          fetchRecords();
        }, 2000);
      } else {
        // 如果删除失败，恢复记录
        setRecords(originalRecords);
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('删除失败:', error);
      // 如果出错，恢复记录
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
          <button 
            onClick={() => setShowStats(true)}
            className="p-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition active:scale-95 flex items-center gap-1 text-sm font-medium"
          >
            <BarChart3 size={20} />
            <span className="hidden sm:inline">统计</span>
          </button>
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
                  
                  <button 
                    onClick={() => handleDelete(record.id)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    aria-label="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Stats Overlay Modal */}
      {showStats && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl h-auto max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
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

            {/* Modal Body - Scrollable */}
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
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 shrink-0 text-center text-xs text-gray-400">
              仅统计有记录的日期
            </div>
          </div>
        </div>
      )}
    </div>
  );
}