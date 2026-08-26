/* SHASHA MOTORS POS — STABLE app.js
   Fix:
   - Sales are completed locally first.
   - Supabase is optional/background sync.
   - A Supabase/network failure never cancels a completed sale.
   - Existing localStorage product/sales data is preserved.
   - No automatic Supabase product merge on startup.
*/

window.sbClient = null;

try {
  if (window.supabase?.createClient) {
    window.sbClient = window.supabase.createClient(
      'https://mncufdwicrlknhhkica.supabase.co',
      'sb_publishable_pK3jWDVlSe6moSxIBIHO2g_JNxnuA4O'
    );
  }
} catch (e) {
  console.warn('Supabase unavailable; local mode enabled.', e);
}

const PK = 'shasha_final_products_v1';
const SK = 'shasha_final_sales_v1';
const IK = 'shasha_final_invoice_v1';
const SYNC_KEY = 'shasha_final_pending_sync_v1';

/*
 IMPORTANT:
 The previous app.js already stored your 442 products in localStorage.
 This replacement deliberately reads that existing catalogue and DOES NOT
 overwrite it with an empty/default catalogue.
*/
let products = [];
let sales = [];
let pendingSales = [];

try {
  const savedPending = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
  pendingSales = Array.isArray(savedPending) ? savedPending : [];
} catch (e) {
  console.warn('Could not read pending cloud sync queue.', e);
  pendingSales = [];
}

try {
  const savedProducts = JSON.parse(localStorage.getItem(PK) || 'null');
  products = Array.isArray(savedProducts) ? savedProducts : [];
} catch (e) {
  console.warn('Could not read local products.', e);
  products = [];
}

try {
  const savedSales = JSON.parse(localStorage.getItem(SK) || '[]');
  sales = Array.isArray(savedSales) ? savedSales : [];
} catch (e) {
  console.warn('Could not read local sales.', e);
  sales = [];
}

let cart = [];
let last = null;
let scanner = null;
let editingBarcode = null;

const m = n => Number(n || 0).toLocaleString('en-LK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
}[x]));

const q = s => String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'");

const setMsg = (id, text, type='') => {
  const e = document.getElementById(id);
  if (e) {
    e.textContent = text;
    e.className = 'status ' + type;
  }
};

function save() {
  localStorage.setItem(PK, JSON.stringify(products));
  localStorage.setItem(SK, JSON.stringify(sales));
}

function nextInvoice() {
  let n = Number(localStorage.getItem(IK) || 0) + 1;
  localStorage.setItem(IK, String(n));
  return 'INV-' + String(n).padStart(6, '0');
}

function tab(id, b) {
  ['bill','stock','sales','more'].forEach(x => {
    document.getElementById(x)?.classList.toggle('hidden', x !== id);
  });

  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  b?.classList.add('active');

  if (id === 'stock') renderStock();
  if (id === 'sales') renderSales();
  if (id === 'more') {
    dashboard();
    populateBarcodeProducts();
  }
}

function renderProducts() {
  const s = (document.getElementById('search')?.value || '').toLowerCase();

  const a = products.filter(p =>
    [p.name,p.barcode,p.partNo,p.category]
      .join(' ')
      .toLowerCase()
      .includes(s)
  );

  const results = document.getElementById('results');
  if (!results) return;

  results.innerHTML = a.map(p => `
    <div class="product">
      <div class="product-name">${esc(p.name)}</div>
      <div class="muted">
        ${esc(p.barcode)} • Stock: <b>${Number(p.stock || 0)}</b>
        • Sell: <b>Rs. ${m(p.sell)}</b>
        ${!Number(p.sell) ? '<span class="badge zero">PRICE NOT SET</span>' : ''}
      </div>
      <button class="blue" style="width:100%;margin-top:7px"
        onclick="add('${q(p.barcode)}')">Add</button>
    </div>
  `).join('') || '<p class="muted">No products found.</p>';
}

function add(barcode) {
  const p = products.find(x => String(x.barcode) === String(barcode));

  if (!p || Number(p.stock) <= 0) {
    return alert('Out of stock');
  }

  if (!Number(p.sell)) {
    return alert('Selling price not set for ' + p.name);
  }

  const c = cart.find(x => String(x.b) === String(barcode));

  if (c) {
    if (Number(c.qty) >= Number(p.stock)) {
      return alert('Not enough stock');
    }
    c.qty++;
  } else {
    cart.push({ b: barcode, qty: 1 });
  }

  renderCart();
}

function qty(b, v) {
  const p = products.find(x => String(x.barcode) === String(b));
  const c = cart.find(x => String(x.b) === String(b));

  if (!p || !c) return;

  c.qty = Math.max(
    1,
    Math.min(
      Math.floor(Number(v) || 1),
      Number(p.stock)
    )
  );

  renderCart();
}

function del(b) {
  cart = cart.filter(x => String(x.b) !== String(b));
  renderCart();
}

