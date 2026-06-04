const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Unauthenticated');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    const msg = Array.isArray(detail)
      ? detail.map(d => d.msg || JSON.stringify(d)).join('; ')
      : (typeof detail === 'string' ? detail : `Request failed: ${res.status}`);
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

// ── Field normalizers ────────────────────────────────────────────────────────

function normalizeJob(j) {
  if (!j) return j;
  const totalEx = parseFloat(j.total_ex ?? j.subtotal ?? 0);
  const totalInc = parseFloat(j.total_inc ?? j.total ?? 0);
  const tax = parseFloat(j.tax ?? (totalInc - totalEx) ?? 0);
  const rawItems = j.items ?? [];
  const cost = rawItems
    .filter(i => (i.display_type ?? i.displayType ?? 'product') === 'product')
    .reduce((s, i) => s + parseFloat(i.purchase_price ?? i.purchasePrice ?? 0) * (i.qty ?? 0), 0);
  const marginTotal = totalEx - cost;
  const marginPct = totalEx > 0 ? Math.round((marginTotal / totalEx) * 100) : 0;
  return {
    id: j.id,
    customer: j.customer_name ?? j.customer,
    customerId: j.customer_id ?? j.customerId,
    status: j.status,
    invoice: j.invoice,
    dateIn: j.date_in ?? j.dateIn,
    due: j.due,
    out: j.out,
    quote: j.quote,
    priority: j.priority,
    type: j.type,
    assignedTo: j.assigned_to ?? j.assignedTo,
    subtotal: totalEx,
    tax: tax,
    total: totalInc,
    invoicePaid: parseFloat(j.deposit ?? j.invoicePaid ?? 0),
    balanceDue: parseFloat(j.balance_due ?? j.balanceDue ?? 0),
    paymentMethod: j.payment_method ?? j.paymentMethod ?? 'Account',
    shippingAddress: j.shipping_address ?? j.shippingAddress ?? '',
    notes: j.notes,
    // Jim2 fields
    custRef: j.cust_ref ?? j.custRef ?? '',
    ourRef: j.our_ref ?? j.ourRef ?? '',
    description: j.description ?? '',
    shipTo: j.ship_to ?? j.shipTo ?? '',
    projectNo: j.project_no ?? j.projectNo ?? '',
    serialNo: j.serial_no ?? j.serialNo ?? '',
    nameContact: j.name_contact ?? j.nameContact ?? '',
    // ERP enhancement fields
    paymentStatus: j.payment_status ?? j.paymentStatus ?? 'unpaid',
    commitmentDate: j.commitment_date ?? j.commitmentDate ?? '',
    validityDate: j.validity_date ?? j.validityDate ?? '',
    locked: j.locked ?? false,
    invoiceStatus: j.invoice_status ?? j.invoiceStatus ?? 'not_invoiced',
    proofStatus: j.proof_status ?? j.proofStatus ?? 'none',
    proofNotes: j.proof_notes ?? j.proofNotes ?? '',
    // Production / dispatch fields
    branch: j.branch ?? 'HQ',
    shipToId: j.ship_to_id ?? j.shipToId ?? null,
    weightTotal: parseFloat(j.weight_total ?? j.weightTotal ?? 0),
    fuelLevy: parseFloat(j.fuel_levy ?? j.fuelLevy ?? 0),
    totalInc: parseFloat(j.total_inc ?? j.total ?? 0),
    // Derived margin (sell revenue ex GST minus product cost)
    cost,
    marginTotal,
    marginPct,
    items: rawItems.map(normalizeJobItem),
    comments: (j.comments ?? []).map(normalizeComment),
  };
}

