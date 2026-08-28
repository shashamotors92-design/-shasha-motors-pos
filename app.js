const SUPABASE_URL="https://mncufdwiclrlknhhkica.supabase.co";
const SUPABASE_KEY="sb_publishable_pK3jWDVlSe6moSxIBIHO2g_JNxnuA4O";

const PK="shasha_final_products_v1",SK="shasha_final_sales_v1",IK="shasha_final_invoice_v1",SYNC_KEY="shasha_final_pending_sync_v2";
let sbClient=null,products=[],sales=[],pending=[],cart=[],last=null,editing=null,scanner=null;

const money=n=>Number(n||0).toLocaleString("en-LK",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const q=s=>String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");
const read=(k,d)=>{try{const x=JSON.parse(localStorage.getItem(k)||"null");return x??d}catch{return d}};
const save=()=>{localStorage.setItem(PK,JSON.stringify(products));localStorage.setItem(SK,JSON.stringify(sales))};
const savePending=()=>localStorage.setItem(SYNC_KEY,JSON.stringify(pending));

function status(t,c="warn"){const e=document.getElementById("cloudStatus");if(e){e.textContent=t;e.className="statusbar "+c}}
function errText(e){return e?.message||e?.details||e?.hint||e?.code||String(e)}

async function init(){
  products=read(PK,[]); sales=read(SK,[]); pending=read(SYNC_KEY,[]);
  renderProducts();renderCart();renderStock();renderSales();dashboard();updateSync();
  try{sbClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
  catch(e){status("⚠️ Supabase library unavailable — local mode","bad");return}
  await testCloud();
}

async function testCloud(){
  status("☁️ Testing database connection…","warn");
  try{
    // Do not use head/count here. A normal SELECT gives a useful error message.
    const r=await sbClient.from("products").select("id").limit(1);
    if(r.error)throw r.error;
    status("☁️ Supabase database connected ✓","ok");
    await syncPendingSales();
  }catch(e){
    status("⚠️ Supabase error: "+errText(e),"bad");
  }
}

function tab(id,b){
  ["bill","stock","sales","more"].forEach(x=>document.getElementById(x)?.classList.toggle("hidden",x!==id));
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b?.classList.add("active");
  if(id==="stock")renderStock();if(id==="sales")renderSales();if(id==="more"){dashboard();updateSync()}
}
function nextInvoice(){let n=Number(localStorage.getItem(IK)||0)+1;localStorage.setItem(IK,n);return"INV-"+String(n).padStart(6,"0")}

function renderProducts(){
  const s=(document.getElementById("search")?.value||"").toLowerCase();
  const a=products.filter(p=>[p.name,p.barcode,p.partNo,p.category].join(" ").toLowerCase().includes(s));
  const r=document.getElementById("results");if(!r)return;
  r.innerHTML=a.map(p=>`<div class="product"><div class="product-name">${esc(p.name)}</div>
  <div class="muted">${esc(p.barcode)} • Stock: <b>${Number(p.stock||0)}</b> • Sell: <b>Rs. ${money(p.sell)}</b>
  ${!Number(p.sell)?'<span class="badge zero">PRICE NOT SET</span>':""}</div>
  <button class="blue" style="width:100%;margin-top:7px" onclick="add('${q(p.barcode)}')">Add</button></div>`).join("")||'<p class="muted">No products found.</p>';
}
function add(b){
  const p=products.find(x=>String(x.barcode)===String(b));if(!p||Number(p.stock)<=0)return alert("Out of stock");
  if(!Number(p.sell))return alert("Selling price not set for "+p.name);
  const c=cart.find(x=>String(x.b)===String(b));
  if(c){if(c.qty>=Number(p.stock))return alert("Not enough stock");c.qty++}else cart.push({b,qty:1});renderCart();
}
function del(b){cart=cart.filter(x=>String(x.b)!==String(b));renderCart()}
function setQty(b,v){
  const p=products.find(x=>String(x.barcode)===String(b)),c=cart.find(x=>String(x.b)===String(b));if(!p||!c)return;
  c.qty=Math.max(1,Math.min(Math.floor(Number(v)||1),Number(p.stock)||1));renderCart();
}
function renderCart(){
  const box=document.getElementById("cart");if(!box)return;let sub=0;
  box.innerHTML=cart.map(c=>{const p=products.find(x=>String(x.barcode)===String(c.b));if(!p)return"";
    const t=Number(p.sell)*c.qty;sub+=t;
    return `<div class="cart-item"><div><b>${esc(p.name)}</b><div class="muted">${esc(p.barcode)} × Rs. ${money(p.sell)}</div></div>
    <input type="number" min="1" max="${Number(p.stock)}" value="${c.qty}" onchange="setQty('${q(c.b)}',this.value)">
    <div>Rs. ${money(t)}</div><button class="red" onclick="del('${q(c.b)}')">×</button></div>`
  }).join("")||'<p class="muted">Bill is empty.</p>';
  const d=Math.max(0,Number(document.getElementById("discount")?.value)||0),tot=Math.max(0,sub-d);
  document.getElementById("grand").textContent=money(tot);
  const pay=document.getElementById("payment")?.value,cash=Number(document.getElementById("cash")?.value)||0;
  document.getElementById("change").textContent=pay==="CASH"&&cash>=tot?"Change: Rs. "+money(cash-tot):"";
}
["discount","cash","payment"].forEach(id=>document.getElementById(id)?.addEventListener("input",renderCart));

function enqueue(s){
  const x=pending.find(r=>r.invoice===s.invoice);
  if(x){x.sale=s;x.items=s.items}else pending.push({invoice:s.invoice,sale:s,items:s.items,attempts:0});
  savePending();updateSync();
}
function updateSync(){const e=document.getElementById("syncInfo");if(e)e.textContent=pending.length?pending.length+" sale(s) waiting for cloud sync.":"No pending sales."}

async function completeSale(){
  if(!cart.length)return alert("Bill is empty");
  const sub=cart.reduce((a,c)=>{const p=products.find(x=>String(x.barcode)===String(c.b));return a+(p?Number(p.sell)*c.qty:0)},0);
  const discount=Math.max(0,Number(document.getElementById("discount").value)||0);
  if(discount>sub)return alert("Discount exceeds subtotal");
  const total=sub-discount,payment=document.getElementById("payment").value,cash=Number(document.getElementById("cash").value)||0;
  if(payment==="CASH"&&cash<total)return alert("Cash received is less than total");
  for(const c of cart){const p=products.find(x=>String(x.barcode)===String(c.b));if(!p||Number(p.stock)<c.qty)return alert("Not enough stock");if(!Number(p.sell))return alert("Selling price not set for "+p.name)}
  const items=cart.map(c=>{const p=products.find(x=>String(x.barcode)===String(c.b));return{barcode:String(p.barcode),name:p.name,qty:Number(c.qty),cost:Number(p.cost||0),sell:Number(p.sell||0),total:Number(p.sell)*c.qty}});
  const sale={invoice:nextInvoice(),date:new Date().toISOString(),customer:document.getElementById("customer").value.trim(),phone:document.getElementById("phone").value.trim(),
    items,subtotal:sub,discount,total,payment,cash,change:payment==="CASH"?Math.max(0,cash-total):0,
    profit:items.reduce((a,i)=>a+(i.sell-i.cost)*i.qty,0)-discount};
  items.forEach(i=>{const p=products.find(x=>String(x.barcode)===String(i.barcode));p.stock-=i.qty});
  sales.push(sale);enqueue(sale);save();cart=[];
  document.getElementById("customer").value="";document.getElementById("phone").value="";
  document.getElementById("discount").value=0;document.getElementById("cash").value=0;
  renderCart();renderProducts();renderStock();renderSales();dashboard();show(sale);
  await syncPendingSales();
}

async function ensureProduct(i){
  const b=String(i.barcode);
  const f=await sbClient.from("products").select("*").eq("barcode",b).maybeSingle();
  if(f.error)throw f.error;if(f.data)return f.data;
  const p=products.find(x=>String(x.barcode)===b)||i;
  const r=await sbClient.from("products").insert({barcode:b,part_no:p.partNo||null,name:p.name||i.name,buy:Number(p.cost||i.cost||0),sell:Number(p.sell||i.sell||0),stock:Number(p.stock||0),min_stock:Number(p.min??2)}).select().single();
  if(!r.error)return r.data;
  const retry=await sbClient.from("products").select("*").eq("barcode",b).maybeSingle();
  if(retry.error||!retry.data)throw r.error;return retry.data;
}

async function syncOne(r){
  if(!sbClient)throw new Error("Supabase is not connected");
  const s=r.sale;

  // Preferred path: one database transaction through the RPC created by supabase_schema.sql.
  const payload={invoice:s.invoice,sale_time:s.date,subtotal:s.subtotal,discount:s.discount,total:s.total,profit:s.profit,
    payment:s.payment,cash:s.cash,balance:s.payment==="CREDIT"?s.total:s.change,customer:s.customer||null,phone:s.phone||null,
    items:r.items.map(i=>({barcode:String(i.barcode),name:i.name,qty:Number(i.qty),unit_price:Number(i.sell),buy_price:Number(i.cost),total:Number(i.total),profit:(Number(i.sell)-Number(i.cost))*Number(i.qty)}))};
  const rpc=await sbClient.rpc("pos_complete_sale",{p_sale:payload});
  if(!rpc.error)return;

  // If the RPC has not been installed yet, fall back to the safe idempotent sequence.
  if(!/pos_complete_sale|function|does not exist|schema cache/i.test(errText(rpc.error)))throw rpc.error;

  const cps={};for(const i of r.items)cps[i.barcode]=await ensureProduct(i);
  let f=await sbClient.from("sales").select("id").eq("invoice",s.invoice).maybeSingle();if(f.error)throw f.error;
  let sid=f.data?.id;
  if(!sid){
    const x=await sbClient.from("sales").insert({invoice:s.invoice,sale_time:s.date,subtotal:s.subtotal,discount:s.discount,total:s.total,profit:s.profit,payment:s.payment,cash:s.cash,balance:s.payment==="CREDIT"?s.total:s.change,customer:s.customer||null,phone:s.phone||null}).select("id").single();
    if(x.error){const z=await sbClient.from("sales").select("id").eq("invoice",s.invoice).maybeSingle();if(z.error||!z.data)throw x.error;sid=z.data.id}else sid=x.data.id;
  }
  const ex=await sbClient.from("sale_items").select("barcode").eq("sale_id",sid);if(ex.error)throw ex.error;
  const have=new Set((ex.data||[]).map(x=>String(x.barcode)));
  const missing=r.items.filter(i=>!have.has(String(i.barcode))).map(i=>({sale_id:sid,product_id:cps[i.barcode].id,barcode:i.barcode,name:i.name,qty:i.qty,unit_price:i.sell,buy_price:i.cost,total:i.total,profit:(i.sell-i.cost)*i.qty}));
  if(missing.length){const x=await sbClient.from("sale_items").insert(missing);if(x.error)throw x.error}
  for(const i of r.items){
    const cp=cps[i.barcode],note="Sale "+s.invoice;
    const mv=await sbClient.from("stock_movements").select("id").eq("product_id",cp.id).eq("note",note).maybeSingle();if(mv.error)throw mv.error;if(mv.data)continue;
    const cur=await sbClient.from("products").select("stock").eq("id",cp.id).single();if(cur.error)throw cur.error;
    const old=Number(cur.data.stock||0),qty=Number(i.qty);if(old<qty)throw new Error("Cloud stock conflict for "+i.name);
    const up=await sbClient.from("products").update({stock:old-qty}).eq("id",cp.id).eq("stock",old).select("id").maybeSingle();if(up.error)throw up.error;if(!up.data)throw new Error("Cloud stock changed on another device. Sale kept locally.");
    const ins=await sbClient.from("stock_movements").insert({product_id:cp.id,barcode:i.barcode,movement_type:"OUT",qty,note});if(ins.error)throw ins.error;
  }
}

async function syncPendingSales(){
  if(!sbClient){updateSync();return}
  if(!pending.length){updateSync();return}
  status("☁️ Syncing pending sales…","warn");
  for(const r of [...pending]){
    try{r.attempts++;savePending();await syncOne(r);pending=pending.filter(x=>x.invoice!==r.invoice);savePending()}
    catch(e){r.lastError=errText(e);savePending();status("⚠️ Cloud sync failed: "+r.lastError,"bad");break}
  }
  updateSync();if(!pending.length)status("☁️ All sales synced to Supabase ✓","ok");
}

async function loadProductsFromSupabase(alertIt){
  if(!sbClient)return alert("Supabase unavailable");
  try{
    const r=await sbClient.from("products").select("id,barcode,name,part_no,buy,sell,stock,min_stock").order("id");
    if(r.error)throw r.error;
    const local=new Map(products.map(p=>[String(p.barcode),p])),merged=[],cloud=new Set();
    for(const x of r.data||[]){const b=String(x.barcode);cloud.add(b);const o=local.get(b)||{};
      merged.push({...o,id:x.id,barcode:b,partNo:x.part_no||"",name:x.name,cost:Number(x.buy),sell:Number(x.sell),stock:Number(x.stock),min:Number(x.min_stock)})}
    for(const p of products)if(p.barcode&&!cloud.has(String(p.barcode)))merged.push(p);
    products=merged;save();renderProducts();renderStock();dashboard();
    if(alertIt)alert("Cloud products loaded: "+(r.data?.length||0));
  }catch(e){if(alertIt)alert("Cloud product load failed: "+errText(e));status("⚠️ Product load failed: "+errText(e),"bad")}
}

async function loadCloudSales(){
  if(!sbClient)return alert("Supabase unavailable");
  const r=await sbClient.from("sales").select("*").order("id",{ascending:false}).limit(200);
  if(r.error)return alert(r.error.message);
  for(const s of r.data||[]){
    let x=sales.find(z=>z.invoice===s.invoice);
    if(x)Object.assign(x,{date:s.sale_time,total:Number(s.total),profit:Number(s.profit),payment:s.payment,customer:s.customer||"",phone:s.phone||""});
    else sales.push({invoice:s.invoice,date:s.sale_time,total:Number(s.total),profit:Number(s.profit),payment:s.payment,customer:s.customer||"",phone:s.phone||"",subtotal:Number(s.subtotal),discount:Number(s.discount),cash:Number(s.cash),change:Number(s.balance),items:[]});
  }
  save();renderSales();dashboard();alert("Cloud sales loaded.");
}

function renderStock(){
  const s=(document.getElementById("stockSearch")?.value||"").toLowerCase(),l=document.getElementById("stockList");if(!l)return;
  l.innerHTML=products.filter(p=>[p.name,p.barcode,p.partNo].join(" ").toLowerCase().includes(s)).map(p=>`<div class="product">
  <div class="product-name">${esc(p.name)}</div><div>${esc(p.barcode)} • Stock: <span class="badge ${Number(p.stock)<=Number(p.min)?"low":""}">${Number(p.stock||0)}</span> • Cost Rs. ${money(p.cost)} • Sell Rs. ${money(p.sell)}</div>
  <button class="blue" style="width:100%;margin-top:8px" onclick="editProduct('${q(p.barcode)}')">✏️ EDIT PRODUCT</button></div>`).join("")||'<p class="muted">No products found.</p>';
}
function renderSales(){
  const l=document.getElementById("salesList");if(!l)return;
  l.innerHTML=sales.slice().reverse().map(s=>`<div class="product"><div class="product-name"><a href="#" onclick="openSale('${q(s.invoice)}');return false">${esc(s.invoice)}</a></div>
  <div>${new Date(s.date).toLocaleString()} • Rs. ${money(s.total)} • Profit Rs. ${money(s.profit)} ${s.customer?"• "+esc(s.customer):""}</div></div>`).join("")||'<p class="muted">No sales yet.</p>';
}
function dashboard(){
  const d=new Date().toDateString(),a=sales.filter(s=>new Date(s.date).toDateString()===d);
  document.getElementById("ts").textContent="Rs. "+money(a.reduce((x,s)=>x+Number(s.total||0),0));
  document.getElementById("tp").textContent="Rs. "+money(a.reduce((x,s)=>x+Number(s.profit||0),0));
  document.getElementById("tb").textContent=a.length;document.getElementById("lc").textContent=products.filter(p=>Number(p.stock)<=Number(p.min)).length;
}
function editProduct(b){
  const p=products.find(x=>String(x.barcode)===String(b));if(!p)return;editing=p.barcode;
  ["pb","pp","pn","pg","pcost","psell","pstock","pmin"].forEach((id,i)=>document.getElementById(id).value=[p.barcode,p.partNo||"",p.name,p.category||"",p.cost||0,p.sell||0,p.stock||0,p.min??2][i]);
  document.getElementById("pb").readOnly=true;document.querySelector('[onclick="saveProduct()"]').textContent="UPDATE PRODUCT";document.getElementById("pmsg").textContent="Editing: "+p.name;tab("more",document.querySelectorAll(".tab")[3]);
}
function clearForm(){
  ["pb","pp","pn","pg","pcost","psell","pstock"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("pmin").value=2;editing=null;document.getElementById("pb").readOnly=false;
  document.querySelector('[onclick="saveProduct()"]').textContent="SAVE PRODUCT";document.getElementById("pmsg").textContent="";
}
async function saveProduct(){
  const b=document.getElementById("pb").value.trim(),name=document.getElementById("pn").value.trim();if(!b||!name)return alert("Barcode and product name are required");
  const obj={barcode:b,partNo:document.getElementById("pp").value.trim(),name,category:document.getElementById("pg").value.trim(),cost:Number(document.getElementById("pcost").value)||0,sell:Number(document.getElementById("psell").value)||0,stock:Number(document.getElementById("pstock").value)||0,min:Number(document.getElementById("pmin").value)||0};
  try{
    if(!sbClient)throw new Error("Supabase not connected");
    if(editing){
      const p=products.find(x=>String(x.barcode)===String(editing));
      if(p?.id){
        const r=await sbClient.from("products").update({part_no:obj.partNo||null,name:obj.name,buy:obj.cost,sell:obj.sell,stock:obj.stock,min_stock:obj.min}).eq("id",p.id).select().single();
        if(r.error)throw r.error;
      }
      Object.assign(p||{},obj);
    }else{
      const r=await sbClient.from("products").upsert({barcode:b,part_no:obj.partNo||null,name:obj.name,buy:obj.cost,sell:obj.sell,stock:obj.stock,min_stock:obj.min},{onConflict:"barcode"}).select().single();
      if(r.error)throw r.error;
      const old=products.find(x=>String(x.barcode)===b);if(old)Object.assign(old,{...obj,id:r.data.id});else products.push({...obj,id:r.data.id});
    }
    save();renderProducts();renderStock();dashboard();clearForm();alert("Product saved to cloud ✓");
  }catch(e){alert("Product save failed: "+errText(e))}
}
function backup(){const data={version:2,exported_at:new Date().toISOString(),products,sales,pending,invoice:Number(localStorage.getItem(IK)||0)};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download="shasha-motors-pos-backup.json";a.click();URL.revokeObjectURL(a.href)}
function restoreBackup(e){
  const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const x=JSON.parse(rd.result);products=Array.isArray(x.products)?x.products:products;sales=Array.isArray(x.sales)?x.sales:sales;pending=Array.isArray(x.pending)?x.pending:pending;localStorage.setItem(IK,String(Number(x.invoice)||0));save();savePending();renderProducts();renderStock();renderSales();dashboard();updateSync();alert("Backup restored ✓")}catch(err){alert("Invalid backup file")}};rd.readAsText(f);
}
async function scan(){
  if(!window.Html5Qrcode)return alert("Scanner library unavailable");
  const reader=document.getElementById("reader");reader.classList.remove("hidden");
  if(scanner){try{await scanner.stop()}catch{}scanner=null}
  scanner=new Html5Qrcode("reader");
  try{
    await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:150}},code=>{
      document.getElementById("search").value=code;renderProducts();const p=products.find(x=>String(x.barcode)===String(code));if(p)add(code);
      scanner.stop().catch(()=>{});reader.classList.add("hidden");
    },()=>{});
  }catch(e){reader.classList.add("hidden");alert("Camera could not start: "+errText(e))}
}
function show(s){last=s;const r=document.getElementById("receipt");r.innerHTML=`<div class="center"><b>SHASHA MOTORS</b><br>7/1A, Thambilwaththa, Makandana, Piliyandala<br>0771112344</div><div class="hr"></div>
<div class="line"><span>Invoice</span><b>${esc(s.invoice)}</b></div><div class="line"><span>Date</span><span>${new Date(s.date).toLocaleString()}</span></div>${s.customer?`<div class="line"><span>Customer</span><span>${esc(s.customer)}</span></div>`:""}
<div class="hr"></div>${s.items.map(i=>`<div class="line"><span>${esc(i.name)} × ${i.qty}</span><span>Rs. ${money(i.total)}</span></div>`).join("")}<div class="hr"></div>
<div class="line"><span>Subtotal</span><span>Rs. ${money(s.subtotal)}</span></div><div class="line"><span>Discount</span><span>Rs. ${money(s.discount)}</span></div>
<div class="line"><b>TOTAL</b><b>Rs. ${money(s.total)}</b></div><div class="line"><span>Payment</span><span>${esc(s.payment)}</span></div>${s.payment==="CASH"?`<div class="line"><span>Cash</span><span>Rs. ${money(s.cash)}</span></div><div class="line"><span>Change</span><span>Rs. ${money(s.change)}</span></div>`:""}`;
document.getElementById("modal").classList.remove("hidden")}
function openSale(inv){const s=sales.find(x=>x.invoice===inv);if(s)show(s)}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function pdf(){if(!last||!window.html2pdf)return;html2pdf().set({margin:8,filename:last.invoice+".pdf",html2canvas:{scale:2},jsPDF:{unit:"mm",format:"a4"}}).from(document.getElementById("receipt")).save()}
async function share(){if(!last)return;const text=`Shasha Motors\nInvoice: ${last.invoice}\nTotal: Rs. ${money(last.total)}\nPayment: ${last.payment}`;if(navigator.share)try{await navigator.share({title:"Shasha Motors Receipt",text})}catch{}else await navigator.clipboard?.writeText(text)}
window.addEventListener("online",()=>testCloud());
window.addEventListener("load",init);
