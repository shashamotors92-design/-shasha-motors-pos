/* Shasha Motors POS - Supabase Automatic Product Sync
   Version: 20260924-1
   Load this AFTER app.js
*/
(function(){
  'use strict';

  let busy = false;
  let timer = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function showStatus(message, type){
    try{
      if(typeof status === 'function') status(message, type || 'ok');
    }catch(_e){}
  }

  function errorText(e){
    try{
      if(typeof errText === 'function') return errText(e);
    }catch(_e){}
    return e && e.message ? e.message : String(e || 'Unknown error');
  }

  async function refreshProducts(){
    if(busy) return false;
    busy = true;

    try{
      for(let attempt = 1; attempt <= 3; attempt++){
        try{
          if(typeof sbClient === 'undefined' || !sbClient){
            if(attempt < 3){
              await sleep(800 * attempt);
              continue;
            }
            return false;
          }

          if(typeof products === 'undefined' || !Array.isArray(products)){
            if(attempt < 3){
              await sleep(500);
              continue;
            }
            throw new Error('POS product list is not ready');
          }

          const r = await sbClient
            .from('products')
            .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
            .order('id');

          if(r.error) throw r.error;

          const local = new Map(
            products
              .filter(p => p && p.barcode != null && String(p.barcode) !== '')
              .map(p => [String(p.barcode), p])
          );

          const merged = [];
          const cloud = new Set();

          for(const x of (r.data || [])){
            const b = String(x.barcode ?? '').trim();
            if(!b) continue;

            cloud.add(b);
            const old = local.get(b) || {};

            merged.push({
              ...old,
              id: x.id,
              barcode: b,
              partNo: x.part_no || '',
              name: x.name || '',
              cost: Number(x.buy ?? 0),
              sell: Number(x.sell ?? 0),
              stock: Number(x.stock ?? 0),
              min: Number(x.min_stock ?? 0)
            });
          }

          // Keep local-only products that are not yet in Supabase.
          for(const p of products){
            if(!p) continue;
            const b = String(p.barcode ?? '').trim();
            if(b && !cloud.has(b)) merged.push(p);
          }

          products = merged;

          try{ if(typeof save === 'function') save(); }catch(_e){}
          try{ if(typeof renderProducts === 'function') renderProducts(); }catch(_e){}
          try{ if(typeof renderStock === 'function') renderStock(); }catch(_e){}
          try{ if(typeof dashboard === 'function') dashboard(); }catch(_e){}

          showStatus('☁️ Products synced from Supabase ✓', 'ok');
          return true;
        }catch(e){
          if(attempt >= 3){
            showStatus('⚠️ Product sync failed: ' + errorText(e), 'bad');
            return false;
          }
          await sleep(1000 * attempt);
        }
      }
    }finally{
      busy = false;
    }

    return false;
  }

  async function boot(){
    // Give app.js time to create sbClient and test the connection.
    await sleep(1800);
    await refreshProducts();
  }

  window.addEventListener('load', boot);

  // Retry after the device comes back online.
  window.addEventListener('online', function(){
    setTimeout(refreshProducts, 1200);
  });

  // Keep products reasonably fresh without requiring the user to press Refresh.
  timer = window.setInterval(function(){
    refreshProducts();
  }, 60000);

  // Manual function for the console or any future button.
  window.refreshCloudProducts = refreshProducts;
})();