function normalizeJobItem(i) {
  return {
    id: i.id,
    sort: i.sort ?? 0,
    displayType: i.display_type ?? i.displayType ?? 'product',
    description: i.description,
    sizes: i.sizes,
    stockCode: i.stock_code ?? i.stockCode,
    decorationType: i.decoration_type ?? i.decorationType ?? 'None',
    embCode: i.emb_code ?? i.embCode ?? '',
    trsCode: i.trs_code ?? i.trsCode ?? '',
    stitchCount: i.stitch_count ?? i.stitchCount ?? '',
    colorCount: i.color_count ?? i.colorCount ?? '',
    decPosition: i.dec_position ?? i.decPosition ?? '',
    order: i.order_qty ?? i.order ?? 0,
    supply: i.supply_qty ?? i.supply ?? 0,
    qty: i.qty ?? 0,
    bOrd: i.b_ord ?? i.bOrd ?? 0,
    qtyPick: i.qty_pick ?? i.qtyPick ?? 0,
    qtyDelivered: i.qty_delivered ?? i.qtyDelivered ?? 0,
    qtyInvoiced: i.qty_invoiced ?? i.qtyInvoiced ?? 0,
    purchasePrice: parseFloat(i.purchase_price ?? i.purchasePrice ?? 0),
    margin: parseFloat(i.margin ?? 0),
    marginPercent: parseFloat(i.margin_percent ?? i.marginPercent ?? 0),
    discount: parseFloat(i.discount ?? 0),
    priceEx: parseFloat(i.price_ex ?? i.priceEx ?? 0),
    priceInc: parseFloat(i.price_inc ?? i.priceInc ?? 0),
    total: parseFloat(i.total ?? 0),
    hide: i.hide ?? false,
    taxType: i.tax_type ?? i.taxType ?? '',
    itemStatus: i.item_status ?? i.itemStatus ?? '',
    poNo: i.po_no ?? i.poNo ?? '',
    poDue: i.po_due ?? i.poDue ?? '',
    weightKg: parseFloat(i.weight_kg ?? i.weightKg ?? 0),
  };
}

function normalizeComment(c) {
  return {
    id: c.id,
    date: c.date,
    time: c.time,
    initials: c.initials,
    authorName: c.author_name ?? c.authorName ?? '',
    status: c.status,
    inc: c.inc ?? false,
    isInternal: c.is_internal ?? c.isInternal ?? false,
    pinnedAt: c.pinned_at ?? c.pinnedAt ?? null,
    comment: c.comment,
  };
}

function normalizeInventory(i) {
  return {
    sku: i.sku,
    name: i.name,
    category: i.category,
    supplier: i.supplier,
    stock: i.stock ?? 0,
    committed_qty: i.committed_qty ?? 0,
    weight_kg: parseFloat(i.weight_kg ?? 0),
    reorderLevel: i.min_stock ?? i.reorderLevel ?? 0,
    unitCost: parseFloat(i.unit_cost ?? i.unitCost ?? 0),
    unitPrice: parseFloat(i.sell_price ?? i.unitPrice ?? 0),
    location: i.location,
    status: i.status,
  };
}

function normalizeCustomer(c) {
  return {
    id: c.id,
    name: c.name,
    contact: c.contact,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    address: c.address,
    abn: c.abn,
    accountType: c.account_type ?? c.accountType,
    paymentTerms: c.payment_terms ?? c.paymentTerms ?? 'Net 30',
    creditLimit: parseFloat(c.credit_limit ?? c.creditLimit ?? 0),
    balance: parseFloat(c.balance ?? 0),
    totalSpent: parseFloat(c.ytd_sales ?? c.totalSpent ?? 0),
    accountManager: c.account_manager ?? c.accountManager,
    status: c.status,
  };
}

function normalizeSupplier(s) {
  return {
    code: s.id,
    name: s.name,
    contact: s.contact,
    email: s.email,
    phone: s.phone,
    address: s.address,
    paymentTerms: s.payment_terms ?? s.paymentTerms,
    currency: s.currency,
    status: s.status,
  };
}

function normalizePO(p) {
  return {
    id: p.id,
    supplier: p.supplier_name ?? p.supplier,
    supplierCode: p.supplier_id ?? p.supplierCode,
    status: p.status,
    date: p.order_date ?? p.date,
    expectedDate: p.expected_date ?? p.expectedDate,
    total: parseFloat(p.total ?? 0),
    notes: p.notes,
    items: (p.items ?? []).map(i => ({
      id: i.id,
      sku: i.sku,
      description: i.description,
      qtyOrdered: i.qty_ordered ?? i.qtyOrdered ?? 0,
      qtyReceived: i.qty_received ?? i.qtyReceived ?? 0,
      unitCost: parseFloat(i.unit_cost ?? i.unitCost ?? 0),
      total: parseFloat(i.total ?? 0),
    })),
  };
}

function normalizeMovement(m) {
  return {
    id: m.id,
    sku: m.sku,
    date: m.date,
    type: m.type,
    quantity: m.quantity,
    reference: m.reference,
    notes: m.notes,
  };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),

  verify2fa: (code) =>
    request('/auth/verify-2fa', { method: 'POST', body: { code } }),

  setup2fa: () => request('/auth/setup-2fa', { method: 'POST' }),

  confirm2fa: (code) =>
    request('/auth/confirm-2fa', { method: 'POST', body: { code } }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  me: () => request('/users/me'),

  changePassword: (current_password, new_password) =>
    request('/auth/change-password', { method: 'POST', body: { current_password, new_password } }),
};

// ── Jobs ─────────────────────────────────────────────────────────────────────