function renderCart() {
  const cartBox = document.getElementById('cart');
  if (!cartBox) return;

  let sub = 0;

  cartBox.innerHTML = cart.map(c => {
    const p = products.find(x => String(x.barcode) === String(c.b));
    if (!p) return '';

    const t = Number(p.sell) * Number(c.qty);
    sub += t;

    return `
      <div class="cart-item">
        <div>
          <b>${esc(p.name)}</b>
          <div class="muted">
            ${esc(p.barcode)} × Rs. ${m(p.sell)}
          </div>
        </div>

        <input
          type="number"
          min="1"
          max="${Number(p.stock)}"
          value="${Number(c.qty)}"
          onchange="qty('${q(c.b)}',this.value)"
        >

        <div>Rs. ${m(t)}</div>

        <button class="red"
          onclick="del('${q(c.b)}')">×</button>
      </div>
    `;
  }).join('') || '<p class="muted">Bill is empty.</p>';

  const d = Math.max(
    0,
    Number(document.getElementById('discount')?.value) || 0
  );

  const tot = Math.max(0, sub - d);

  const grand = document.getElementById('grand');
  if (grand) grand.textContent = m(tot);

  const cash =
    Number(document.getElementById('cash')?.value) || 0;

  const pay =
    document.getElementById('payment')?.value;

  const change = document.getElementById('change');

  if (change) {
    change.textContent =
      pay === 'CASH' && cash >= tot && tot
        ? 'Change: Rs. ' + m(cash - tot)
        : '';
  }
}

/* -------------------------------------------------------
   SUPABASE PRODUCT LOAD
   Not automatic.
   Can be called manually if needed.
------------------------------------------------------- */

async function loadProductsFromSupabase() {
  if (!window.sbClient) return false;

  try {
    const { data, error } = await window.sbClient
      .from('products')
      .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
      .order('id', { ascending: true });

    if (error) throw error;

    const localByBarcode =
      new Map(products.map(p => [String(p.barcode || ''), p]));

    const merged = [];
    const cloudBarcodes = new Set();

    for (const row of (Array.isArray(data) ? data : [])) {
      const barcode = String(row.barcode || '').trim();
      if (!barcode) continue;

      cloudBarcodes.add(barcode);

      const old = localByBarcode.get(barcode) || {};

      merged.push({
        ...old,
        id: row.id,
        barcode,
        partNo: row.part_no || old.partNo || '',
        name: row.name || old.name || '',
        category: old.category || '',
        cost: Number(row.buy ?? old.cost ?? 0),
        sell: Number(row.sell ?? old.sell ?? 0),
        stock: Number(row.stock ?? old.stock ?? 0),
        min: Number(row.min_stock ?? old.min ?? 2),
        supplier: old.supplier || ''
      });
    }

    for (const p of products) {
      const barcode = String(p.barcode || '');
      if (barcode && !cloudBarcodes.has(barcode)) {
        merged.push({ ...p });
      }
    }

    products = merged;
    save();

    renderProducts();
    renderStock();
    dashboard();
    populateBarcodeProducts();

    return true;

  } catch (e) {
    console.error('Supabase product load failed:', e);
    return false;
  }
}

function renderStock() {
  const s =
    (document.getElementById('stockSearch')?.value || '')
      .toLowerCase();

  const a = products.filter(p =>
    [p.name,p.barcode,p.partNo,p.category]
      .join(' ')
      .toLowerCase()
      .includes(s)
  );

  const list = document.getElementById('stockList');
  if (!list) return;

  list.innerHTML = a.map(p => `
    <div class="product">
      <div class="product-name">${esc(p.name)}</div>

      <div>
        ${esc(p.barcode)}
        • Stock:
        <span class="badge ${Number(p.stock) <= Number(p.min) ? 'low' : ''}">
          ${Number(p.stock || 0)}
        </span>
        • Cost Rs. ${m(p.cost)}
        • Sell Rs. ${m(p.sell)}
      </div>

      <button class="blue"
        style="width:100%;margin-top:8px"
        onclick="editProduct('${q(p.barcode)}')">
        ✏️ EDIT PRODUCT
      </button>
    </div>
  `).join('') || '<p class="muted">No products found.</p>';
}

function renderSales() {
  const list = document.getElementById('salesList');
  if (!list) return;

  list.innerHTML = sales.slice().reverse().map(s => `
    <div class="product">
      <div class="product-name">
        <a href="#"
          onclick="show(sales.find(z=>z.invoice==='${q(s.invoice)}'));return false">
          ${esc(s.invoice)}
        </a>
      </div>

      <div>
        ${new Date(s.date).toLocaleString()}
        • Rs. ${m(s.total)}
        • Profit Rs. ${m(s.profit)}
        ${s.customer ? '• ' + esc(s.customer) : ''}
      </div>
    </div>
  `).join('') || '<p class="muted">No sales yet.</p>';
}

