/* Shasha Motors POS - Marklife X2 Barcode Printing
   Optimized for 40x30 mm thermal labels (also supports 50x30 / 57x30).
*/
(function(){
  const KEY='shasha_final_products_v1';
  const getProducts=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return[]}};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function openPrint(){
    const products=getProducts();
    const html=`<div id="bx" class="modal" style="position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:10px">
      <div style="background:#fff;width:100%;max-width:760px;max-height:94vh;overflow:auto;border-radius:16px;padding:15px;font-family:Arial,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">🏷️ Barcode Print</h2><button id="bxClose" style="background:#c62828;color:#fff">Close</button></div>
      <div style="display:grid;grid-template-columns:1fr 130px 120px;gap:8px;margin:12px 0"><input id="bxSearch" placeholder="Search product / barcode / part no"><select id="bxSize"><option value="40x30">40 × 30 mm</option><option value="50x30">50 × 30 mm</option><option value="57x30">57 × 30 mm</option></select><select id="bxCopies"><option>1</option><option>2</option><option>5</option><option>10</option><option>20</option><option>50</option></select></div>
      <div class="muted" style="margin-bottom:8px">Select products, set copies, then Preview / Print. Best default for X2: 40×30 mm.</div>
      <div id="bxList" style="border:1px solid #ddd;border-radius:10px;padding:8px;max-height:310px;overflow:auto"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button id="bxAll" style="background:#17365d;color:#fff">Select All</button><button id="bxPreview" style="background:#548235;color:#fff">Preview</button><button id="bxPrint" style="background:#17365d;color:#fff">🖨️ Print</button></div>
      <div id="bxPreviewBox" style="margin-top:12px"></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend',html);
    const modal=document.getElementById('bx'), list=document.getElementById('bxList');
    const render=()=>{
      const q=(document.getElementById('bxSearch').value||'').toLowerCase();
      const ps=products.filter(p=>[p.name,p.barcode,p.part_no,p.partNo].some(v=>String(v??'').toLowerCase().includes(q)));
      list.innerHTML=ps.length?ps.map(p=>`<label style="display:flex;gap:8px;align-items:center;padding:9px;border-bottom:1px solid #eee"><input type="checkbox" class="bxp" data-i="${products.indexOf(p)}"><span style="flex:1"><b>${esc(p.name||'Unnamed')}</b><br><small>${esc(p.barcode||'No barcode')} ${p.part_no||p.partNo?` • ${esc(p.part_no||p.partNo)}`:''} ${p.sell??p.selling_price??p.sellingPrice?` • Rs. ${Number(p.sell??p.selling_price??p.sellingPrice).toFixed(2)}`:''}</small></span></label>`).join(''):'<div class="muted">No products found</div>';
    };
    const selected=()=>[...document.querySelectorAll('.bxp:checked')].map(x=>products[+x.dataset.i]).filter(Boolean);
    const labels=()=>{const size=document.getElementById('bxSize').value.split('x').map(Number), copies=+document.getElementById('bxCopies').value; let out=[]; selected().forEach(p=>{for(let i=0;i<copies;i++)out.push(p)}); return {out,w:size[0],h:size[1]}};
    const make=()=>{const {out,w,h}=labels(); return `<style>@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}.bxprint{display:flex;flex-wrap:wrap;gap:0}.label{width:${w}mm;height:${h}mm;padding:1.5mm 1.2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;font-family:Arial,sans-serif;page-break-inside:avoid;break-inside:avoid}.label .name{font-size:${w<=40?'9':'10'}px;font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label .price{font-size:${w<=40?'9':'10'}px;font-weight:700;margin-top:1px}.label svg{max-width:100%;height:${w<=40?'11':'13'}mm}.label .code{font-size:7px;line-height:1}</style><div class="bxprint">${out.map(p=>`<div class="label"><div class="name">${esc(p.name||'SHASHA MOTORS')}</div><svg class="bc" data-code="${esc(p.barcode||p.part_no||p.partNo||'')}"></svg><div class="code">${esc(p.barcode||p.part_no||p.partNo||'')}</div><div class="price">${p.sell??p.selling_price??p.sellingPrice?`Rs. ${Number(p.sell??p.selling_price??p.sellingPrice).toFixed(2)}`:''}</div></div>`).join('')}</div>`};
    function renderPreview(){const box=document.getElementById('bxPreviewBox'); box.innerHTML=make(); if(window.JsBarcode)box.querySelectorAll('.bc').forEach(s=>{const c=s.dataset.code;if(c)try{JsBarcode(s,c,{format:'CODE128',displayValue:false,margin:0,height:38,width:1.5})}catch(e){}})}
    document.getElementById('bxSearch').oninput=render;
    document.getElementById('bxClose').onclick=()=>modal.remove();
    document.getElementById('bxAll').onclick=()=>{const boxes=[...document.querySelectorAll('.bxp')]; const all=boxes.length&&boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all)};
    document.getElementById('bxPreview').onclick=renderPreview;
    document.getElementById('bxPrint').onclick=()=>{
      const {out}=labels(); if(!out.length)return alert('Select at least one product.');
      const win=window.open('','_blank'); if(!win)return alert('Allow pop-ups for printing.');
      win.document.write(make().replace('</style>','</style><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>'));
      win.document.close();
      win.onload=()=>{win.document.querySelectorAll('.bc').forEach(s=>{const c=s.dataset.code;if(c)try{win.JsBarcode(s,c,{format:'CODE128',displayValue:false,margin:0,height:38,width:1.5})}catch(e){}});setTimeout(()=>{win.focus();win.print()},700)}
    };
    render();
  }
  function inject(){
    if(document.getElementById('barcodePrintBtn'))return;
    const more=document.getElementById('more'); if(!more)return;
    const card=document.createElement('div'); card.className='card';
    card.innerHTML='<h3>Barcode Labels</h3><p class="muted">Marklife X2 සඳහා 40×30mm / 50×30mm / 57×30mm labels.</p><button id="barcodePrintBtn" class="blue" style="width:100%">🏷️ Print Barcode Labels</button>';
    more.appendChild(card); document.getElementById('barcodePrintBtn').onclick=openPrint;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject); else inject();
  window.openBarcodePrint=openPrint;
})();