export const jobs = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/jobs${q ? `?${q}` : ''}`).then(r => r.map(normalizeJob));
  },

  get: (id) => request(`/jobs/${id}`).then(normalizeJob),

  nextId: () => request('/jobs/next-id'),

  create: (data) => request('/jobs', { method: 'POST', body: {
    customer_id: data.customerId,
    customer_name: data.customer,
    status: data.status || 'QUOTE',
    invoice: data.invoice,
    date_in: data.dateIn,
    due: data.due,
    out: data.out,
    quote: data.quote,
    priority: data.priority || 'Normal',
    type: data.type || 'Normal',
    assigned_to: data.assignedTo,
    payment_method: data.paymentMethod || 'Account',
    shipping_address: data.shippingAddress,
    notes: data.notes,
    total_ex: data.subtotal || 0,
    tax: data.tax || 0,
    total_inc: data.total || 0,
    deposit: data.invoicePaid || 0,
    balance_due: data.balanceDue || 0,
    // Jim2 fields
    cust_ref: data.custRef,
    our_ref: data.ourRef,
    description: data.description,
    ship_to: data.shipTo,
    project_no: data.projectNo,
    serial_no: data.serialNo,
    name_contact: data.nameContact,
    // ERP enhancement fields
    payment_status: data.paymentStatus || 'unpaid',
    commitment_date: data.commitmentDate || null,
    validity_date: data.validityDate || null,
    locked: data.locked || false,
    invoice_status: data.invoiceStatus || 'not_invoiced',
    proof_status: data.proofStatus || 'none',
    proof_notes: data.proofNotes || null,
    // Production fields
    branch: data.branch || 'HQ',
    ship_to_id: data.shipToId || null,
    fuel_levy: data.fuelLevy || 0,
    items: (data.items || []).map((i, idx) => ({
      sort: idx,
      display_type: i.displayType || 'product',
      description: i.description,
      sizes: i.sizes,
      stock_code: i.stockCode,
      decoration_type: i.decorationType || 'None',
      emb_code: i.embCode || '',
      trs_code: i.trsCode || '',
      stitch_count: i.stitchCount ? parseInt(i.stitchCount) : null,
      color_count: i.colorCount ? parseInt(i.colorCount) : null,
      dec_position: i.decPosition || '',
      order_qty: i.order || 0,
      supply_qty: i.supply || 0,
      qty: i.qty || 0,
      b_ord: i.bOrd || 0,
      qty_pick: i.qtyPick || 0,
      qty_delivered: i.qtyDelivered || 0,
      qty_invoiced: i.qtyInvoiced || 0,
      weight_kg: i.weightKg || 0,
      purchase_price: i.purchasePrice || 0,
      margin: i.margin || 0,
      margin_percent: i.marginPercent || 0,
      discount: i.discount || 0,
      price_ex: i.priceEx || 0,
      price_inc: i.priceInc || 0,
      total: i.total || 0,
      hide: i.hide || false,
      tax_type: i.taxType || '',
      item_status: i.itemStatus || '',
      po_no: i.poNo || '',
      po_due: i.poDue || '',
    })),
  }}).then(normalizeJob),

  update: (id, data) => request(`/jobs/${id}`, { method: 'PATCH', body: {
    customer_id: data.customerId,
    customer_name: data.customer,
    date_in: data.dateIn,
    type: data.type,
    quote: data.quote,
    status: data.status,
    priority: data.priority,
    assigned_to: data.assignedTo,
    due: data.due,
    out: data.out,
    notes: data.notes,
    payment_method: data.paymentMethod,
    shipping_address: data.shippingAddress,
    invoice: data.invoice,
    total_ex: data.subtotal,
    tax: data.tax,
    total_inc: data.total,
    balance_due: data.balanceDue,
    cust_ref: data.custRef,
    our_ref: data.ourRef,
    description: data.description,
    ship_to: data.shipTo,
    project_no: data.projectNo,
    serial_no: data.serialNo,
    name_contact: data.nameContact,
    payment_status: data.paymentStatus,
    commitment_date: data.commitmentDate || null,
    validity_date: data.validityDate || null,
    locked: data.locked,
    invoice_status: data.invoiceStatus,
    proof_status: data.proofStatus,
    proof_notes: data.proofNotes || null,
    // Production fields
    branch: data.branch,
    ship_to_id: data.shipToId ?? undefined,
    fuel_levy: data.fuelLevy,
    items: data.items ? data.items.map((i, idx) => ({
      sort: idx,
      display_type: i.displayType || 'product',
      description: i.description,
      sizes: i.sizes,
      stock_code: i.stockCode,
      decoration_type: i.decorationType || 'None',
      emb_code: i.embCode || '',
      trs_code: i.trsCode || '',
      stitch_count: i.stitchCount ? parseInt(i.stitchCount) : null,
      color_count: i.colorCount ? parseInt(i.colorCount) : null,
      dec_position: i.decPosition || '',
      order_qty: i.order || 0,
      supply_qty: i.supply || 0,
      qty: i.qty || 0,
      b_ord: i.bOrd || 0,
      qty_pick: i.qtyPick || 0,
      qty_delivered: i.qtyDelivered || 0,
      qty_invoiced: i.qtyInvoiced || 0,
      weight_kg: i.weightKg || 0,
      purchase_price: i.purchasePrice || 0,
      margin: i.margin || 0,
      margin_percent: i.marginPercent || 0,
      discount: i.discount || 0,
      price_ex: i.priceEx || 0,
      price_inc: i.priceInc || 0,
      total: i.total || 0,
      hide: i.hide || false,
      tax_type: i.taxType || '',
      item_status: i.itemStatus || '',
      po_no: i.poNo || '',
      po_due: i.poDue || '',
    })) : undefined,
  }}).then(normalizeJob),

  updateStatus: (id, status) =>
    request(`/jobs/${id}/status`, { method: 'POST', body: { status } }).then(normalizeJob),

  patchDue: (id, due) =>
    request(`/jobs/${id}`, { method: 'PATCH', body: { due } }).then(normalizeJob),

  addComment: (id, comment, isInternal = false) =>
    request(`/jobs/${id}/comments`, { method: 'POST', body: { comment, is_internal: isInternal } }),

  toggleLock: (id, locked) =>
    request(`/jobs/${id}/lock`, { method: 'POST', body: { locked } }).then(normalizeJob),

  recordPayment: (id, amount, method) =>
    request(`/jobs/${id}/payment`, { method: 'POST', body: { amount, method } }).then(normalizeJob),

  orderRequirements: (type = 'garment') =>
    request(`/jobs/order-requirements?type=${type}`),

  dispatch: (id, data) =>
    request(`/jobs/${id}/dispatch`, { method: 'POST', body: {
      ship_via: data.shipVia,
      ship_ref: data.shipRef,
      cartons: data.cartons || 1,
      notes: data.notes || null,
      advance_status: data.advanceStatus || false,
    }}).then(normalizeJob),

  unprint: (id) =>
    request(`/jobs/${id}/unprint`, { method: 'POST' }).then(normalizeJob),

  salesRegister: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/jobs/sales-register${q ? `?${q}` : ''}`).then(r => ({
      jobs: r.jobs.map(normalizeJob),
      summary: r.summary,
    }));
  },

  delete: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
};

