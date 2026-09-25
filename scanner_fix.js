/* Shasha Motors POS - Reliable Barcode Scanner
   Scans common retail barcodes and immediately adds the matching product to the bill.
*/
(function(){
  let active=null;
  let busy=false;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const errText=e=>e?.message||e?.details||e?.hint||e?.code||String(e);
  const normalize=v=>String(v??'').trim().replace(/\s+/g,'');

  function stopScanner(){
    const r=document.getElementById('reader');
    if(active){try{active.stop()}catch{} try{active.clear()}catch{} active=null}
    if(r){r.classList.add('hidden');r.innerHTML='';}
    busy=false;
  }

  async function findProduct(code){
    const b=normalize(code);
    let p=products.find(x=>normalize(x.barcode)===b || normalize(x.partNo)===b);
    if(p)return p;

    // If local data does not have it, ask Supabase directly.
    if(typeof sbClient!=='undefined' && sbClient){
      const r=await sbClient.from('products')
        .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
        .eq('barcode',b).maybeSingle();
      if(r.error)throw r.error;
      if(r.data){
        p={id:r.data.id,barcode:String(r.data.barcode),partNo:r.data.part_no||'',name:r.data.name,
          cost:Number(r.data.buy||0),sell:Number(r.data.sell||0),stock:Number(r.data.stock||0),min:Number(r.data.min_stock||0)};
        const old=products.find(x=>normalize(x.barcode)===normalize(p.barcode));
        if(old)Object.assign(old,p); else products.push(p);
        save();renderProducts();renderStock();dashboard();
        return p;
      }
    }
    return null;
  }

  async function onDetected(code){
    if(busy)return;
    busy=true;
    const value=normalize(code);
    try{
      stopScanner();
      const p=await findProduct(value);
      if(!p){
        document.getElementById('search').value=value;
        renderProducts();
        alert('Barcode not found in products: '+value+'\n\nCheck that the barcode is saved in Supabase/Product Management.');
        return;
      }
      if(Number(p.stock)<=0){
        alert('Out of stock: '+p.name);
        return;
      }
      if(!Number(p.sell)){
        alert('Selling price not set for '+p.name);
        return;
      }
      add(p.barcode);
      document.getElementById('search').value='';
      renderProducts();
    }catch(e){
      alert('Barcode lookup failed: '+errText(e));
    }finally{busy=false}
  }

  async function scanReliable(){
    if(!window.Html5Qrcode)return alert('Scanner library unavailable. Please refresh the POS page.');
    if(!window.isSecureContext && location.protocol!=='https:')return alert('Camera scanning needs a secure HTTPS page. Open the GitHub Pages POS link.');

    stopScanner();
    const reader=document.getElementById('reader');
    if(!reader)return;
    reader.classList.remove('hidden');
    reader.style.cssText='margin-top:10px;border:2px solid #17365d;border-radius:12px;overflow:hidden;background:#000;min-height:240px';
    reader.innerHTML='<div style="padding:8px;background:#17365d;color:#fff;text-align:center;font-weight:700">📷 Point the camera at the barcode</div><div id="scanMount"></div><button id="stopScanBtn" style="width:100%;background:#c62828;color:#fff;border-radius:0">✕ Stop Scanner</button>';
    document.getElementById('stopScanBtn').onclick=stopScanner;

    active=new Html5Qrcode('scanMount', {verbose:false});
    const formats=[];
    const F=window.Html5QrcodeSupportedFormats||{};
    ['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','CODE_93','CODABAR','ITF','QR_CODE'].forEach(k=>{if(F[k]!==undefined)formats.push(F[k])});
    const config={fps:12,qrbox:{width:300,height:120},aspectRatio:1.7777778,disableFlip:false};
    if(formats.length)config.formatsToSupport=formats;

    try{
      await active.start({facingMode:{exact:'environment'}},config,onDetected,()=>{});
    }catch(first){
      try{
        await active.start({facingMode:'environment'},config,onDetected,()=>{});
      }catch(second){
        stopScanner();
        const msg=errText(second||first);
        alert('Camera could not start.\n\n1. Allow Camera for Safari.\n2. Make sure no other app is using the camera.\n3. Reload the POS page and try again.\n\nError: '+msg);
      }
    }
  }

  // Replace the existing scan() with the reliable version.
  window.scan=scanReliable;
  window.stopBarcodeScanner=stopScanner;

  // If the page already has a Scan button, keep its existing UI but use the new scanner.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.scan=scanReliable);
})();