function dashboard() {
  const today = new Date().toDateString();

  const a = sales.filter(
    s => new Date(s.date).toDateString() === today
  );

  const ts = document.getElementById('ts');
  const tp = document.getElementById('tp');
  const tb = document.getElementById('tb');
  const lc = document.getElementById('lc');
  const pc = document.getElementById('pc');

  if (ts) {
    ts.textContent =
      'Rs. ' + m(a.reduce((x,s)=>x+Number(s.total||0),0));
  }

  if (tp) {
    tp.textContent =
      'Rs. ' + m(a.reduce((x,s)=>x+Number(s.profit||0),0));
  }

  if (tb) tb.textContent = a.length;

  if (lc) {
    lc.textContent =
      products.filter(
        p => Number(p.stock) <= Number(p.min)
      ).length;
  }

  if (pc) pc.textContent = products.length;
}

function editProduct(b) {
  const p = products.find(x => String(x.barcode) === String(b));
  if (!p) return alert('Product not found');

  editingBarcode = p.barcode;

  const set = (id, value) => {
    const e = document.getElementById(id);
    if (e) e.value = value;
  };

  set('pb', p.barcode);
  set('pp', p.partNo || '');
  set('pn', p.name || '');
  set('pg', p.category || '');
  set('pcost', p.cost ?? 0);
  set('psell', p.sell ?? 0);
  set('pstock', p.stock ?? 0);
  set('pmin', p.min ?? 2);

  const pb = document.getElementById('pb');
  if (pb) pb.readOnly = true;

  const button =
    document.querySelector('[onclick="saveProduct()"]');

  if (button) button.textContent = 'UPDATE PRODUCT';

  const msg = document.getElementById('pmsg');
  if (msg) msg.textContent = 'Editing: ' + p.name;

  tab('more', document.querySelectorAll('.tab')[3]);

  document.getElementById('more')?.scrollIntoView({
    behavior:'smooth',
    block:'start'
  });
}

function clearForm() {
  ['pb','pp','pn','pg','pcost','psell','pstock']
    .forEach(x => {
      const e = document.getElementById(x);
      if (e) e.value = '';
    });

  const min = document.getElementById('pmin');
  if (min) min.value = 2;

  editingBarcode = null;

  const pb = document.getElementById('pb');
  if (pb) pb.readOnly = false;

  const b =
    document.querySelector('[onclick="saveProduct()"]');

  if (b) b.textContent = 'SAVE PRODUCT';

  const msg = document.getElementById('pmsg');
  if (msg) msg.textContent = '';
}

/* -------------------------------------------------------
   PRODUCT SAVE
------------------------------------------------------- */

async function saveProduct() {
  const msg = document.getElementById('pmsg');

  const value = id =>
    document.getElementById(id)?.value ?? '';

  const b = value('pb').trim();
  const partNo = value('pp').trim();
  const name = value('pn').trim();
  const category = value('pg').trim();

  const cost = Number(value('pcost')) || 0;
  const sell = Number(value('psell')) || 0;
  const stock = Math.max(
    0,
    Math.floor(Number(value('pstock')) || 0)
  );
  const min = Math.max(
    0,
    Math.floor(Number(value('pmin')) || 2)
  );

  if (!b || !name) {
    return alert('Barcode and name required');
  }

  const editing = !!editingBarcode;

  const old = editing
    ? products.find(x => x.barcode === editingBarcode)
    : null;

  if (editing && !old) {
    return alert('Product not found');
  }

  const localProduct = {
    ...(old || {}),
    barcode:b,
    partNo,
    name,
    category,
    cost,
    sell,
    stock,
    min,
    supplier:old?.supplier || ''
  };

  /* Always save locally first. */

  if (editing) {
    const index =
      products.findIndex(
        x => x.barcode === editingBarcode
      );

    if (index >= 0) {
      products[index] = localProduct;
    }
  } else {
    if (
      products.some(
        x => String(x.barcode).toLowerCase() === b.toLowerCase()
      )
    ) {
      return alert('Duplicate barcode.');
    }

    products.push(localProduct);
  }

  save();
  renderProducts();
  renderStock();
  dashboard();
  populateBarcodeProducts();

  if (msg) {
    msg.textContent =
      'Saved locally ✓' +
      (window.sbClient ? '  Syncing to Supabase...' : '');
  }

  /* Try cloud save, but NEVER destroy local save if cloud fails. */

  if (window.sbClient) {
    try {
      const payload = {
        barcode:b,
        part_no:partNo || null,
        name,
        buy:cost,
        sell,
        stock,
        min_stock:min
      };

      let result;

      if (editing && old?.id) {
        result =
          await window.sbClient
            .from('products')
            .update(payload)
            .eq('id',old.id)
            .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
            .single();
      } else {
        result =
          await window.sbClient
            .from('products')
            .insert(payload)
            .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
            .single();
      }

      if (result.error) throw result.error;

      if (result.data) {
        const index =
          products.findIndex(
            x => String(x.barcode) === String(result.data.barcode)
          );

        if (index >= 0) {
          products[index] = {
            ...products[index],
            id:result.data.id,
            barcode:String(result.data.barcode),
            partNo:result.data.part_no || partNo,
            name:result.data.name || name,
            cost:Number(result.data.buy ?? cost),
            sell:Number(result.data.sell ?? sell),
            stock:Number(result.data.stock ?? stock),
            min:Number(result.data.min_stock ?? min)
          };

          save();
          renderProducts();
          renderStock();
          dashboard();
          populateBarcodeProducts();
        }
      }

      if (msg) msg.textContent = 'Saved to Supabase ✓';

    } catch (e) {
      console.warn(
        'Supabase product save failed. Local save is safe.',
        e
      );

      if (msg) {
        msg.textContent =
          'Saved locally ✓ (Supabase unavailable)';
      }
    }
  }

  editingBarcode = null;

  const pb = document.getElementById('pb');
  if (pb) pb.readOnly = false;

  const button =
    document.querySelector('[onclick="saveProduct()"]');

  if (button) button.textContent = 'SAVE PRODUCT';
}