// ── Inventory ────────────────────────────────────────────────────────────────

export const inventory = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/inventory${q ? `?${q}` : ''}`).then(r => r.map(normalizeInventory));
  },

  get: (sku) => request(`/inventory/${sku}`).then(normalizeInventory),

  create: (data) => request('/inventory', { method: 'POST', body: {
    sku: data.sku,
    name: data.name,
    category: data.category,
    supplier: data.supplier,
    stock: data.stock || 0,
    min_stock: data.reorderLevel || 0,
    unit_cost: data.unitCost || 0,
    sell_price: data.unitPrice || 0,
    location: data.location,
    status: data.status || 'Active',
  }}).then(normalizeInventory),

  update: (sku, data) => request(`/inventory/${sku}`, { method: 'PATCH', body: {
    name: data.name,
    category: data.category,
    supplier: data.supplier,
    min_stock: data.reorderLevel,
    unit_cost: data.unitCost,
    sell_price: data.unitPrice,
    location: data.location,
    status: data.status,
  }}).then(normalizeInventory),

  adjust: (sku, adjustment, reason) =>
    request(`/inventory/${sku}/adjust`, { method: 'POST', body: { adjustment, reason } }).then(normalizeInventory),

  movements: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/inventory/movements${q ? `?${q}` : ''}`).then(r => r.map(normalizeMovement));
  },

  autoReorder: () => request('/inventory/auto-reorder', { method: 'POST' }),

  transfer: (data) =>
    request('/inventory/transfer', { method: 'POST', body: {
      from_sku: data.fromSku,
      to_sku: data.toSku || null,
      quantity: data.quantity,
      from_location: data.fromLocation || null,
      to_location: data.toLocation || null,
      reference: data.reference || null,
      notes: data.notes || null,
    }}),

  stocktake: (items, reference, method = 'Informed') =>
    request('/inventory/stocktake', { method: 'POST', body: {
      reference: reference || null,
      method,
      items: items.map(i => ({ sku: i.sku, counted_qty: i.countedQty, notes: i.notes || null })),
    }}),

  stockFlow: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/inventory/stock-flow${q ? `?${q}` : ''}`);
  },

  delete: (sku) => request(`/inventory/${sku}`, { method: 'DELETE' }),
};

// ── AI Assistant ─────────────────────────────────────────────────────────────

export const ai = {
  chat: (message, context) =>
    request('/ai/chat', { method: 'POST', body: { message, context } }),
  status: () => request('/ai/status'),
};

// ── Customers ────────────────────────────────────────────────────────────────

export const customers = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/customers${q ? `?${q}` : ''}`).then(r => r.map(normalizeCustomer));
  },

  create: (data) => request('/customers', { method: 'POST', body: {
    id: data.id || `CUST${Date.now()}`,
    name: data.name,
    contact: data.contact,
    email: data.email,
    phone: data.phone,
    mobile: data.mobile,
    address: data.address,
    abn: data.abn,
    account_type: data.accountType || 'Account',
    payment_terms: data.paymentTerms || 'Net 30',
    credit_limit: data.creditLimit || 0,
    account_manager: data.accountManager,
    status: 'Active',
  }}).then(normalizeCustomer),

  update: (id, data) => request(`/customers/${id}`, { method: 'PATCH', body: {
    name: data.name,
    contact: data.contact,
    email: data.email,
    phone: data.phone,
    mobile: data.mobile,
    address: data.address,
    abn: data.abn,
    account_type: data.accountType,
    payment_terms: data.paymentTerms,
    credit_limit: data.creditLimit,
    account_manager: data.accountManager,
    status: data.status,
  }}).then(normalizeCustomer),

  delete: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
};

