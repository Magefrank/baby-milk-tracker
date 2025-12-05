// Cloudflare Pages Functions API
// 路径: functions/api/records.js

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  
  try {
    // === 场景 1: 获取维生素 D3 状态 ===
    if (type === 'd3') {
      const date = url.searchParams.get('date');
      if (!date) return new Response(JSON.stringify({ error: 'Missing date' }), { status: 400 });
      
      const value = await env.MILK_RECORDS.get(`d3_${date}`);
      // 如果没记录，默认返回 [false, false]
      return new Response(JSON.stringify({ status: value ? JSON.parse(value) : [false, false] }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // === 场景 2: 获取喝奶记录 (默认) ===
    const list = await env.MILK_RECORDS.list();
    const records = [];
    
    for (const key of list.keys) {
      // 关键：过滤掉 D3 的记录，防止混入喝奶列表
      if (key.name.startsWith('d3_')) continue;

      const value = await env.MILK_RECORDS.get(key.name);
      if (value) {
        records.push({
          id: key.name,
          ...JSON.parse(value)
        });
      }
    }
    
    // 排序逻辑 (保持之前的日期+时间双重排序)
    records.sort((a, b) => {
      // 1. 先按日期排序
      if (a.dateString !== b.dateString) {
        return b.dateString.localeCompare(a.dateString);
      }
      
      // 2. 按显示时间排序(降序)
      const timeA = a.displayTime.split(':').map(Number);
      const timeB = b.displayTime.split(':').map(Number);
      const minutesA = timeA[0] * 60 + timeA[1];
      const minutesB = timeB[0] * 60 + timeB[1];
      
      if (minutesA !== minutesB) {
        return minutesB - minutesA;
      }

      // 3. 时间戳兜底
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
    
    // === 场景 1: 保存 D3 状态 ===
    if (data.type === 'd3') {
      const key = `d3_${data.dateString}`;
      // 直接存 boolean 数组，比如 [true, false]
      await env.MILK_RECORDS.put(key, JSON.stringify(data.status));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // === 场景 2: 保存喝奶记录 (默认) ===
    const id = data.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
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
  // 删除逻辑不变，只处理 ID 删除
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}