/* -------------------------------------------------------
   CLOUD SYNC QUEUE
------------------------------------------------------- */

function savePendingSales() {
  localStorage.setItem(SYNC_KEY, JSON.stringify(pendingSales));
}

function enqueueSaleForSync(sale) {
  if (!sale?.invoice) return;

  const existing = pendingSales.find(x => x.invoice === sale.invoice);
  if (!existing) {
    pendingSales.push({
      invoice:sale.invoice,
      sale,
      items:sale.items || [],
      attempts:0,
      lastError:'',
      queuedAt:new Date().toISOString()
    });
  } else {
    existing.sale = sale;
    existing.items = sale.items || [];
  }

  savePendingSales();
}

function removePendingSale(invoice) {
  pendingSales = pendingSales.filter(x => x.invoice !== invoice);
  savePendingSales();
}

async function ensureCloudProduct(item) {
  const barcode = String(item.barcode || '').trim();
  if (!barcode) throw new Error('Missing barcode for ' + item.name);

  const found = await window.sbClient
    .from('products')
    .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
    .eq('barcode', barcode)
    .maybeSingle();

  if (found.error) throw found.error;
  if (found.data) return found.data;

  const local = products.find(p => String(p.barcode) === barcode);
  if (!local) throw new Error('Local product not found: ' + barcode);

  /*
    Local stock already includes offline sales. If this product does not
    exist in Supabase yet, reconstruct the stock value that existed before
    all queued sales for this barcode, then the normal OUT movements below
    bring cloud stock back down exactly to the current local stock.
  */
  const queuedQty = pendingSales.reduce((sum, r) => {
    return sum + (r.items || [])
      .filter(i => String(i.barcode) === barcode)
      .reduce((n, i) => n + Number(i.qty || 0), 0);
  }, 0);

  const inserted = await window.sbClient
    .from('products')
    .insert({
      barcode,
      part_no:local.partNo || null,
      name:local.name || item.name,
      buy:Number(local.cost || item.cost || 0),
      sell:Number(local.sell || item.sell || 0),
      stock:Number(local.stock || 0) + queuedQty,
      min_stock:Number(local.min ?? 2)
    })
    .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
    .single();

  if (!inserted.error) return inserted.data;

  /* Another device may have inserted it between the two requests. */
  const retry = await window.sbClient
    .from('products')
    .select('id,barcode,name,part_no,buy,sell,stock,min_stock')
    .eq('barcode', barcode)
    .maybeSingle();

  if (retry.error || !retry.data) {
    throw inserted.error || new Error('Could not create cloud product: ' + barcode);
  }

  return retry.data;
}