// ── Suppliers ────────────────────────────────────────────────────────────────

export const suppliers = {
  list: () => request('/suppliers').then(r => r.map(normalizeSupplier)),

  create: (data) => request('/suppliers', { method: 'POST', body: {
    id: data.code || `SUP${Date.now()}`,
    name: data.name,
    contact: data.contact,
    email: data.email,
    phone: data.phone,
    address: data.address,
    payment_terms: data.paymentTerms,
    currency: data.currency || 'AUD',
    status: data.status || 'Active',
  }}).then(normalizeSupplier),

  update: (code, data) => request(`/suppliers/${code}`, { method: 'PATCH', body: {
    name: data.name,
    contact: data.contact,
    email: data.email,
    phone: data.phone,
    address: data.address,
    payment_terms: data.paymentTerms,
    currency: data.currency,
    status: data.status,
  }}).then(normalizeSupplier),

  delete: (id) => request(`/suppliers/${id}`, { method: 'DELETE' }),
};

// ── Purchase Orders ───────────────────────────────────────────────────────────

export const purchaseOrders = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/purchase-orders${q ? `?${q}` : ''}`).then(r => r.map(normalizePO));
  },

  create: (data) => request('/purchase-orders', { method: 'POST', body: {
    id: data.id || `PO-${Date.now()}`,
    supplier_id: data.supplierCode,
    supplier_name: data.supplier,
    status: 'Draft',
    order_date: data.date,
    expected_date: data.expectedDate,
    notes: data.notes,
    items: (data.items || []).map(i => ({
      sku: i.sku,
      description: i.description,
      qty_ordered: i.quantity || i.qtyOrdered || 0,
      unit_cost: i.unitPrice || i.unitCost || 0,
      total: i.total || 0,
    })),
  }}).then(normalizePO),

  updateStatus: (id, status) =>
    request(`/purchase-orders/${id}`, { method: 'PATCH', body: { status } }).then(normalizePO),

  receive: (id, items) =>
    request(`/purchase-orders/${id}/receive`, { method: 'POST', body: { items } }).then(normalizePO),

  createFromRequirements: (data) => request('/purchase-orders/from-requirements', { method: 'POST', body: {
    id: data.id,
    supplier_id: data.supplierCode || null,
    supplier_name: data.supplier || null,
    expected_date: data.expectedDate || null,
    notes: data.notes || null,
    requirements: data.requirements,
  }}).then(normalizePO),

  nextId: () => request('/purchase-orders/next-id'),

  fromBackOrders: (data) => request('/purchase-orders/from-back-orders', { method: 'POST', body: {
    id: data.id,
    supplier_id: data.supplierCode || null,
    supplier_name: data.supplier || null,
    expected_date: data.expectedDate || null,
    notes: data.notes || null,
    items: (data.items || []).map(i => ({
      sku: i.sku,
      description: i.description,
      qty: i.qty,
      unit_cost: i.unitCost,
      job_ids: i.jobIds || [],
    })),
  }}).then(normalizePO),

  delete: (id) => request(`/purchase-orders/${id}`, { method: 'DELETE' }),
};

// ── Supplier Price Lists ──────────────────────────────────────────────────────

export const supplierPriceLists = {
  list: (supplierId) => request(`/suppliers/${supplierId}/price-list`),

  create: (supplierId, data) => request(`/suppliers/${supplierId}/price-list`, { method: 'POST', body: {
    sku: data.sku,
    description: data.description,
    unit_cost: data.unitCost,
    min_qty: data.minQty || 1,
    currency: data.currency || 'AUD',
    lead_time_days: data.leadTimeDays || null,
    valid_from: data.validFrom || null,
    valid_to: data.validTo || null,
    notes: data.notes || null,
  }}),

  update: (supplierId, itemId, data) => request(`/suppliers/${supplierId}/price-list/${itemId}`, { method: 'PATCH', body: {
    description: data.description,
    unit_cost: data.unitCost,
    min_qty: data.minQty,
    currency: data.currency,
    lead_time_days: data.leadTimeDays,
    valid_from: data.validFrom,
    valid_to: data.validTo,
    notes: data.notes,
  }}),

  delete: (supplierId, itemId) => request(`/suppliers/${supplierId}/price-list/${itemId}`, { method: 'DELETE' }),
};

// ── Goods Receipts ────────────────────────────────────────────────────────────

function normalizeGR(gr) {
  return {
    id: gr.id,
    poId: gr.po_id,
    supplierId: gr.supplier_id,
    supplierName: gr.supplier_name,
    receivedDate: gr.received_date,
    reference: gr.reference,
    status: gr.status,
    notes: gr.notes,
    createdBy: gr.created_by,
    createdAt: gr.created_at,
    lines: (gr.lines || []).map(ln => ({
      id: ln.id,
      sku: ln.sku,
      description: ln.description,
      qtyExpected: ln.qty_expected || 0,
      qtyReceived: ln.qty_received || 0,
      unitCost: parseFloat(ln.unit_cost || 0),
      condition: ln.condition || 'Good',
      notes: ln.notes,
    })),
  };
}

export const goodsReceipts = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/goods-receipts${q ? `?${q}` : ''}`).then(r => r.map(normalizeGR));
  },

  get: (id) => request(`/goods-receipts/${id}`).then(normalizeGR),

  create: (data) => request('/goods-receipts', { method: 'POST', body: {
    po_id: data.poId || null,
    supplier_id: data.supplierId || null,
    supplier_name: data.supplierName || null,
    received_date: data.receivedDate,
    reference: data.reference || null,
    notes: data.notes || null,
    lines: (data.lines || []).map(ln => ({
      sku: ln.sku,
      description: ln.description || null,
      qty_expected: ln.qtyExpected || 0,
      qty_received: ln.qtyReceived || 0,
      unit_cost: ln.unitCost || 0,
      condition: ln.condition || 'Good',
      notes: ln.notes || null,
    })),
  }}).then(normalizeGR),

  update: (id, data) => request(`/goods-receipts/${id}`, { method: 'PATCH', body: {
    status: data.status,
    reference: data.reference,
    notes: data.notes,
    received_date: data.receivedDate,
  }}).then(normalizeGR),

  accept: (id) => request(`/goods-receipts/${id}/accept`, { method: 'POST' }).then(normalizeGR),
  reject: (id) => request(`/goods-receipts/${id}/reject`, { method: 'POST' }).then(normalizeGR),
  delete: (id) => request(`/goods-receipts/${id}`, { method: 'DELETE' }),
};

