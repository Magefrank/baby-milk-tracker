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
    // 逻辑必须与前端保持完全一致：日期 -> 显示时间(HH:mm) -> 时间戳
    records.sort((a, b) => {
      // 1. 先按日期排序
      if (a.dateString !== b.dateString) {
        return b.dateString.localeCompare(a.dateString);
      }
      
      // 2. 按显示时间排序(降序) - 几点喝的
      // 解析 "20:30" 这种格式
      const timeA = a.displayTime.split(':').map(Number);
      const timeB = b.displayTime.split(':').map(Number);
      const minutesA = timeA[0] * 60 + timeA[1];
      const minutesB = timeB[0] * 60 + timeB[1];
      
      if (minutesA !== minutesB) {
        return minutesB - minutesA;
      }

      // 3. 最后按创建时间戳兜底(降序)
      // 如果同一分钟有两条，后记的排前面
      if (a.timestamp && b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      
      return 0;
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
    
    // 如果前端传了 ID（用于保持乐观UI的一致性），就用前端的
    // 如果没传，则生成一个新的
    const id = data.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
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

// 处理 OPTIONS 请求 (CORS 预检)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}