async function syncOneSale(record) {
  if (!window.sbClient) throw new Error('Supabase is unavailable');

  const sale = record.sale;
  const items = Array.isArray(record.items) ? record.items : [];
  const cloudProducts = {};

  /* 1. Make sure every sold product exists in the cloud. */
  for (const item of items) {
    cloudProducts[String(item.barcode)] = await ensureCloudProduct(item);
  }

  /* 2. Create the cloud sale only once (invoice is the idempotency key). */
  let cloudSale;

  const existingSale = await window.sbClient
    .from('sales')
    .select('id,invoice')
    .eq('invoice', sale.invoice)
    .maybeSingle();

  if (existingSale.error) throw existingSale.error;

  if (existingSale.data) {
    cloudSale = existingSale.data;
  } else {
    const created = await window.sbClient
      .from('sales')
      .insert({
        invoice:sale.invoice,
        sale_time:sale.date,
        subtotal:Number(sale.subtotal || 0),
        discount:Number(sale.discount || 0),
        total:Number(sale.total || 0),
        profit:Number(sale.profit || 0),
        payment:sale.payment || 'CASH',
        cash:Number(sale.cash || 0),
        balance:sale.payment === 'CREDIT'
          ? Number(sale.total || 0)
          : Number(sale.change || 0),
        customer:sale.customer || null,
        phone:sale.phone || null
      })
      .select('id,invoice')
      .single();

    if (created.error) {
      /* A second device may have created the same invoice. */
      const retry = await window.sbClient
        .from('sales')
        .select('id,invoice')
        .eq('invoice', sale.invoice)
        .maybeSingle();

      if (retry.error || !retry.data) throw created.error;
      cloudSale = retry.data;
    } else {
      cloudSale = created.data;
    }
  }

  /* 3. Add sale items once. */
  const existingItems = await window.sbClient
    .from('sale_items')
    .select('id,barcode')
    .eq('sale_id', cloudSale.id);

  if (existingItems.error) throw existingItems.error;

  const existingBarcodes = new Set(
    (existingItems.data || []).map(x => String(x.barcode || ''))
  );

  const missingItems = items
    .filter(i => !existingBarcodes.has(String(i.barcode)))
    .map(item => {
      const cp = cloudProducts[String(item.barcode)];
      return {
        sale_id:cloudSale.id,
        product_id:cp?.id || null,
        barcode:item.barcode,
        name:item.name,
        qty:Number(item.qty),
        unit_price:Number(item.sell || 0),
        buy_price:Number(item.cost || 0),
        total:Number(item.total || 0),
        profit:(Number(item.sell || 0)-Number(item.cost || 0))*Number(item.qty)
      };
    });

  if (missingItems.length) {
    const insertedItems = await window.sbClient
      .from('sale_items')
      .insert(missingItems);

    if (insertedItems.error) throw insertedItems.error;
  }

  /* 4. Decrease cloud stock safely. */
  for (const item of items) {
    const cp = cloudProducts[String(item.barcode)];
    if (!cp?.id) throw new Error('Cloud product has no ID: ' + item.barcode);

    const movementNote = 'Sale ' + sale.invoice;
    record.stockDone = record.stockDone || {};
    record.movementDone = record.movementDone || {};

    const alreadyMoved = await window.sbClient
      .from('stock_movements')
      .select('id')
      .eq('product_id', cp.id)
      .eq('note', movementNote)
      .limit(1)
      .maybeSingle();

    if (alreadyMoved.error) throw alreadyMoved.error;
    if (alreadyMoved.data) {
      record.stockDone[String(item.barcode)] = true;
      record.movementDone[String(item.barcode)] = true;
      savePendingSales();
      continue;
    }

    /*
      Optimistic locking:
      the UPDATE succeeds only if the stock value we read is still the
      current value. This prevents two devices from silently overwriting
      each other's stock changes.
    */
    const current = await window.sbClient
      .from('products')
      .select('id,stock')
      .eq('id', cp.id)
      .single();

    if (current.error) throw current.error;

    const oldStock = Number(current.data.stock || 0);
    const qty = Number(item.qty || 0);

    if (oldStock < qty) {
      throw new Error(
        'Cloud stock conflict for ' + item.name +
        '. Cloud stock: ' + oldStock + ', sale qty: ' + qty
      );
    }

    if (!record.stockDone[String(item.barcode)]) {
      const newStock = oldStock - qty;

      const updated = await window.sbClient
        .from('products')
        .update({stock:newStock})
        .eq('id', cp.id)
        .eq('stock', oldStock)
        .select('id,stock')
        .maybeSingle();

      if (updated.error) throw updated.error;
      if (!updated.data) {
        throw new Error(
          'Cloud stock changed on another device. Sale kept locally and will retry.'
        );
      }

      /* Save the checkpoint immediately after the stock update. */
      record.stockDone[String(item.barcode)] = true;
      savePendingSales();
    }

    if (!record.movementDone[String(item.barcode)]) {
      const movement = await window.sbClient
        .from('stock_movements')
        .insert({
          product_id:cp.id,
          barcode:item.barcode,
          movement_type:'OUT',
          qty,
          note:movementNote
        });

      if (movement.error) {
        /* Stock is already marked done; retry only the movement. */
        throw movement.error;
      }

      record.movementDone[String(item.barcode)] = true;
      savePendingSales();
    }
  }

  return true;
}

async function syncPendingSales() {
  if (!window.sbClient || !pendingSales.length) return;

  /* Work oldest-first and stop on the first failure so the queue remains ordered. */
  for (const record of [...pendingSales]) {
    try {
      record.attempts = Number(record.attempts || 0) + 1;
      record.lastError = '';
      savePendingSales();

      await syncOneSale(record);
      removePendingSale(record.invoice);

      console.log('Cloud sync complete:', record.invoice);
    } catch (e) {
      record.lastError = e?.message || String(e);
      savePendingSales();
      console.warn('Pending sale sync failed:', record.invoice, e);
      break;
    }
  }
}

/* Retry pending sales when the app comes online and periodically while open. */
window.addEventListener('online', () => {
  syncPendingSales();
});

setInterval(() => {
  syncPendingSales();
}, 30000);

/* -------------------------------------------------------
   COMPLETE SALE
------------------------------------------------------- */

