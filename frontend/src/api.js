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
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Field normalizers ────────────────────────────────────────────────────────

function normalizeJob(j) {
  if (!j) return j;
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
    subtotal: parseFloat(j.total_ex ?? j.subtotal ?? 0),
    tax: parseFloat(j.tax ?? 0),
    total: parseFloat(j.total_inc ?? j.total ?? 0),
    invoicePaid: parseFloat(j.deposit ?? j.invoicePaid ?? 0),
    balanceDue: parseFloat(j.balance_due ?? j.balanceDue ?? 0),
    paymentMethod: j.payment_method ?? j.paymentMethod ?? 'Account',
    shippingAddress: j.shipping_address ?? j.shippingAddress ?? '',
    notes: j.notes,
    items: (j.items ?? []).map(normalizeJobItem),
    comments: (j.comments ?? []).map(normalizeComment),
  };
}

function normalizeJobItem(i) {
  return {
    id: i.id,
    description: i.description,
    sizes: i.sizes,
    stockCode: i.stock_code ?? i.stockCode,
    order: i.order_qty ?? i.order ?? 0,
    supply: i.supply_qty ?? i.supply ?? 0,
    qty: i.qty ?? 0,
    priceEx: parseFloat(i.price_ex ?? i.priceEx ?? 0),
    priceInc: parseFloat(i.price_inc ?? i.priceInc ?? 0),
    total: parseFloat(i.total ?? 0),
  };
}

function normalizeComment(c) {
  return {
    id: c.id,
    date: c.date,
    time: c.time,
    initials: c.initials,
    status: c.status,
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
    address: c.address,
    accountType: c.account_type ?? c.accountType,
    creditLimit: parseFloat(c.credit_limit ?? c.creditLimit ?? 0),
    balance: parseFloat(c.balance ?? 0),
    totalSpent: parseFloat(c.ytd_sales ?? c.totalSpent ?? 0),
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

  create: (data) => request('/jobs', { method: 'POST', body: {
    id: data.id || String(Math.floor(Math.random() * 9000000) + 1000000),
    customer_id: data.customerId,
    customer_name: data.customer,
    status: data.status || 'QUOTE',
    invoice: data.invoice,
    date_in: data.dateIn,
    due: data.due,
    quote: data.quote,
    priority: data.priority || 'Normal',
    type: data.type || 'Normal',
    assigned_to: data.assignedTo,
    notes: data.notes,
    total_ex: data.subtotal || 0,
    total_inc: data.total || 0,
    deposit: data.invoicePaid || 0,
    balance_due: data.balanceDue || 0,
    items: (data.items || []).map(i => ({
      description: i.description,
      sizes: i.sizes,
      stock_code: i.stockCode,
      order_qty: i.order || 0,
      supply_qty: i.supply || 0,
      qty: i.qty || 0,
      price_ex: i.priceEx || 0,
      price_inc: i.priceInc || 0,
      total: i.total || 0,
    })),
  }}).then(normalizeJob),

  update: (id, data) => request(`/jobs/${id}`, { method: 'PATCH', body: {
    priority: data.priority,
    assigned_to: data.assignedTo,
    due: data.due,
    notes: data.notes,
  }}).then(normalizeJob),

  updateStatus: (id, status) =>
    request(`/jobs/${id}/status`, { method: 'POST', body: { status } }).then(normalizeJob),

  addComment: (id, comment) =>
    request(`/jobs/${id}/comments`, { method: 'POST', body: { comment } }),

  recordPayment: (id, amount, method) =>
    request(`/jobs/${id}/payment`, { method: 'POST', body: { amount, method } }).then(normalizeJob),

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

  delete: (sku) => request(`/inventory/${sku}`, { method: 'DELETE' }),
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
    address: data.address,
    account_type: data.accountType || 'Account',
    credit_limit: data.creditLimit || 0,
    status: 'Active',
  }}).then(normalizeCustomer),

  update: (id, data) => request(`/customers/${id}`, { method: 'PATCH', body: {
    name: data.name,
    contact: data.contact,
    email: data.email,
    phone: data.phone,
    address: data.address,
    credit_limit: data.creditLimit,
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
    status: data.status || 'Active',
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

  delete: (id) => request(`/purchase-orders/${id}`, { method: 'DELETE' }),
};
