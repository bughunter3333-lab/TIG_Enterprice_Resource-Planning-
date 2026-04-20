import React, { useState, useEffect } from 'react';
import { Search, Package, Users, User, FileText, BarChart3, Warehouse, Plus, Edit, Trash2, Eye, DollarSign, TrendingUp, ShoppingCart, AlertCircle, X, Check, Calendar, Printer, Download, Upload, Settings, Bell, ChevronDown, ChevronUp, Filter, Save, Mail, Phone, MapPin, CreditCard, Clock, Box, Truck, FileSpreadsheet } from 'lucide-react';

const TotalImageERP = () => {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null });
  const [paymentModal, setPaymentModal] = useState({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' });
  const [stockAdjustModal, setStockAdjustModal] = useState({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' });
  const [commentInput, setCommentInput] = useState('');

  // State management for all data
  const [jobs, setJobs] = useState([
    {
      id: '1186437',
      customer: 'DAVID KIM',
      customerId: 'CUST001',
      status: 'FINISH',
      invoice: '3059786',
      dateIn: '18/02/2026',
      due: '04/03/2026 10:27 AM',
      out: '15/04/2026',
      quote: 'MERRY-RSL',
      priority: 'Normal',
      type: 'Normal',
      assignedTo: 'Sarah J.',
      items: [
        {
          id: 1,
          description: 'Fashion Biz Special Custom Made Garment - Womens Harper 3/4 Sleeve Shirt - Ink/Silver',
          sizes: '6 x size 30, 4 x size 32',
          stockCode: 'FB_INKENT',
          order: 10,
          supply: 10,
          qty: 0,
          priceEx: 110.00,
          priceInc: 121.00,
          total: 1210.00
        },
        {
          id: 2,
          description: 'Merrylands RSL Logo in Blue/Gold/Black (Shirts Only = Left Chest)',
          stockCode: 'EMB_5244',
          order: 10,
          supply: 10,
          qty: 0,
          priceEx: 0.00,
          priceInc: 0.00,
          total: 0.00
        },
        {
          id: 3,
          description: 'Freight Charges Con # CPCXPOC1006242',
          stockCode: 'FREIGHT',
          order: 1,
          supply: 1,
          qty: 0,
          priceEx: 30.00,
          priceInc: 33.00,
          total: 33.00
        }
      ],
      subtotal: 1130.00,
      tax: 113.00,
      total: 1243.00,
      invoicePaid: 0.00,
      balanceDue: 1243.00,
      paymentMethod: 'Account',
      shippingAddress: 'Merrylands RSL Club, 1 Merrylands Rd, Merrylands NSW 2160',
      comments: [
        { id: 1, date: '15/04/2026', time: '14:30', initials: 'AK', status: '', comment: 'Total Image Group - Invoice 3059786. Please find attached your Invoice for goods supplied by Total Image Group. This order is ready or despatched (pending your accounts terms) and will include a Delivery Note.' },
        { id: 2, date: '15/04/2026', time: '10:15', initials: 'NA', status: 'FINISH', comment: 'Status set by bulk OpenFreight Script' },
        { id: 3, date: '15/04/2026', time: '09:45', initials: 'AN', status: '', comment: 'In what day is this leaving?' },
        { id: 4, date: '13/04/2026', time: '16:20', initials: 'EI', status: 'Picked', comment: 'All items picked and ready for dispatch' }
      ]
    },
    {
      id: '1194359',
      customer: 'Respect Group Limited',
      customerId: 'CUST002',
      status: 'Pick/Pack',
      invoice: '3061234',
      dateIn: '20/02/2026',
      due: '06/03/2026 14:00 PM',
      priority: 'High',
      type: 'Custom',
      assignedTo: 'Mike R.',
      items: [
        { id: 1, stockCode: 'POLO_BLK_M', description: 'Black Polo Shirt - Medium', order: 50, supply: 50, qty: 0, priceEx: 45.00, priceInc: 49.50, total: 2475.00 }
      ],
      subtotal: 2450.00,
      tax: 245.00,
      total: 2695.00,
      invoicePaid: 0.00,
      balanceDue: 2695.00,
      paymentMethod: 'Account',
      shippingAddress: '123 Business St, Sydney NSW 2000',
      comments: [
        { id: 1, date: '20/02/2026', time: '11:00', initials: 'MR', status: 'Pick/Pack', comment: 'Started picking process' }
      ]
    },
    {
      id: '1194361',
      customer: 'Dan Murphy\'s - Vendor No. 96026',
      customerId: 'CUST003',
      status: 'FINISH',
      invoice: '3061456',
      dateIn: '22/02/2026',
      due: '08/03/2026 09:00 AM',
      priority: 'Normal',
      type: 'Standard',
      assignedTo: 'Lisa K.',
      items: [
        { id: 1, stockCode: 'JACKET_NVY_L', description: 'Navy Jacket - Large', order: 10, supply: 10, qty: 0, priceEx: 89.00, priceInc: 97.90, total: 979.00 }
      ],
      subtotal: 890.00,
      tax: 89.00,
      total: 979.00,
      invoicePaid: 979.00,
      balanceDue: 0.00,
      paymentMethod: 'Credit Card',
      shippingAddress: 'Dan Murphy\'s Distribution Centre, 45 Wine Rd, Alexandria NSW 2015',
      comments: [
        { id: 1, date: '22/02/2026', time: '15:30', initials: 'LK', status: 'FINISH', comment: 'Order completed and dispatched. Payment received.' }
      ]
    }
  ]);

  const [inventory, setInventory] = useState([
    { sku: 'FB_INKENT', name: 'Fashion Biz Harper 3/4 Sleeve Shirt - Ink/Silver', category: 'Shirts', stock: 45, reorderLevel: 20, location: 'A-15-3', supplier: 'Fashion Biz', supplierCode: 'SUP001', unitCost: 95.00, unitPrice: 110.00, lastRestocked: '10/04/2026', minOrder: 20, leadTime: 14 },
    { sku: 'EMB_5244', name: 'Embroidery - Logo Service', category: 'Services', stock: 999, reorderLevel: 0, location: 'N/A', supplier: 'In-house', supplierCode: 'SUP999', unitCost: 0.00, unitPrice: 0.00, lastRestocked: 'N/A', minOrder: 1, leadTime: 1 },
    { sku: 'FREIGHT', name: 'Freight Charges', category: 'Services', stock: 999, reorderLevel: 0, location: 'N/A', supplier: 'Various', supplierCode: 'SUP998', unitCost: 25.00, unitPrice: 30.00, lastRestocked: 'N/A', minOrder: 1, leadTime: 1 },
    { sku: 'POLO_BLK_M', name: 'Black Polo Shirt - Medium', category: 'Shirts', stock: 70, reorderLevel: 30, location: 'B-08-2', supplier: 'Biz Collection', supplierCode: 'SUP002', unitCost: 38.00, unitPrice: 45.00, lastRestocked: '05/04/2026', minOrder: 50, leadTime: 7 },
    { sku: 'JACKET_NVY_L', name: 'Navy Jacket - Large', category: 'Outerwear', stock: 5, reorderLevel: 25, location: 'C-12-1', supplier: 'JB Wear', supplierCode: 'SUP003', unitCost: 75.00, unitPrice: 89.00, lastRestocked: '25/03/2026', minOrder: 25, leadTime: 21 },
    { sku: 'POLO_WHT_S', name: 'White Polo Shirt - Small', category: 'Shirts', stock: 85, reorderLevel: 40, location: 'B-07-1', supplier: 'Biz Collection', supplierCode: 'SUP002', unitCost: 36.00, unitPrice: 42.00, lastRestocked: '12/04/2026', minOrder: 50, leadTime: 7 },
    { sku: 'VEST_BLK_XL', name: 'Black Vest - Extra Large', category: 'Vests', stock: 12, reorderLevel: 20, location: 'C-09-4', supplier: 'Corporate Wear', supplierCode: 'SUP004', unitCost: 52.00, unitPrice: 65.00, lastRestocked: '28/03/2026', minOrder: 20, leadTime: 14 }
  ]);

  const [customers, setCustomers] = useState([
    { 
      id: 'CUST001', 
      name: 'DAVID KIM', 
      company: 'Merrylands RSL Club',
      contact: 'David Kim', 
      email: 'david.kim@merrylandsrsl.com.au', 
      phone: '02 9635 1234', 
      mobile: '0412 345 678',
      status: 'Active', 
      totalOrders: 24, 
      totalSpent: 28450.00,
      address: '1 Merrylands Rd, Merrylands NSW 2160',
      abn: '12 345 678 901',
      paymentTerms: 'Net 30',
      creditLimit: 50000.00,
      accountManager: 'Sarah J.'
    },
    { 
      id: 'CUST002', 
      name: 'Respect Group Limited', 
      company: 'Respect Group Limited',
      contact: 'Sarah Johnson', 
      email: 'sjohnson@respectgroup.com', 
      phone: '02 9555 7890',
      mobile: '0423 456 789',
      status: 'Active', 
      totalOrders: 18, 
      totalSpent: 45200.00,
      address: '123 Business St, Sydney NSW 2000',
      abn: '23 456 789 012',
      paymentTerms: 'Net 14',
      creditLimit: 75000.00,
      accountManager: 'Mike R.'
    },
    { 
      id: 'CUST003', 
      name: 'Dan Murphy\'s', 
      company: 'Dan Murphy\'s Pty Ltd',
      contact: 'Procurement Team', 
      email: 'procurement@danmurphys.com.au', 
      phone: '1300 326 687',
      mobile: 'N/A',
      status: 'Active', 
      totalOrders: 156, 
      totalSpent: 234500.00,
      address: '45 Wine Rd, Alexandria NSW 2015',
      abn: '34 567 890 123',
      paymentTerms: 'Net 7',
      creditLimit: 250000.00,
      accountManager: 'Lisa K.'
    }
  ]);

  const [suppliers, setSuppliers] = useState([
    { code: 'SUP001', name: 'Fashion Biz', contact: 'John Smith', email: 'orders@fashionbiz.com.au', phone: '03 9555 1234', address: '15 Fashion St, Melbourne VIC 3000', paymentTerms: 'Net 30', status: 'Active' },
    { code: 'SUP002', name: 'Biz Collection', contact: 'Emma Wilson', email: 'sales@bizcollection.com', phone: '02 9888 5555', address: '88 Corporate Ave, Sydney NSW 2000', paymentTerms: 'Net 30', status: 'Active' },
    { code: 'SUP003', name: 'JB Wear', contact: 'Michael Brown', email: 'orders@jbwear.com.au', phone: '07 3333 8888', address: '22 Industrial Dr, Brisbane QLD 4000', paymentTerms: 'Net 45', status: 'Active' },
    { code: 'SUP004', name: 'Corporate Wear', contact: 'Lisa Chen', email: 'info@corporatewear.com.au', phone: '08 8555 2222', address: '56 Business Rd, Adelaide SA 5000', paymentTerms: 'Net 30', status: 'Active' }
  ]);

  const [warehouseZones, setWarehouseZones] = useState([
    { zone: 'A', rows: 15, bays: 8, capacity: 480, utilization: 78, items: 342, description: 'General Apparel' },
    { zone: 'B', rows: 12, bays: 6, capacity: 288, utilization: 92, items: 418, description: 'Shirts & Polos' },
    { zone: 'C', rows: 10, bays: 5, capacity: 200, utilization: 65, items: 234, description: 'Outerwear & Jackets' },
    { zone: 'D', rows: 8, bays: 4, capacity: 128, utilization: 45, items: 127, description: 'Accessories & Services' }
  ]);

  const [stockMovements, setStockMovements] = useState([
    { id: 1, date: '20/04/2026', time: '10:30', sku: 'POLO_BLK_M', description: 'Black Polo Shirt - Medium', type: 'OUT', quantity: 50, fromLocation: 'B-08-2', toLocation: 'Job #1194359', user: 'Mike R.', reference: 'Job #1194359' },
    { id: 2, date: '18/04/2026', time: '14:15', sku: 'FB_INKENT', description: 'Fashion Biz Harper Shirt', type: 'OUT', quantity: 10, fromLocation: 'A-15-3', toLocation: 'Job #1186437', user: 'Sarah J.', reference: 'Job #1186437' },
    { id: 3, date: '15/04/2026', time: '09:00', sku: 'POLO_WHT_S', description: 'White Polo Shirt - Small', type: 'IN', quantity: 100, fromLocation: 'Receiving', toLocation: 'B-07-1', user: 'Warehouse', reference: 'PO-2345' },
    { id: 4, date: '12/04/2026', time: '11:45', sku: 'JACKET_NVY_L', description: 'Navy Jacket - Large', type: 'OUT', quantity: 10, fromLocation: 'C-12-1', toLocation: 'Job #1194361', user: 'Lisa K.', reference: 'Job #1194361' }
  ]);

  const [purchaseOrders, setPurchaseOrders] = useState([
    { id: 'PO-2345', date: '10/04/2026', supplier: 'Biz Collection', supplierCode: 'SUP002', status: 'Received', items: [{ sku: 'POLO_WHT_S', quantity: 100, unitPrice: 36.00, total: 3600.00 }], total: 3600.00, expectedDate: '15/04/2026', receivedDate: '15/04/2026' },
    { id: 'PO-2346', date: '15/04/2026', supplier: 'JB Wear', supplierCode: 'SUP003', status: 'Pending', items: [{ sku: 'JACKET_NVY_L', quantity: 50, unitPrice: 75.00, total: 3750.00 }], total: 3750.00, expectedDate: '06/05/2026', receivedDate: null },
    { id: 'PO-2347', date: '18/04/2026', supplier: 'Fashion Biz', supplierCode: 'SUP001', status: 'Ordered', items: [{ sku: 'FB_INKENT', quantity: 50, unitPrice: 95.00, total: 4750.00 }], total: 4750.00, expectedDate: '02/05/2026', receivedDate: null }
  ]);

  // Initialize notifications
  useEffect(() => {
    const lowStockItems = inventory.filter(item => item.stock < item.reorderLevel);
    const overdueJobs = jobs.filter(job => {
      const dueDate = new Date(job.due.split(' ')[0].split('/').reverse().join('-'));
      return dueDate < new Date() && job.status !== 'FINISH';
    });
    
    const newNotifications = [
      ...lowStockItems.map(item => ({
        id: `low-${item.sku}`,
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${item.name} (${item.sku}) is below reorder level. Current stock: ${item.stock}, Reorder level: ${item.reorderLevel}`,
        time: 'Now'
      })),
      ...overdueJobs.map(job => ({
        id: `overdue-${job.id}`,
        type: 'error',
        title: 'Overdue Job',
        message: `Job #${job.id} for ${job.customer} is overdue. Due: ${job.due}`,
        time: 'Now'
      }))
    ];
    
    setNotifications(newNotifications);
  }, [inventory, jobs]);

  // Form state
  const [jobForm, setJobForm] = useState({
    customer: '',
    customerId: '',
    priority: 'Normal',
    type: 'Standard',
    quote: '',
    dateIn: new Date().toISOString().split('T')[0],
    due: '',
    assignedTo: '',
    shippingAddress: '',
    paymentMethod: 'Account',
    items: []
  });

  const [inventoryForm, setInventoryForm] = useState({
    sku: '',
    name: '',
    category: '',
    stock: 0,
    reorderLevel: 0,
    location: '',
    supplier: '',
    supplierCode: '',
    unitCost: 0,
    unitPrice: 0,
    minOrder: 1,
    leadTime: 7
  });

  const [customerForm, setCustomerForm] = useState({
    name: '',
    company: '',
    contact: '',
    email: '',
    phone: '',
    mobile: '',
    address: '',
    abn: '',
    paymentTerms: 'Net 30',
    creditLimit: 0,
    accountManager: ''
  });

  // Modal handlers
  const openModal = (type, item = null) => {
    setModalType(type);
    setEditingItem(item);
    
    if (type === 'job') {
      if (item) {
        setJobForm({
          ...item,
          dateIn: item.dateIn.split('/').reverse().join('-'),
          due: item.due.split(' ')[0].split('/').reverse().join('-')
        });
      } else {
        setJobForm({
          customer: '',
          customerId: '',
          priority: 'Normal',
          type: 'Standard',
          quote: '',
          dateIn: new Date().toISOString().split('T')[0],
          due: '',
          assignedTo: '',
          shippingAddress: '',
          paymentMethod: 'Account',
          items: []
        });
      }
    } else if (type === 'inventory') {
      if (item) {
        setInventoryForm(item);
      } else {
        setInventoryForm({
          sku: '',
          name: '',
          category: '',
          stock: 0,
          reorderLevel: 0,
          location: '',
          supplier: '',
          supplierCode: '',
          unitCost: 0,
          unitPrice: 0,
          minOrder: 1,
          leadTime: 7
        });
      }
    } else if (type === 'customer') {
      if (item) {
        setCustomerForm(item);
      } else {
        setCustomerForm({
          name: '',
          company: '',
          contact: '',
          email: '',
          phone: '',
          mobile: '',
          address: '',
          abn: '',
          paymentTerms: 'Net 30',
          creditLimit: 0,
          accountManager: ''
        });
      }
    }
    
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setEditingItem(null);
  };

  // CRUD operations
  const saveJob = () => {
    if (editingItem) {
      setJobs(jobs.map(job => job.id === editingItem.id ? { ...job, ...jobForm } : job));
    } else {
      const newJob = {
        ...jobForm,
        id: String(Math.floor(Math.random() * 9000000) + 1000000),
        status: 'New',
        invoice: '',
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        invoicePaid: 0,
        balanceDue: 0,
        comments: []
      };
      setJobs([...jobs, newJob]);
    }
    closeModal();
  };

  const deleteJob = (jobId) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete job #${jobId}? This cannot be undone.`,
      onConfirm: () => {
        setJobs(prev => prev.filter(job => job.id !== jobId));
        if (selectedJob?.id === jobId) setSelectedJob(null);
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveInventoryItem = () => {
    if (editingItem) {
      setInventory(inventory.map(item => item.sku === editingItem.sku ? { ...inventoryForm, lastRestocked: new Date().toLocaleDateString('en-GB') } : item));
    } else {
      const newItem = {
        ...inventoryForm,
        lastRestocked: new Date().toLocaleDateString('en-GB')
      };
      setInventory([...inventory, newItem]);
    }
    closeModal();
  };

  const deleteInventoryItem = (sku) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete SKU "${sku}"? This cannot be undone.`,
      onConfirm: () => {
        setInventory(prev => prev.filter(item => item.sku !== sku));
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveCustomer = () => {
    if (editingItem) {
      setCustomers(customers.map(cust => cust.id === editingItem.id ? { ...cust, ...customerForm } : cust));
    } else {
      const newCustomer = {
        ...customerForm,
        id: `CUST${String(customers.length + 1).padStart(3, '0')}`,
        status: 'Active',
        totalOrders: 0,
        totalSpent: 0
      };
      setCustomers([...customers, newCustomer]);
    }
    closeModal();
  };

  const deleteCustomer = (customerId) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete this customer? This cannot be undone.`,
      onConfirm: () => {
        setCustomers(prev => prev.filter(cust => cust.id !== customerId));
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const updateJobStatus = (jobId, newStatus) => {
    let updated = null;
    setJobs(jobs.map(job => {
      if (job.id === jobId) {
        const comment = {
          id: (job.comments?.length || 0) + 1,
          date: new Date().toLocaleDateString('en-GB'),
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          initials: 'SYS',
          status: newStatus,
          comment: `Status changed to ${newStatus}`
        };
        const updatedJob = {
          ...job,
          status: newStatus,
          comments: [...(job.comments || []), comment],
          ...(newStatus === 'FINISH' && {
            items: job.items?.map(item => ({ ...item, supply: item.order }))
          })
        };
        updated = updatedJob;
        return updatedJob;
      }
      return job;
    }));
    if (selectedJob?.id === jobId && updated) {
      setSelectedJob(updated);
    }
  };

  const adjustStock = (sku, adjustment, reason) => {
    setInventory(inventory.map(item => {
      if (item.sku === sku) {
        const newStock = Math.max(0, item.stock + adjustment);
        
        // Add stock movement record
        const movement = {
          id: stockMovements.length + 1,
          date: new Date().toLocaleDateString('en-GB'),
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          sku: item.sku,
          description: item.name,
          type: adjustment > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(adjustment),
          fromLocation: adjustment > 0 ? 'Adjustment' : item.location,
          toLocation: adjustment > 0 ? item.location : 'Adjustment',
          user: 'System',
          reference: reason
        };
        
        setStockMovements([movement, ...stockMovements]);
        
        return {
          ...item,
          stock: newStock,
          lastRestocked: adjustment > 0 ? new Date().toLocaleDateString('en-GB') : item.lastRestocked
        };
      }
      return item;
    }));
  };

  const addJobComment = (jobId, comment) => {
    setJobs(jobs.map(job => {
      if (job.id === jobId) {
        const newComment = {
          id: (job.comments?.length || 0) + 1,
          date: new Date().toLocaleDateString('en-GB'),
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          initials: 'USR',
          status: '',
          comment: comment
        };
        
        return {
          ...job,
          comments: [...(job.comments || []), newComment]
        };
      }
      return job;
    }));
  };

  const recordPayment = (jobId, amount, method) => {
    setJobs(jobs.map(job => {
      if (job.id === jobId) {
        const newPaid = (job.invoicePaid || 0) + amount;
        const newBalance = job.total - newPaid;
        
        const comment = {
          id: (job.comments?.length || 0) + 1,
          date: new Date().toLocaleDateString('en-GB'),
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          initials: 'FIN',
          status: '',
          comment: `Payment received: $${amount.toFixed(2)} via ${method}. New balance: $${newBalance.toFixed(2)}`
        };
        
        return {
          ...job,
          invoicePaid: newPaid,
          balanceDue: newBalance,
          comments: [...(job.comments || []), comment]
        };
      }
      return job;
    }));
  };

  // Dashboard calculations
  const dashboardStats = {
    activeJobs: jobs.filter(j => j.status !== 'FINISH').length,
    completedToday: jobs.filter(j => j.status === 'FINISH' && j.out === new Date().toLocaleDateString('en-GB')).length,
    pendingInvoices: jobs.filter(j => j.balanceDue > 0).length,
    lowStock: inventory.filter(i => i.stock < i.reorderLevel).length,
    totalRevenue: jobs.reduce((sum, j) => sum + (j.total || 0), 0),
    outstandingPayments: jobs.reduce((sum, j) => sum + (j.balanceDue || 0), 0),
    warehouseCapacity: Math.round((warehouseZones.reduce((sum, z) => sum + (z.capacity * z.utilization / 100), 0) / warehouseZones.reduce((sum, z) => sum + z.capacity, 0)) * 100),
    totalCustomers: customers.length,
    activeCustomers: customers.filter(c => c.status === 'Active').length,
    avgOrderValue: jobs.length > 0 ? jobs.reduce((sum, j) => sum + (j.total || 0), 0) / jobs.length : 0
  };

  // Export functions
  const exportToCSV = (data, filename) => {
    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row => Object.values(row).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const printInvoice = (job) => {
    const printWindow = window.open('', '', 'height=800,width=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${job.invoice}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .totals { text-align: right; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Total Image Group</h1>
          <h2>Tax Invoice</h2>
          <p><strong>Invoice #:</strong> ${job.invoice}</p>
          <p><strong>Job #:</strong> ${job.id}</p>
          <p><strong>Date:</strong> ${job.dateIn}</p>
          <p><strong>Customer:</strong> ${job.customer}</p>
          <p><strong>Due Date:</strong> ${job.due}</p>
          
          <table>
            <thead>
              <tr>
                <th>Stock Code</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price (Inc)</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${job.items.map(item => `
                <tr>
                  <td>${item.stockCode}</td>
                  <td>${item.description}</td>
                  <td>${item.order}</td>
                  <td>$${item.priceInc.toFixed(2)}</td>
                  <td>$${item.total.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <p><strong>Subtotal:</strong> $${job.subtotal.toFixed(2)}</p>
            <p><strong>GST:</strong> $${job.tax.toFixed(2)}</p>
            <p><strong>Total:</strong> $${job.total.toFixed(2)}</p>
            <p><strong>Amount Paid:</strong> $${job.invoicePaid.toFixed(2)}</p>
            <p style="font-size: 1.2em;"><strong>Balance Due:</strong> $${job.balanceDue.toFixed(2)}</p>
          </div>
          
          <p style="margin-top: 40px;">Thank you for your business!</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Render Dashboard
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Active Jobs</p>
              <p className="text-3xl font-bold text-gray-800">{dashboardStats.activeJobs}</p>
              <p className="text-xs text-gray-500 mt-1">In progress</p>
            </div>
            <ShoppingCart className="w-12 h-12 text-blue-500 opacity-20" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Completed Today</p>
              <p className="text-3xl font-bold text-gray-800">{dashboardStats.completedToday}</p>
              <p className="text-xs text-gray-500 mt-1">Jobs finished</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-500 opacity-20" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Low Stock Items</p>
              <p className="text-3xl font-bold text-gray-800">{dashboardStats.lowStock}</p>
              <p className="text-xs text-gray-500 mt-1">Need reordering</p>
            </div>
            <AlertCircle className="w-12 h-12 text-yellow-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Pending Invoices</p>
              <p className="text-3xl font-bold text-gray-800">{dashboardStats.pendingInvoices}</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting payment</p>
            </div>
            <FileText className="w-12 h-12 text-purple-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Financial Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <DollarSign className="w-5 h-5 mr-2" />
          Financial Overview
        </h3>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Revenue</p>
            <p className="text-2xl font-bold text-green-600">${dashboardStats.totalRevenue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Outstanding</p>
            <p className="text-2xl font-bold text-red-600">${dashboardStats.outstandingPayments.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Order Value</p>
            <p className="text-2xl font-bold text-blue-600">${dashboardStats.avgOrderValue.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Active Customers</p>
            <p className="text-2xl font-bold text-purple-600">{dashboardStats.activeCustomers}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Warehouse Capacity</p>
            <p className="text-2xl font-bold text-orange-600">{dashboardStats.warehouseCapacity}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Recent Jobs
            </h3>
            <button 
              onClick={() => setActiveModule('jobs')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              View All →
            </button>
          </div>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(job => (
              <div 
                key={job.id} 
                className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer transition-colors"
                onClick={() => { setSelectedJob(job); setActiveModule('jobs'); }}
              >
                <div className="flex-1">
                  <p className="font-medium">#{job.id}</p>
                  <p className="text-sm text-gray-600">{job.customer}</p>
                  <p className="text-xs text-gray-500">Due: {job.due}</p>
                </div>
                <div className="text-right mr-4">
                  <p className="font-medium">${job.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
                  {job.balanceDue > 0 && (
                    <p className="text-xs text-red-600">Due: ${job.balanceDue.toFixed(2)}</p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded text-sm ${
                  job.status === 'FINISH' ? 'bg-green-100 text-green-800' :
                  job.status === 'Pick/Pack' ? 'bg-blue-100 text-blue-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Warehouse Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Warehouse className="w-5 h-5 mr-2" />
              Warehouse Status
            </h3>
            <button 
              onClick={() => setActiveModule('warehouse')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              View Details →
            </button>
          </div>
          <div className="space-y-3">
            {warehouseZones.map(zone => (
              <div key={zone.zone} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Zone {zone.zone} - {zone.description}</span>
                  <span className="text-gray-600">{zone.utilization}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      zone.utilization > 80 ? 'bg-red-500' :
                      zone.utilization > 60 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${zone.utilization}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{zone.items} items</span>
                  <span>{zone.capacity} total capacity</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts and Notifications */}
      {notifications.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Bell className="w-5 h-5 mr-2" />
              Alerts & Notifications
            </h3>
            <span className="text-sm text-gray-600">{notifications.length} active</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {notifications.map(notif => (
              <div 
                key={notif.id} 
                className={`p-3 rounded flex items-start space-x-3 ${
                  notif.type === 'error' ? 'bg-red-50 border border-red-200' :
                  notif.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-blue-50 border border-blue-200'
                }`}
              >
                <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                  notif.type === 'error' ? 'text-red-500' :
                  notif.type === 'warning' ? 'text-yellow-500' :
                  'text-blue-500'
                }`} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{notif.title}</p>
                  <p className="text-xs text-gray-600">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{notif.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Top Customer</h4>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-lg font-bold">{customers.sort((a, b) => b.totalSpent - a.totalSpent)[0]?.name}</p>
          <p className="text-sm text-gray-500">${customers.sort((a, b) => b.totalSpent - a.totalSpent)[0]?.totalSpent.toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Top Product</h4>
            <Package className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-lg font-bold">{inventory[0]?.name.substring(0, 25)}...</p>
          <p className="text-sm text-gray-500">Stock: {inventory[0]?.stock}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Pending POs</h4>
            <FileSpreadsheet className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-lg font-bold">{purchaseOrders.filter(po => po.status !== 'Received').length}</p>
          <p className="text-sm text-gray-500">${purchaseOrders.filter(po => po.status !== 'Received').reduce((sum, po) => sum + po.total, 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );

  // Render Jobs Module
  const renderJobs = () => {
    const filteredJobs = jobs.filter(job => {
      const matchesSearch = job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.invoice && job.invoice.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || job.priority === filterPriority;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Job Management</h2>
          <div className="flex space-x-2">
            <button 
              onClick={() => exportToCSV(jobs, 'jobs')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            <button 
              onClick={() => openModal('job')}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search jobs..."
                className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="New">New</option>
              <option value="Pick/Pack">Pick/Pack</option>
              <option value="FINISH">Finished</option>
            </select>

            <select 
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>

            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <input 
                type="date" 
                className="flex-1 border rounded px-3 py-2 text-sm"
                placeholder="Date range"
              />
            </div>
          </div>
        </div>

        {/* Jobs Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredJobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedJob(job)}>
                    <td className="px-4 py-3 font-medium text-blue-600">#{job.id}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{job.customer}</p>
                        <p className="text-xs text-gray-500">{job.quote}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        value={job.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateJobStatus(job.id, e.target.value);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          job.status === 'FINISH' ? 'bg-green-100 text-green-800' :
                          job.status === 'Pick/Pack' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="New">New</option>
                        <option value="Pick/Pack">Pick/Pack</option>
                        <option value="FINISH">Finish</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${
                        job.priority === 'High' || job.priority === 'Urgent' ? 'text-red-600 font-semibold' :
                        'text-gray-600'
                      }`}>
                        {job.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{job.assignedTo}</td>
                    <td className="px-4 py-3 text-sm">{job.due}</td>
                    <td className="px-4 py-3 font-medium">${job.total?.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <span className={job.balanceDue > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                        ${job.balanceDue?.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex space-x-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJob(job);
                          }}
                          className="p-1 hover:bg-gray-100 rounded" 
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('job', job);
                          }}
                          className="p-1 hover:bg-gray-100 rounded" 
                          title="Edit"
                        >
                          <Edit className="w-4 h-4 text-blue-600" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            printInvoice(job);
                          }}
                          className="p-1 hover:bg-gray-100 rounded" 
                          title="Print"
                        >
                          <Printer className="w-4 h-4 text-green-600" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteJob(job.id);
                          }}
                          className="p-1 hover:bg-gray-100 rounded" 
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Job Details Panel */}
        {selectedJob && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Job Details - #{selectedJob.id}</h3>
              <div className="flex space-x-2">
                <button 
                  onClick={() => printInvoice(selectedJob)}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center text-sm"
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </button>
                <button 
                  onClick={() => setSelectedJob(null)} 
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700 border-b pb-2">Customer Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Customer:</span>
                    <span className="font-medium">{selectedJob.customer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Customer ID:</span>
                    <span className="font-medium">{selectedJob.customerId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Quote Ref:</span>
                    <span className="font-medium">{selectedJob.quote}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Assigned To:</span>
                    <span className="font-medium">{selectedJob.assignedTo}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700 border-b pb-2">Job Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                      selectedJob.status === 'FINISH' ? 'text-green-600' : 'text-blue-600'
                    }`}>{selectedJob.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Priority:</span>
                    <span className={`font-medium ${
                      selectedJob.priority === 'High' || selectedJob.priority === 'Urgent' ? 'text-red-600' : ''
                    }`}>{selectedJob.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span>{selectedJob.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice #:</span>
                    <span className="font-medium">{selectedJob.invoice}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700 border-b pb-2">Dates & Delivery</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Date In:</span>
                    <span>{selectedJob.dateIn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Due Date:</span>
                    <span>{selectedJob.due}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Out Date:</span>
                    <span>{selectedJob.out}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment:</span>
                    <span>{selectedJob.paymentMethod}</span>
                  </div>
                </div>
              </div>
            </div>

            {selectedJob.shippingAddress && (
              <div className="mb-6 p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium text-gray-700 mb-1">Shipping Address:</p>
                <p className="text-sm text-gray-600">{selectedJob.shippingAddress}</p>
              </div>
            )}

            {selectedJob.items && selectedJob.items.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold mb-3">Order Items</h4>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Stock Code</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Order</th>
                        <th className="px-3 py-2 text-right">Supply</th>
                        <th className="px-3 py-2 text-right">Price Ex.</th>
                        <th className="px-3 py-2 text-right">Price Inc.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedJob.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{item.stockCode}</td>
                          <td className="px-3 py-2">
                            {item.description}
                            {item.sizes && <div className="text-xs text-gray-500">{item.sizes}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">{item.order}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={item.supply >= item.order ? 'text-green-600 font-medium' : 'text-red-600'}>
                              {item.supply}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">${item.priceEx.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">${item.priceInc.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-medium">${item.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 bg-gray-50 p-4 rounded">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">${selectedJob.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">GST (10%):</span>
                        <span className="font-medium">${selectedJob.tax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>${selectedJob.total.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="space-y-2 border-l pl-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Invoice Paid:</span>
                        <span className="text-green-600 font-medium">${selectedJob.invoicePaid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>Balance Due:</span>
                        <span className={selectedJob.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}>
                          ${selectedJob.balanceDue.toFixed(2)}
                        </span>
                      </div>
                      {selectedJob.balanceDue > 0 && (
                        <button
                          onClick={() => setPaymentModal({
                            show: true,
                            jobId: selectedJob.id,
                            maxAmount: selectedJob.balanceDue,
                            amount: selectedJob.balanceDue.toFixed(2),
                            method: 'Credit Card'
                          })}
                          className="w-full mt-2 bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 text-sm flex items-center justify-center"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Record Payment
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedJob.comments && selectedJob.comments.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Comments & Activity</h4>
                <div className="flex space-x-2 mb-3">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && commentInput.trim()) {
                        addJobComment(selectedJob.id, commentInput.trim());
                        setCommentInput('');
                      }
                    }}
                    placeholder="Add a comment..."
                    className="flex-1 border rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      if (commentInput.trim()) {
                        addJobComment(selectedJob.id, commentInput.trim());
                        setCommentInput('');
                      }
                    }}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-3">
                  {selectedJob.comments.map((comment, idx) => (
                    <div key={idx} className="bg-gray-50 p-3 rounded text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{comment.initials}</span>
                          {comment.status && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                              {comment.status}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{comment.date} {comment.time}</span>
                      </div>
                      <p className="text-gray-700">{comment.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render Inventory Module
  const renderInventory = () => {
    const filteredInventory = inventory.filter(item =>
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const lowStockItems = inventory.filter(item => item.stock < item.reorderLevel);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Inventory Management</h2>
          <div className="flex space-x-2">
            <button 
              onClick={() => exportToCSV(inventory, 'inventory')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            <button 
              onClick={() => openModal('inventory')}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </button>
          </div>
        </div>

        {/* Stock Alerts */}
        {lowStockItems.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <h3 className="font-semibold text-yellow-800">Low Stock Alerts</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {lowStockItems.map(item => (
                <div key={item.sku} className="text-sm text-yellow-800 flex items-center justify-between bg-white rounded p-2">
                  <span>{item.name}</span>
                  <span className="font-medium">Stock: {item.stock} (Min: {item.reorderLevel})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by SKU, name, or category..."
              className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reorder</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Restocked</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInventory.map(item => (
                <tr key={item.sku} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{item.sku}</td>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${
                        item.stock < item.reorderLevel ? 'text-red-600' :
                        item.stock < item.reorderLevel * 1.5 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {item.stock}
                      </span>
                      {item.stock < item.reorderLevel && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{item.reorderLevel}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.location}</td>
                  <td className="px-4 py-3">{item.supplier}</td>
                  <td className="px-4 py-3">${item.unitCost.toFixed(2)}</td>
                  <td className="px-4 py-3 font-medium">${item.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{item.lastRestocked}</td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setStockAdjustModal({
                          show: true,
                          sku: item.sku,
                          name: item.name,
                          currentStock: item.stock,
                          adjustment: '',
                          reason: ''
                        })}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Adjust Stock"
                      >
                        <Box className="w-4 h-4 text-orange-600" />
                      </button>
                      <button 
                        onClick={() => openModal('inventory', item)}
                        className="p-1 hover:bg-gray-100 rounded" 
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                      </button>
                      <button 
                        onClick={() => deleteInventoryItem(item.sku)}
                        className="p-1 hover:bg-gray-100 rounded" 
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stock Movements */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Stock Movements</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date/Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">User</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockMovements.slice(0, 10).map(movement => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs">{movement.date} {movement.time}</td>
                    <td className="px-3 py-2 font-mono text-xs">{movement.sku}</td>
                    <td className="px-3 py-2">{movement.description}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        movement.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {movement.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{movement.quantity}</td>
                    <td className="px-3 py-2 text-xs">{movement.fromLocation}</td>
                    <td className="px-3 py-2 text-xs">{movement.toLocation}</td>
                    <td className="px-3 py-2 text-xs">{movement.user}</td>
                    <td className="px-3 py-2 text-xs">{movement.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Render Customers Module
  const renderCustomers = () => {
    const filteredCustomers = customers.filter(cust =>
      cust.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.contact.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Customer Management</h2>
          <div className="flex space-x-2">
            <button 
              onClick={() => exportToCSV(customers, 'customers')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            <button 
              onClick={() => openModal('customer')}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers..."
              className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Customer Cards Grid */}
        <div className="grid grid-cols-3 gap-4">
          {filteredCustomers.map(customer => (
            <div key={customer.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">{customer.name}</h3>
                  <p className="text-sm text-gray-600">{customer.company}</p>
                  <span className={`mt-2 inline-block px-2 py-1 rounded text-xs ${
                    customer.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {customer.status}
                  </span>
                </div>
                <div className="flex space-x-1">
                  <button 
                    onClick={() => openModal('customer', customer)}
                    className="p-2 hover:bg-gray-100 rounded"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4 text-blue-600" />
                  </button>
                  <button 
                    onClick={() => deleteCustomer(customer.id)}
                    className="p-2 hover:bg-gray-100 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center text-gray-600">
                  <User className="w-4 h-4 mr-2" />
                  {customer.contact}
                </div>
                <div className="flex items-center text-gray-600">
                  <Mail className="w-4 h-4 mr-2" />
                  {customer.email}
                </div>
                <div className="flex items-center text-gray-600">
                  <Phone className="w-4 h-4 mr-2" />
                  {customer.phone}
                </div>
                {customer.address && (
                  <div className="flex items-start text-gray-600">
                    <MapPin className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-xs">{customer.address}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 text-xs">Total Orders</p>
                  <p className="font-bold text-lg">{customer.totalOrders}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs">Total Spent</p>
                  <p className="font-bold text-lg text-green-600">${customer.totalSpent.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Payment Terms:</span>
                  <span className="font-medium">{customer.paymentTerms}</span>
                </div>
                <div className="flex justify-between">
                  <span>Credit Limit:</span>
                  <span className="font-medium">${customer.creditLimit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Account Manager:</span>
                  <span className="font-medium">{customer.accountManager}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render Warehouse Module
  const renderWarehouse = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Warehouse Management</h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => exportToCSV(stockMovements, 'stock-movements')}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Movements
          </button>
        </div>
      </div>

      {/* Warehouse Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Total Capacity</h4>
            <Warehouse className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold">{warehouseZones.reduce((sum, z) => sum + z.capacity, 0)}</p>
          <p className="text-sm text-gray-500">positions</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Occupied</h4>
            <Box className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-blue-600">{warehouseZones.reduce((sum, z) => sum + Math.floor(z.capacity * z.utilization / 100), 0)}</p>
          <p className="text-sm text-gray-500">positions</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Utilization</h4>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-green-600">{dashboardStats.warehouseCapacity}%</p>
          <p className="text-sm text-gray-500">overall</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-600">Total Items</h4>
            <Package className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-purple-600">{warehouseZones.reduce((sum, z) => sum + z.items, 0)}</p>
          <p className="text-sm text-gray-500">unique SKUs</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Zone Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Zone Details</h3>
          <div className="space-y-4">
            {warehouseZones.map(zone => (
              <div key={zone.zone} className="border rounded p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-lg">Zone {zone.zone}</h4>
                    <p className="text-sm text-gray-600">{zone.description}</p>
                  </div>
                  <span className={`px-4 py-2 rounded text-sm font-medium ${
                    zone.utilization > 80 ? 'bg-red-100 text-red-800' :
                    zone.utilization > 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {zone.utilization}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-600 text-xs">Rows</p>
                    <p className="font-bold">{zone.rows}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-600 text-xs">Bays</p>
                    <p className="font-bold">{zone.bays}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-600 text-xs">Capacity</p>
                    <p className="font-bold">{zone.capacity}</p>
                  </div>
                </div>

                <div className="space-y-1 mb-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Items stored: {zone.items}</span>
                    <span className="text-gray-600">Available: {zone.capacity - Math.floor(zone.capacity * zone.utilization / 100)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full transition-all ${
                        zone.utilization > 80 ? 'bg-red-500' :
                        zone.utilization > 60 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${zone.utilization}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warehouse Visual */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Warehouse Layout</h3>
          <div className="bg-gray-100 p-6 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              {warehouseZones.map(zone => (
                <div 
                  key={zone.zone}
                  className={`aspect-square border-4 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform ${
                    zone.utilization > 80 ? 'bg-red-100 border-red-500' :
                    zone.utilization > 60 ? 'bg-yellow-100 border-yellow-500' :
                    'bg-green-100 border-green-500'
                  }`}
                >
                  <div className="text-4xl font-bold mb-2">{zone.zone}</div>
                  <div className="text-center px-4">
                    <p className="font-semibold text-sm">{zone.description}</p>
                    <p className="text-2xl font-bold my-2">{zone.utilization}%</p>
                    <p className="text-xs text-gray-600">{zone.items} items</p>
                    <p className="text-xs text-gray-600">{zone.rows}×{zone.bays} grid</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 bg-gray-50 p-4 rounded">
            <h4 className="font-semibold mb-2 text-sm">Overall Warehouse Status</h4>
            <div className="w-full bg-gray-200 rounded-full h-6 mb-2">
              <div 
                className="h-6 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                style={{ width: `${dashboardStats.warehouseCapacity}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>0%</span>
              <span className="font-bold">{dashboardStats.warehouseCapacity}% Utilized</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Truck className="w-5 h-5 mr-2" />
          Recent Stock Movements
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date/Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">User</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stockMovements.slice(0, 15).map(movement => (
                <tr key={movement.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{movement.date} {movement.time}</td>
                  <td className="px-3 py-2 font-mono text-xs">{movement.sku}</td>
                  <td className="px-3 py-2">{movement.description}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      movement.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {movement.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-center">{movement.quantity}</td>
                  <td className="px-3 py-2 text-xs">{movement.fromLocation}</td>
                  <td className="px-3 py-2 text-xs">{movement.toLocation}</td>
                  <td className="px-3 py-2 text-xs">{movement.user}</td>
                  <td className="px-3 py-2 text-xs font-mono">{movement.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Modal Renderer
  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {editingItem ? 'Edit' : 'New'} {modalType.charAt(0).toUpperCase() + modalType.slice(1)}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {modalType === 'job' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={jobForm.customer}
                      onChange={(e) => setJobForm({...jobForm, customer: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
                    <select
                      value={jobForm.customerId}
                      onChange={(e) => {
                        const selectedCustomer = customers.find(c => c.id === e.target.value);
                        setJobForm({
                          ...jobForm, 
                          customerId: e.target.value,
                          customer: selectedCustomer?.name || '',
                          shippingAddress: selectedCustomer?.address || ''
                        });
                      }}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Customer</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quote Reference</label>
                    <input
                      type="text"
                      value={jobForm.quote}
                      onChange={(e) => setJobForm({...jobForm, quote: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={jobForm.priority}
                      onChange={(e) => setJobForm({...jobForm, priority: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={jobForm.type}
                      onChange={(e) => setJobForm({...jobForm, type: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Custom">Custom</option>
                      <option value="Rush">Rush</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                    <input
                      type="text"
                      value={jobForm.assignedTo}
                      onChange={(e) => setJobForm({...jobForm, assignedTo: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date In</label>
                    <input
                      type="date"
                      value={jobForm.dateIn}
                      onChange={(e) => setJobForm({...jobForm, dateIn: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={jobForm.due}
                      onChange={(e) => setJobForm({...jobForm, due: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select
                      value={jobForm.paymentMethod}
                      onChange={(e) => setJobForm({...jobForm, paymentMethod: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Account">Account</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
                  <textarea
                    value={jobForm.shippingAddress}
                    onChange={(e) => setJobForm({...jobForm, shippingAddress: e.target.value})}
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="2"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveJob}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Job
                  </button>
                </div>
              </div>
            )}

            {modalType === 'inventory' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                    <input
                      type="text"
                      value={inventoryForm.sku}
                      onChange={(e) => setInventoryForm({...inventoryForm, sku: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={editingItem !== null}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      value={inventoryForm.category}
                      onChange={(e) => setInventoryForm({...inventoryForm, category: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                    <input
                      type="text"
                      value={inventoryForm.name}
                      onChange={(e) => setInventoryForm({...inventoryForm, name: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                    <input
                      type="number"
                      value={inventoryForm.stock}
                      onChange={(e) => setInventoryForm({...inventoryForm, stock: parseInt(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                    <input
                      type="number"
                      value={inventoryForm.reorderLevel}
                      onChange={(e) => setInventoryForm({...inventoryForm, reorderLevel: parseInt(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={inventoryForm.location}
                      onChange={(e) => setInventoryForm({...inventoryForm, location: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., A-15-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <select
                      value={inventoryForm.supplierCode}
                      onChange={(e) => {
                        const selectedSupplier = suppliers.find(s => s.code === e.target.value);
                        setInventoryForm({
                          ...inventoryForm, 
                          supplierCode: e.target.value,
                          supplier: selectedSupplier?.name || ''
                        });
                      }}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={inventoryForm.unitCost}
                      onChange={(e) => setInventoryForm({...inventoryForm, unitCost: parseFloat(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={inventoryForm.unitPrice}
                      onChange={(e) => setInventoryForm({...inventoryForm, unitPrice: parseFloat(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order Qty</label>
                    <input
                      type="number"
                      value={inventoryForm.minOrder}
                      onChange={(e) => setInventoryForm({...inventoryForm, minOrder: parseInt(e.target.value) || 1})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lead Time (days)</label>
                    <input
                      type="number"
                      value={inventoryForm.leadTime}
                      onChange={(e) => setInventoryForm({...inventoryForm, leadTime: parseInt(e.target.value) || 7})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveInventoryItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Item
                  </button>
                </div>
              </div>
            )}

            {modalType === 'customer' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                      type="text"
                      value={customerForm.company}
                      onChange={(e) => setCustomerForm({...customerForm, company: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={customerForm.contact}
                      onChange={(e) => setCustomerForm({...customerForm, contact: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({...customerForm, email: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                    <input
                      type="tel"
                      value={customerForm.mobile}
                      onChange={(e) => setCustomerForm({...customerForm, mobile: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({...customerForm, address: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ABN</label>
                    <input
                      type="text"
                      value={customerForm.abn}
                      onChange={(e) => setCustomerForm({...customerForm, abn: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select
                      value={customerForm.paymentTerms}
                      onChange={(e) => setCustomerForm({...customerForm, paymentTerms: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Net 7">Net 7</option>
                      <option value="Net 14">Net 14</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="COD">COD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit ($)</label>
                    <input
                      type="number"
                      step="1000"
                      value={customerForm.creditLimit}
                      onChange={(e) => setCustomerForm({...customerForm, creditLimit: parseFloat(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Manager</label>
                    <input
                      type="text"
                      value={customerForm.accountManager}
                      onChange={(e) => setCustomerForm({...customerForm, accountManager: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCustomer}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Customer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderConfirmModal = () => {
    if (!confirmModal.show) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
          <div className="flex items-start space-x-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-gray-800">{confirmModal.message}</p>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmModal.onConfirm}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPaymentModal = () => {
    if (!paymentModal.show) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Record Payment</h3>
            <button onClick={() => setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' })}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={paymentModal.maxAmount}
                value={paymentModal.amount}
                onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Balance due: ${paymentModal.maxAmount.toFixed(2)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={paymentModal.method}
                onChange={(e) => setPaymentModal({ ...paymentModal, method: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Credit Card</option>
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Account</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
            <button
              onClick={() => setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' })}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const amount = parseFloat(paymentModal.amount);
                if (amount > 0) recordPayment(paymentModal.jobId, amount, paymentModal.method);
                setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' });
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStockAdjustModal = () => {
    if (!stockAdjustModal.show) return null;
    const adj = parseInt(stockAdjustModal.adjustment) || 0;
    const newStock = Math.max(0, stockAdjustModal.currentStock + adj);
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Adjust Stock</h3>
            <button onClick={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">{stockAdjustModal.name}</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment (+/-)</label>
              <input
                type="number"
                value={stockAdjustModal.adjustment}
                onChange={(e) => setStockAdjustModal({ ...stockAdjustModal, adjustment: e.target.value })}
                placeholder="e.g. +10 or -5"
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                Current: {stockAdjustModal.currentStock} → New: <span className={newStock < stockAdjustModal.currentStock ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>{newStock}</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={stockAdjustModal.reason}
                onChange={(e) => setStockAdjustModal({ ...stockAdjustModal, reason: e.target.value })}
                placeholder="e.g. Stocktake, Damaged goods..."
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
            <button
              onClick={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (adj !== 0) adjustStock(stockAdjustModal.sku, adj, stockAdjustModal.reason || 'Manual adjustment');
                setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' });
              }}
              disabled={adj === 0}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Box className="w-4 h-4 mr-2" />
              Apply Adjustment
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg">
                TIG
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Total Image Group</h1>
                <p className="text-sm text-gray-500">Enterprise Resource Planning System</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button className="p-2 hover:bg-gray-100 rounded-full relative">
                  <Bell className="w-5 h-5 text-gray-600" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </button>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">User: RD</p>
                <p className="text-xs text-gray-500">Location: HQ • {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b sticky top-[73px] z-30">
        <div className="px-6">
          <div className="flex space-x-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'jobs', label: 'Jobs', icon: FileText },
              { id: 'inventory', label: 'Inventory', icon: Package },
              { id: 'customers', label: 'Customers', icon: Users },
              { id: 'warehouse', label: 'Warehouse', icon: Warehouse }
            ].map(nav => {
              const Icon = nav.icon;
              return (
                <button
                  key={nav.id}
                  onClick={() => {
                    setActiveModule(nav.id);
                    setSearchTerm('');
                    setSelectedJob(null);
                  }}
                  className={`px-4 py-3 flex items-center space-x-2 border-b-2 transition-colors ${
                    activeModule === nav.id
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{nav.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="p-6">
        {activeModule === 'dashboard' && renderDashboard()}
        {activeModule === 'jobs' && renderJobs()}
        {activeModule === 'inventory' && renderInventory()}
        {activeModule === 'customers' && renderCustomers()}
        {activeModule === 'warehouse' && renderWarehouse()}
      </main>

      {/* Modals */}
      {renderModal()}
      {renderConfirmModal()}
      {renderPaymentModal()}
      {renderStockAdjustModal()}

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-4 px-6">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            <p>© 2026 Total Image Group - Enterprise Resource Planning System</p>
            <p className="text-xs">Version 2.0 • Built for operational excellence</p>
          </div>
          <div className="flex items-center space-x-4">
            <span>Server: js-s2019-5.happendcloud.local\HM2_TIG</span>
            <span>•</span>
            <span>Licensed to: Total Image Group</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TotalImageERP;