async function completeSale() {
  if (!cart.length) {
    return alert('Bill is empty');
  }

  const sub = cart.reduce((a,c) => {
    const p = products.find(
      x => String(x.barcode) === String(c.b)
    );

    return a + (
      p ? Number(p.sell) * Number(c.qty) : 0
    );
  },0);

  const discount = Math.max(
    0,
    Number(document.getElementById('discount')?.value) || 0
  );

  if (discount > sub) {
    return alert('Discount exceeds subtotal');
  }

  const total = sub - discount;
  const payment = document.getElementById('payment')?.value || 'CASH';
  const cash = Number(document.getElementById('cash')?.value) || 0;

  if (payment === 'CASH' && cash < total) {
    return alert('Cash received is less than total');
  }

  for (const c of cart) {
    const p = products.find(
      x => String(x.barcode) === String(c.b)
    );

    if (!p) return alert('Product not found: ' + c.b);

    if (!Number(p.sell)) {
      return alert('Selling price not set for ' + p.name);
    }

    if (Number(p.stock) < Number(c.qty)) {
      return alert(
        'Not enough stock for ' + p.name +
        '\nAvailable: ' + p.stock +
        '\nRequested: ' + c.qty
      );
    }
  }

  const items = cart.map(c => {
    const p = products.find(
      x => String(x.barcode) === String(c.b)
    );

    return {
      barcode:p.barcode,
      name:p.name,
      qty:Number(c.qty),
      cost:Number(p.cost || 0),
      sell:Number(p.sell || 0),
      total:Number(p.sell || 0) * Number(c.qty)
    };
  });

  const profit = items.reduce(
    (a,i) => a + (i.sell-i.cost)*i.qty,
    0
  ) - discount;

  const invoice = nextInvoice();
  const date = new Date().toISOString();
  const customer = document.getElementById('customer')?.value.trim() || '';
  const phone = document.getElementById('phone')?.value.trim() || '';
  const change = payment === 'CASH' ? Math.max(0,cash-total) : 0;

  const sale = {
    invoice,
    date,
    customer,
    phone,
    items,
    subtotal:sub,
    discount,
    total,
    payment,
    cash,
    change,
    profit
  };

  /* LOCAL SALE FIRST — never wait for Supabase. */
  try {
    for (const c of cart) {
      const p = products.find(
        x => String(x.barcode) === String(c.b)
      );

      if (p) {
        p.stock = Math.max(
          0,
          Number(p.stock) - Number(c.qty)
        );
      }
    }

    sales.push(sale);
    enqueueSaleForSync(sale);
    save();

    last = sale;
    cart = [];

    const clear = id => {
      const e = document.getElementById(id);
      if (e) e.value = '';
    };

    clear('discount');
    clear('cash');
    clear('customer');
    clear('phone');

    if (document.getElementById('discount')) {
      document.getElementById('discount').value = 0;
    }

    if (document.getElementById('cash')) {
      document.getElementById('cash').value = 0;
    }

    renderCart();
    renderProducts();
    renderStock();
    renderSales();
    dashboard();

    show(sale);

  } catch (e) {
    console.error('Local sale failed:',e);
    return alert(
      'Sale could not be completed.\n\n' +
      (e?.message || e)
    );
  }

  /* Try immediately, but the queue remains if it fails. */
  await syncPendingSales();
}

/* -------------------------------------------------------
   RECEIPT
------------------------------------------------------- */

function show(s) {
  if (!s) return;

  const receipt = document.getElementById('receipt');
  const modal = document.getElementById('modal');

  if (!receipt || !modal) return;

  receipt.innerHTML = `
    <div class="center">
      <b>SHASHA MOTORS POS</b><br>
      7/1A, Thambilwaththa, Makandana,<br>
      Piliyandala<br>
      Phone: 0771112344
    </div>

    <div class="hr"></div>

    <div class="line">
      <span>Invoice</span>
      <b>${esc(s.invoice)}</b>
    </div>

    <div class="line">
      <span>Date</span>
      <span>${new Date(s.date).toLocaleString()}</span>
    </div>

    ${s.customer ? `
      <div class="line">
        <span>Customer</span>
        <span>${esc(s.customer)}</span>
      </div>
    ` : ''}

    <div class="hr"></div>

    ${s.items.map(i => `
      <div>
        <b>${esc(i.name)}</b>
        <div class="line">
          <span>${i.qty} × Rs. ${m(i.sell)}</span>
          <span>Rs. ${m(i.total)}</span>
        </div>
      </div>
    `).join('')}

    <div class="hr"></div>

    <div class="line">
      <span>Subtotal</span>
      <span>Rs. ${m(s.subtotal)}</span>
    </div>

    <div class="line">
      <span>Discount</span>
      <span>Rs. ${m(s.discount)}</span>
    </div>

    <div class="line">
      <b>Grand Total</b>
      <b>Rs. ${m(s.total)}</b>
    </div>

    <div class="line">
      <span>Payment</span>
      <span>${esc(s.payment)}</span>
    </div>

    ${s.payment === 'CASH' ? `
      <div class="line">
        <span>Cash</span>
        <span>Rs. ${m(s.cash)}</span>
      </div>
      <div class="line">
        <span>Change</span>
        <span>Rs. ${m(s.change)}</span>
      </div>
    ` : ''}

    ${s.payment === 'CREDIT' ? `
      <div class="line">
        <b>Credit Due</b>
        <b>Rs. ${m(s.total)}</b>
      </div>
    ` : ''}

    <div class="hr"></div>

    <div class="center">
      Thank you! / ස්තුතියි!
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal')?.classList.add('hidden');
}

/* -------------------------------------------------------
   RECEIPT PRINT — PRINT RECEIPT ONLY
   Opens a clean print document so the POS screen, tabs,
   stock list and buttons never appear in the printout.
------------------------------------------------------- */
function getPrintableSale() {
  if (last && last.invoice) return last;

  try {
    const saved = JSON.parse(localStorage.getItem(SK) || '[]');
    if (Array.isArray(saved) && saved.length) {
      const latest = saved[saved.length - 1];
      if (latest && latest.invoice) {
        last = latest;
        return latest;
      }
    }
  } catch (e) {
    console.warn('Could not restore last sale for printing.', e);
  }

  return null;
}

function printReceipt() {
  const sale = getPrintableSale();
  if (!sale) return alert('No receipt available to print.');

  const source = document.getElementById('receipt');
  if (!source) return alert('Receipt area not found.');

  const printWindow = window.open('', '_blank', 'width=420,height=800');
  if (!printWindow) {
    return alert('Pop-up blocked. Please allow pop-ups for the POS.');
  }

  const receiptHtml = source.innerHTML;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(sale.invoice)} - SHASHA MOTORS</title>
<style>
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 80mm;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
  }
  body { padding: 3mm 3mm 4mm; }
  .receipt-print {
    width: 74mm;
    margin: 0 auto;
  }
  .center { text-align: center; }
  .hr {
    border-top: 1px dashed #000;
    margin: 3mm 0;
    height: 0;
  }
  .line {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 3mm;
    line-height: 1.45;
  }
  .line > *:last-child { text-align: right; }
  .center b { font-size: 16px; }
  .center { line-height: 1.4; }
  .line b { font-size: 12px; }
  .item-name {
    font-weight: 700;
    margin-top: 2mm;
    word-break: break-word;
  }
  @media print {
    html, body { width: 80mm; }
  }
</style>
</head>
<body>
  <div class="receipt-print">
    ${receiptHtml}
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 250);
    };
  <\/script>
</body>
</html>`);
  printWindow.document.close();
}