// ── Open Freight ─────────────────────────────────────────────────────────────

function normalizeParcel(p) {
  return {
    id: p.id,
    name: p.name,
    parcelType: p.parcel_type ?? '',
    service: p.service ?? '',
    carrierCode: p.carrier_code ?? '',
    maxWeightKg: parseFloat(p.max_weight_kg ?? 0),
    lengthCm: parseFloat(p.length_cm ?? 0),
    widthCm: parseFloat(p.width_cm ?? 0),
    heightCm: parseFloat(p.height_cm ?? 0),
    rate: parseFloat(p.rate ?? 0),
    notes: p.notes ?? '',
  };
}

function normalizeAccount(a) {
  return {
    accountNumber: a.account_number ?? '',
    accountName: a.account_name ?? '',
    depot: a.depot ?? '',
    contactName: a.contact_name ?? '',
    contactPhone: a.contact_phone ?? '',
    contactEmail: a.contact_email ?? '',
    apiKeySet: a.api_key_set ?? false,
    apiKey: '',
    notes: a.notes ?? '',
  };
}

export const openFreight = {
  getAccount: () => request('/open-freight/account').then(normalizeAccount),

  saveAccount: (data) => request('/open-freight/account', { method: 'PUT', body: {
    account_number: data.accountNumber,
    account_name: data.accountName,
    depot: data.depot,
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
    contact_email: data.contactEmail,
    ...(data.apiKey ? { api_key: data.apiKey } : {}),
    notes: data.notes,
  }}).then(normalizeAccount),

  listParcels: () => request('/open-freight/parcels').then(r => r.map(normalizeParcel)),

  createParcel: (data) => request('/open-freight/parcels', { method: 'POST', body: {
    name: data.name,
    parcel_type: data.parcelType,
    service: data.service,
    carrier_code: data.carrierCode,
    max_weight_kg: data.maxWeightKg || null,
    length_cm: data.lengthCm || null,
    width_cm: data.widthCm || null,
    height_cm: data.heightCm || null,
    rate: data.rate || null,
    notes: data.notes,
  }}).then(normalizeParcel),

  updateParcel: (id, data) => request(`/open-freight/parcels/${id}`, { method: 'PATCH', body: {
    name: data.name,
    parcel_type: data.parcelType,
    service: data.service,
    carrier_code: data.carrierCode,
    max_weight_kg: data.maxWeightKg || null,
    length_cm: data.lengthCm || null,
    width_cm: data.widthCm || null,
    height_cm: data.heightCm || null,
    rate: data.rate || null,
    notes: data.notes,
  }}).then(normalizeParcel),

  deleteParcel: (id) => request(`/open-freight/parcels/${id}`, { method: 'DELETE' }),
};

