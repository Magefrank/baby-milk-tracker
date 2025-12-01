// Cloudflare Pages Functions API
// 路径: functions/api/records.js

export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    // 获取所有记录
    const list = await env.MILK_RECORDS.list();
    const records = [];
    
    for (const key of list.keys) {
      const value = await env.MILK_RECORDS.get(key.name);
      if (value) {
        records.push({
          id: key.name,
          ...JSON.parse(value)
        });
      }
    }
    
    // 按日期和时间排序（降序）
    records.sort((a, b) => {
      // 先按日期排序
      if (a.dateString !== b.dateString) {
        return b.dateString.localeCompare(a.dateString);
      }
      // 同一天，按显示时间排序
      const timeA = a.displayTime.split(':').map(Number);
      const timeB = b.displayTime.split(':').map(Number);
      const minutesA = timeA[0] * 60 + timeA[1];
      const minutesB = timeB[0] * 60 + timeB[1];
      return minutesB - minutesA;
    });
    
    return new Response(JSON.stringify(records), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const data = await request.json();
    
    // 生成唯一 ID
    const id = `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 存储到 KV
    await env.MILK_RECORDS.put(id, JSON.stringify(data));
    
    return new Response(JSON.stringify({ success: true, id }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await env.MILK_RECORDS.delete(id);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理 OPTIONS 请求 (CORS)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}