/* If the existing index.html still has an old window.print() button,
   redirect only the receipt-print button to the clean print window.
   No index.html edit is required. */
function installReceiptPrintHandler() {
  document.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button) return;
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('print receipt')) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      printReceipt();
    }
  }, true);
}

function pdf() {
  if (!last) return;

  if (window.html2pdf) {
    html2pdf()
      .set({
        filename:last.invoice+'.pdf',
        margin:8,
        html2canvas:{scale:2},
        jsPDF:{
          unit:'mm',
          format:'a4'
        }
      })
      .from(document.getElementById('receipt'))
      .save();
  } else {
    alert('PDF library loading. Try again.');
  }
}

async function share() {
  if (!last) return;

  const t =
`SHASHA MOTORS POS
Invoice: ${last.invoice}
Total: Rs. ${m(last.total)}
Payment: ${last.payment}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title:last.invoice,
        text:t
      });
    } catch (e) {}
  } else {
    try {
      await navigator.clipboard.writeText(t);
      alert('Copied.');
    } catch (e) {
      alert(t);
    }
  }
}

/* -------------------------------------------------------
   BARCODE
------------------------------------------------------- */

function populateBarcodeProducts() {
  const sel =
    document.getElementById('barcodeProduct');

  if (!sel) return;

  const current = sel.value;

  sel.innerHTML =
    '<option value="">Select product / භාණ්ඩය තෝරන්න</option>' +
    products.map(p => `
      <option value="${esc(p.barcode)}">
        ${esc(p.name)} — ${esc(p.barcode)} — Rs. ${m(p.sell)}
      </option>
    `).join('');

  if (
    current &&
    products.some(p => String(p.barcode) === String(current))
  ) {
    sel.value = current;
  }
}

function printBarcodes() {
  const barcode =
    document.getElementById('barcodeProduct')?.value || '';

  const qty =
    Math.max(
      1,
      Math.min(
        500,
        Number(
          document.getElementById('barcodeQty')?.value
        ) || 1
      )
    );

  const size =
    document.getElementById('barcodeSize')?.value || '50x30';

  const p =
    products.find(
      x => String(x.barcode) === String(barcode)
    );

  if (!p) {
    return setMsg(
      'barcodeMsg',
      'Please select a product / භාණ්ඩයක් තෝරන්න.',
      'err'
    );
  }

  if (!p.barcode) {
    return setMsg(
      'barcodeMsg',
      'This product has no barcode.',
      'err'
    );
  }

  if (!window.bwipjs) {
    return setMsg(
      'barcodeMsg',
      'Barcode library is still loading. Try again.',
      'warn'
    );
  }

  try {
    const canvas =
      document.createElement('canvas');

    bwipjs.toCanvas(canvas,{
      bcid:'code128',
      text:String(p.barcode),
      scale:3,
      height:14,
      includetext:false
    });

    const img =
      canvas.toDataURL('image/png');

    const [w,h] =
      size.split('x').map(Number);

    const labels =
      Array.from(
        {length:qty},
        () => `
          <div class="label">
            <div class="shop">SHASHA MOTORS</div>
            <div class="name">${esc(p.name)}</div>
            <div class="price">Rs. ${m(p.sell)}</div>
            <img src="${img}">
            <div class="code">${esc(p.barcode)}</div>
          </div>
        `
      ).join('');

    const win = window.open('','_blank');

    if (!win) {
      return setMsg(
        'barcodeMsg',
        'Pop-up blocked. Please allow pop-ups for the POS.',
        'err'
      );
    }

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>Shasha Motors Barcode Labels</title>

        <style>
          @page{
            size:${w}mm ${h}mm;
            margin:0
          }

          *{box-sizing:border-box}

          html,body{
            margin:0;
            padding:0;
            background:#fff
          }

          body{
            font-family:Arial,sans-serif
          }

          .label{
            width:${w}mm;
            height:${h}mm;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            overflow:hidden;
            padding:1.2mm;
            text-align:center;
            page-break-after:always
          }

          .shop{
            font-size:${Math.max(7,Math.round(w/6))}px;
            font-weight:700;
            line-height:1
          }

          .name{
            font-size:${Math.max(8,Math.round(w/5.5))}px;
            font-weight:700;
            max-width:100%;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            margin-top:1mm
          }

          .price{
            font-size:${Math.max(9,Math.round(w/4.5))}px;
            font-weight:700;
            margin:1mm 0
          }

          img{
            max-width:94%;
            height:auto;
            max-height:${Math.max(8,h*.42)}mm
          }

          .code{
            font-size:${Math.max(7,Math.round(w/6.5))}px;
            letter-spacing:.4px;
            margin-top:.5mm
          }
        </style>
      </head>

      <body>${labels}</body>
      </html>
    `);

    win.document.close();
    win.focus();

    setTimeout(() => win.print(),500);

    setMsg(
      'barcodeMsg',
      `✓ ${qty} barcode label(s) ready to print.`,
      'ok'
    );

  } catch(e) {
    console.error(e);

    setMsg(
      'barcodeMsg',
      'Barcode printing failed: ' + (e.message || e),
      'err'
    );
  }
}