// ── Card Files ────────────────────────────────────────────────────────────────

function normalizeCardFile(c) {
  return {
    shipCode: c.ship_code,
    customerCode: c.customer_code,
    group: (c.ship_code || '').split('.')[0],
    companyName: c.company_name ?? '',
    contactName: c.contact_name ?? '',
    address1: c.address1 ?? '',
    address2: c.address2 ?? '',
    suburb: c.suburb ?? '',
    state: c.state ?? '',
    postcode: c.postcode ?? '',
    country: c.country ?? 'AU',
    phone: c.phone ?? '',
    email: c.email ?? '',
    notes: c.notes ?? '',
    createdAt: c.created_at,
  };
}

export const cardFiles = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/card-files${q ? `?${q}` : ''}`).then(r => r.map(normalizeCardFile));
  },

  get: (shipCode) => request(`/card-files/${encodeURIComponent(shipCode)}`).then(normalizeCardFile),

  create: (data) => request('/card-files', { method: 'POST', body: {
    ship_code: data.shipCode,
    customer_code: data.customerCode,
    company_name: data.companyName,
    contact_name: data.contactName,
    address1: data.address1,
    address2: data.address2,
    suburb: data.suburb,
    state: data.state,
    postcode: data.postcode,
    country: data.country || 'AU',
    phone: data.phone,
    email: data.email,
    notes: data.notes,
  }}).then(normalizeCardFile),

  update: (shipCode, data) => request(`/card-files/${encodeURIComponent(shipCode)}`, { method: 'PATCH', body: {
    customer_code: data.customerCode,
    company_name: data.companyName,
    contact_name: data.contactName,
    address1: data.address1,
    address2: data.address2,
    suburb: data.suburb,
    state: data.state,
    postcode: data.postcode,
    country: data.country,
    phone: data.phone,
    email: data.email,
    notes: data.notes,
  }}).then(normalizeCardFile),

  delete: (shipCode) => request(`/card-files/${encodeURIComponent(shipCode)}`, { method: 'DELETE' }),
};

// ── Reports ───────────────────────────────────────────────────────────────────

export const reports = {
  salesSummary: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/sales-summary${q ? `?${q}` : ''}`);
  },
  gst: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/gst${q ? `?${q}` : ''}`);
  },
  agedReceivables: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/aged-receivables${q ? `?${q}` : ''}`);
  },
  inventoryValuation: () => request('/reports/inventory-valuation'),
  jobProfitability: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/job-profitability${q ? `?${q}` : ''}`);
  },
  onTimeDelivery: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/on-time-delivery${q ? `?${q}` : ''}`);
  },
  backOrders: () => request('/reports/back-orders'),
  decorationPerformance: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/decoration-performance${q ? `?${q}` : ''}`);
  },
  agedPayables: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/aged-payables${q ? `?${q}` : ''}`);
  },
  customerStatement: (customerId, params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/reports/customers/${customerId}/statement${q ? `?${q}` : ''}`);
  },
};

// ── Accounts Payable ──────────────────────────────────────────────────────────

function normalizeBill(b) {
  return {
    id: b.id,
    supplierId: b.supplier_id,
    supplierName: b.supplier_name ?? '',
    poId: b.po_id,
    billNumber: b.bill_number ?? '',
    billDate: b.bill_date ?? '',
    dueDate: b.due_date ?? '',
    description: b.description ?? '',
    amountEx: parseFloat(b.amount_ex ?? 0),
    tax: parseFloat(b.tax ?? 0),
    amountInc: parseFloat(b.amount_inc ?? 0),
    status: b.status ?? 'pending',
    paidDate: b.paid_date ?? '',
    paidAmount: parseFloat(b.paid_amount ?? 0),
    notes: b.notes ?? '',
    createdAt: b.created_at,
  };
}

export const supplierBills = {
  list: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return request(`/ap/bills${q ? `?${q}` : ''}`).then(r => r.map(normalizeBill));
  },

  get: (id) => request(`/ap/bills/${id}`).then(normalizeBill),

  create: (data) => request('/ap/bills', { method: 'POST', body: {
    supplier_id: data.supplierId || null,
    supplier_name: data.supplierName || null,
    po_id: data.poId || null,
    bill_number: data.billNumber || null,
    bill_date: data.billDate || null,
    due_date: data.dueDate || null,
    description: data.description || null,
    amount_ex: data.amountEx || 0,
    tax: data.tax || 0,
    amount_inc: data.amountInc || 0,
    status: data.status || 'pending',
    notes: data.notes || null,
  }}).then(normalizeBill),

  update: (id, data) => request(`/ap/bills/${id}`, { method: 'PATCH', body: {
    supplier_id: data.supplierId,
    supplier_name: data.supplierName,
    po_id: data.poId,
    bill_number: data.billNumber,
    bill_date: data.billDate,
    due_date: data.dueDate,
    description: data.description,
    amount_ex: data.amountEx,
    tax: data.tax,
    amount_inc: data.amountInc,
    status: data.status,
    notes: data.notes,
  }}).then(normalizeBill),

  pay: (id, paidAmount, paidDate) => request(`/ap/bills/${id}/pay`, { method: 'POST', body: {
    paid_amount: paidAmount,
    paid_date: paidDate || null,
  }}).then(normalizeBill),

  delete: (id) => request(`/ap/bills/${id}`, { method: 'DELETE' }),

  summary: () => request('/ap/summary'),
};

// ── Email ─────────────────────────────────────────────────────────────────────

export const email = {
  send: (data) => request('/email/send', { method: 'POST', body: data }),
  log: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/email/log${q ? `?${q}` : ''}`);
  },
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const settings = {
  getCompany: () => request('/settings/company'),
  updateCompany: (data) => request('/settings/company', { method: 'PUT', body: data }),
  testSmtp: () => request('/settings/smtp-test', { method: 'POST' }),
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = {
  list: () => request('/users'),
  create: (data) => request('/users', { method: 'POST', body: data }),
  update: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: data }),
  delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id, newPassword) => request(`/users/${id}/reset-password`, { method: 'POST', body: { new_password: newPassword } }),
};

