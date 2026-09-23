/* Shasha Motors POS — Marklife X2 final print bridge
   BILL: 57mm-style PNG -> iPhone Share Sheet -> Marklife -> X2
   BARCODE: 40x30mm-style PNG -> iPhone Share Sheet -> Marklife -> X2
   This does NOT attempt unsupported direct Bluetooth printing from Safari.
*/
(function(){
  const PK="shasha_final_products_v1";
  const money=n=>Number(n||0).toLocaleString("en-LK",{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

  async function shareBlob(blob, filename, title){
    const file=new File([blob],filename,{type:"image/png"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title});return true}catch(e){return false}
    }
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    alert("Image saved. Open it and use Share → Marklife → select X2.");
    return true;
  }

  function drawBarcode(ctx,code,x,y,w,h){
    /* compact Code-128B renderer */
    const P=[
"212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
"221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
"221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
"212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
"231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
"231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
"314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
"112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
"111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
"214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
"114131","311141","411131","211412","211214","211232","2331112"];
    code=String(code||""); let vals=[104], sum=104;
    for(let i=0;i<code.length;i++){let c=code.charCodeAt(i);if(c<32||c>126)return false;vals.push(c-32);sum+=(c-32)*i}
    vals.push(sum%103,106);
    let total=0; vals.forEach(v=>{for(const n of P[v])total+=+n});
    const scale=Math.max(1,Math.floor(w/(total+20)));
    let px=x+10*scale, black=true; ctx.fillStyle="#000";
    vals.forEach(v=>{for(const n of P[v]){const ww=+n*scale;if(black)ctx.fillRect(px,y,ww,h);px+=ww;black=!black}});
    return true;
  }

  function getProducts(){try{return JSON.parse(localStorage.getItem(PK)||"[]")}catch(e){return[]}}

  async function makeBarcode(p){
    const W=800,H=600,c=document.createElement("canvas");c.width=W;c.height=H;
    const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,W,H);x.fillStyle="#000";x.textAlign="center";
    x.font="bold 34px Arial";let name=String(p.name||"SHASHA MOTORS");if(name.length>32)name=name.slice(0,31)+"…";x.fillText(name,W/2,52);
    const code=String(p.barcode||p.partNo||"NO-BARCODE");
    drawBarcode(x,code,45,90,710,240);
    x.font="22px Arial";x.fillText(code,W/2,365);
    const price=p.sell??p.selling_price??p.sellingPrice;
    if(price!==undefined&&price!==""){x.font="bold 30px Arial";x.fillText("Rs. "+money(price),W/2,420)}
    x.font="20px Arial";x.fillText("SHASHA MOTORS",W/2,455);
    return new Promise(r=>c.toBlob(r,"image/png"));
  }

  function receiptCanvas(s){
    const W=576,H=Math.max(500,260+(s.items?.length||0)*48);
    const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
    x.fillStyle="#fff";x.fillRect(0,0,W,H);x.fillStyle="#000";x.textAlign="left";
    let y=34;
    x.font="bold 26px Arial";x.textAlign="center";x.fillText("SHASHA MOTORS",W/2,y);y+=30;
    x.font="16px Arial";x.fillText("7/1A, Thambilwaththa, Makandana, Piliyandala",W/2,y);y+=22;
    x.fillText("0771112344",W/2,y);y+=25;
    x.textAlign="left";x.font="15px monospace";
    x.fillText("Invoice: "+s.invoice,15,y);y+=21;x.fillText(new Date(s.date).toLocaleString(),15,y);y+=25;
    x.fillRect(15,y,W-30,1);y+=22;
    (s.items||[]).forEach(i=>{
      let nm=String(i.name||"");if(nm.length>28)nm=nm.slice(0,27)+"…";
      x.font="bold 15px Arial";x.fillText(nm,15,y);y+=19;
      x.font="14px monospace";x.fillText(String(i.qty)+" x Rs. "+money(i.sell),15,y);
      x.textAlign="right";x.fillText("Rs. "+money(i.total),W-15,y);x.textAlign="left";y+=24;
    });
    x.fillRect(15,y,W-30,1);y+=22;
    x.font="15px monospace";
    const row=(a,b)=>{x.textAlign="left";x.fillText(a,15,y);x.textAlign="right";x.fillText(b,W-15,y);x.textAlign="left";y+=21};
    row("Subtotal","Rs. "+money(s.subtotal));row("Discount","Rs. "+money(s.discount));
    x.font="bold 19px Arial";row("TOTAL","Rs. "+money(s.total));
    x.font="15px monospace";row("Payment",String(s.payment));
    if(s.payment==="CASH"){row("Cash","Rs. "+money(s.cash));row("Change","Rs. "+money(s.change))}
    y+=15;x.textAlign="center";x.font="16px Arial";x.fillText("Thank you!",W/2,y);
    return c.toBlob(r=>"x");
  }

  async function shareBill(){
    if(!window.last){alert("Complete a sale first.");return}
    const s=window.last, W=576,H=Math.max(500,260+(s.items?.length||0)*48);
    const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
    x.fillStyle="#fff";x.fillRect(0,0,W,H);x.fillStyle="#000";x.textAlign="center";let y=34;
    x.font="bold 26px Arial";x.fillText("SHASHA MOTORS",W/2,y);y+=30;x.font="16px Arial";x.fillText("7/1A, Thambilwaththa, Makandana, Piliyandala",W/2,y);y+=22;x.fillText("0771112344",W/2,y);y+=25;
    x.textAlign="left";x.font="15px monospace";x.fillText("Invoice: "+s.invoice,15,y);y+=21;x.fillText(new Date(s.date).toLocaleString(),15,y);y+=25;x.fillRect(15,y,W-30,1);y+=22;
    (s.items||[]).forEach(i=>{let nm=String(i.name||"");if(nm.length>28)nm=nm.slice(0,27)+"…";x.font="bold 15px Arial";x.fillText(nm,15,y);y+=19;x.font="14px monospace";x.fillText(String(i.qty)+" x Rs. "+money(i.sell),15,y);x.textAlign="right";x.fillText("Rs. "+money(i.total),W-15,y);x.textAlign="left";y+=24});
    x.fillRect(15,y,W-30,1);y+=22;x.font="15px monospace";
    const row=(a,b)=>{x.textAlign="left";x.fillText(a,15,y);x.textAlign="right";x.fillText(b,W-15,y);x.textAlign="left";y+=21};
    row("Subtotal","Rs. "+money(s.subtotal));row("Discount","Rs. "+money(s.discount));x.font="bold 19px Arial";row("TOTAL","Rs. "+money(s.total));x.font="15px monospace";row("Payment",String(s.payment));if(s.payment==="CASH"){row("Cash","Rs. "+money(s.cash));row("Change","Rs. "+money(s.change))}y+=15;x.textAlign="center";x.font="16px Arial";x.fillText("Thank you!",W/2,y);
    c.toBlob(b=>shareBlob(b,s.invoice+".png","Shasha Motors Bill"),"image/png");
  }

  function openBarcode(){
    const ps=getProducts(),m=document.createElement("div");
    m.innerHTML=`<div style="position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px"><div style="background:#fff;border-radius:16px;padding:16px;width:100%;max-width:650px;max-height:92vh;overflow:auto;font-family:Arial"><div style="display:flex;justify-content:space-between"><h2>🏷️ Barcode → Marklife X2</h2><button id="mlc">Close</button></div><p>40×30mm label • select product → Share → Marklife → X2</p><input id="mlq" placeholder="Search product / barcode / part no" style="width:100%;padding:12px;border:1px solid #ccd5e2;border-radius:10px"><div id="mll"></div></div></div>`;
    document.body.appendChild(m);const l=m.querySelector("#mll");
    function render(){const q=m.querySelector("#mlq").value.toLowerCase();const a=ps.filter(p=>[p.name,p.barcode,p.partNo].some(v=>String(v??"").toLowerCase().includes(q))).slice(0,100);l.innerHTML=a.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #eee"><div style="flex:1"><b>${esc(p.name||"Unnamed")}</b><br><small>${esc(p.barcode||p.partNo||"No barcode")} • Rs. ${money(p.sell)}</small></div><button data-i="${ps.indexOf(p)}" class="mlbs">📤 Share</button></div>`).join("")||"<p>No products found.</p>";l.querySelectorAll(".mlbs").forEach(b=>b.onclick=async()=>{const blob=await makeBarcode(ps[+b.dataset.i]);await shareBlob(blob,"barcode-"+(ps[+b.dataset.i].barcode||"label")+".png","Shasha Motors Barcode")})}
    m.querySelector("#mlc").onclick=()=>m.remove();m.querySelector("#mlq").oninput=render;render();
  }

  function addBillButton(){
    const actions=document.querySelector("#modal .actions");if(!actions||document.getElementById("marklifeBillBtn"))return;
    const b=document.createElement("button");b.id="marklifeBillBtn";b.className="blue";b.textContent="📤 Print Bill via Marklife";b.onclick=shareBill;actions.insertBefore(b,actions.firstChild);
  }
  function addBarcodeCard(){
    if(document.getElementById("marklifeBarcodeCard")||!document.getElementById("more"))return;
    const c=document.createElement("div");c.id="marklifeBarcodeCard";c.className="card";c.innerHTML='<h3>Marklife X2</h3><p class="muted">Barcode label 40×30mm → Share → Marklife → X2.</p><button class="blue" style="width:100%">🏷️ Print Barcode via Marklife</button>';c.querySelector("button").onclick=openBarcode;document.getElementById("more").appendChild(c);
  }
  new MutationObserver(addBillButton).observe(document.body,{childList:true,subtree:true});
  window.addEventListener("load",()=>setTimeout(addBarcodeCard,500));
})();