/* -------------------------------------------------------
   BARCODE SCANNER
------------------------------------------------------- */

function scan() {
  const box = document.getElementById('reader');

  if (!box) return;

  box.classList.remove('hidden');

  if (!window.Html5Qrcode) {
    return alert('Scanner loading. Try again.');
  }

  if (scanner) {
    try {
      scanner.stop();
    } catch(e) {}
  }

  scanner = new Html5Qrcode('reader');

  scanner.start(
    {facingMode:'environment'},
    {
      fps:10,
      qrbox:{
        width:260,
        height:120
      }
    },
    code => {
      const p =
        products.find(
          x => String(x.barcode) === String(code)
        );

      if (p) {
        add(code);

        scanner.stop()
          .then(() => box.classList.add('hidden'))
          .catch(() => {});
      } else {
        alert('Barcode not found: '+code);
      }
    }
  ).catch(() => {
    box.classList.add('hidden');

    alert(
      'Camera access needs HTTPS and permission.'
    );
  });
}

/* -------------------------------------------------------
   BACKUP / RESTORE
------------------------------------------------------- */

function backup() {
  const d = {
    version:3,
    exportedAt:new Date().toISOString(),
    products,
    sales,
    invoiceNo:Number(
      localStorage.getItem(IK) || 0
    )
  };

  const a = document.createElement('a');

  a.href =
    URL.createObjectURL(
      new Blob(
        [JSON.stringify(d,null,2)],
        {type:'application/json'}
      )
    );

  a.download =
    'shasha-motors-backup-' +
    new Date().toISOString().slice(0,10) +
    '.json';

  a.click();

  setTimeout(
    () => URL.revokeObjectURL(a.href),
    1000
  );
}

function restoreBackup(e) {
  const f = e.target.files[0];

  if (!f) return;

  const r = new FileReader();

  r.onload = () => {
    try {
      const d = JSON.parse(r.result);

      if (
        !Array.isArray(d.products) ||
        !Array.isArray(d.sales)
      ) {
        throw new Error();
      }

      if (
        !confirm(
          'Restore backup? Current local data will be replaced.'
        )
      ) {
        return;
      }

      products = d.products;
      sales = d.sales;

      localStorage.setItem(
        IK,
        String(d.invoiceNo || 0)
      );

      save();

      renderProducts();
      renderStock();
      renderSales();
      dashboard();
      populateBarcodeProducts();

      alert(
        'Backup restored locally. Cloud database was not changed.'
      );

    } catch(x) {
      alert('Invalid backup file');
    }
  };

  r.readAsText(f);
  e.target.value = '';
}

/* -------------------------------------------------------
   START POS
------------------------------------------------------- */

document.getElementById('discount')?.addEventListener(
  'input',
  renderCart
);

document.getElementById('cash')?.addEventListener(
  'input',
  renderCart
);

document.getElementById('payment')?.addEventListener(
  'change',
  renderCart
);

installReceiptPrintHandler();

renderProducts();
renderCart();
renderStock();
renderSales();
dashboard();
populateBarcodeProducts();

/*
 IMPORTANT:
 We intentionally DO NOT call loadProductsFromSupabase() automatically.
 Your existing local 442-product catalogue stays untouched.

 Pending local sales are synced to Supabase in the background.
*/
syncPendingSales();