// ── Data Import ───────────────────────────────────────────────────────────────

async function uploadCSV(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Unauthenticated');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

// ── Styles / Variant Matrix ───────────────────────────────────────────────────

export const styles = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.category) q.set('category', params.category);
    if (params.brand) q.set('brand', params.brand);
    if (params.season) q.set('season', params.season);
    if (params.active_only === false) q.set('active_only', 'false');
    return request(`/styles?${q}`);
  },
  meta: () => request('/styles/meta'),
  get: (id) => request(`/styles/${id}`),
  create: (data) => request('/styles', { method: 'POST', body: data }),
  update: (id, data) => request(`/styles/${id}`, { method: 'PUT', body: data }),
  delete: (id) => request(`/styles/${id}`, { method: 'DELETE' }),
  generateSkus: (id) => request(`/styles/${id}/generate-skus`, { method: 'POST' }),
};

export const importData = {
  preview: (file) => uploadCSV('/import/preview', file),
  customers: (file) => uploadCSV('/import/customers', file),
  suppliers: (file) => uploadCSV('/import/suppliers', file),
  inventory: (file) => uploadCSV('/import/inventory', file),
  jobs: (file) => uploadCSV('/import/jobs', file),
  cardFiles: (file) => uploadCSV('/import/card-files', file),
  templateUrl: (entity) => `${BASE}/import/template/${entity}`,
};
