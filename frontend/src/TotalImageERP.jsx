import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Package, Users, User, FileText, BarChart3, Warehouse, Plus, Edit, Trash2, Eye, DollarSign, TrendingUp, ShoppingCart, AlertCircle, X, Calendar, Printer, Download, Bell, Save, Mail, Phone, MapPin, CreditCard, Box, Truck, FileSpreadsheet, Send, RefreshCw, PieChart, ClipboardList, Layers, ChevronDown, Tag, CheckSquare, BookOpen, Weight, Ruler, Settings, ExternalLink, Copy, LayoutGrid, Clock } from 'lucide-react';
import * as api from './api';
import { PieChart as ResponsiveContainer } from 'recharts';
import ReportsModule from './modules/ReportsModule';
import EmailModule from './modules/EmailModule';
import SettingsModule from './modules/SettingsModule';
import UserManagement from './modules/UserManagement';
import StylesModule from './modules/StylesModule';
import SchedulingModule from './modules/SchedulingModule';
import AccountsPayableModule from './modules/AccountsPayableModule';
import AnalyticsModule from './modules/AnalyticsModule';
import { notify } from './lib/notify';
import AppShell from './ui/shell/AppShell';
import { T } from './ui/tokens';
import Button from './ui/Button';
import { DEFAULT_BRANCH } from './branches';
import StatusBadge from './ui/StatusBadge';
import Dashboard from './components/dashboard/Dashboard';
import JobsBoard from './components/jobs/JobsBoard';
import JobsModule from './modules/jobs/JobsModule';
import JobListBuilder from './modules/jobs/JobListBuilder';
import DispatchList from './modules/jobs/DispatchList';
import { matchJobList } from './modules/jobs/jobsFilters';
import StockModule from './modules/stock/StockModule';
import StockListBuilder from './modules/stock/StockListBuilder';
import { matchStockList, EMPTY_STOCK_LIST } from './modules/stock/stockListFilters';
import POListBuilder from './modules/purchase-orders/POListBuilder';
import { matchPOList, EMPTY_PO_LIST } from './modules/purchase-orders/poListFilters';
import POModule from './modules/purchase-orders/POModule';
import CustomersModule from './modules/customers/CustomersModule';
import CardFilesModule from './modules/card-files/CardFilesModule';
import AdminPanel from './components/admin/AdminPanel';
import { isJobEditable, jobLockReason } from './modules/jobs/jobEditability';
import { countNeedingReorder, needsReorder } from './modules/stock/lowStock';
import DraggableModal from './ui/DraggableModal';
import DocumentPrint from './components/documents/DocumentPrint';
import InvoiceDocument from './components/documents/InvoiceDocument';
import ConfirmModal from './components/modals/ConfirmModal';
import DispatchModal from './components/modals/DispatchModal';
import PaymentModal from './components/modals/PaymentModal';
import SalesRegisterModal from './components/modals/SalesRegisterModal';
import StockAdjustModal from './components/modals/StockAdjustModal';
import StockFlowModal from './components/modals/StockFlowModal';
import StocktakeModal from './components/modals/StocktakeModal';
import TransferModal from './components/modals/TransferModal';
import UnprintModal from './components/modals/UnprintModal';
import CustomerForm from './components/forms/CustomerForm';
import InventoryForm from './components/forms/InventoryForm';
import PurchaseOrderForm from './components/forms/PurchaseOrderForm';
import SupplierForm from './components/forms/SupplierForm';
import ImportModule from './modules/import/ImportModule';
import CardFileFormModal from './modules/card-files/CardFileFormModal';
import WarehouseModule from './modules/warehouse/WarehouseModule';
import { WAREHOUSE_ZONES } from './modules/warehouse/zones';
import SupplierPriceListPanel from './modules/suppliers/SupplierPriceListPanel';
import SizeColourMatrixPopup from './components/jobs/SizeColourMatrixPopup';
import ProofPanel from './components/jobs/ProofPanel';
import POGoodsReceiptsPanel from './modules/purchase-orders/POGoodsReceiptsPanel';
import EmailJobModal from './components/modals/EmailJobModal';
import SuppliersModule from './modules/suppliers/SuppliersModule';
import CustomersDetail from './modules/customers/CustomersDetail';
import PurchaseOrdersDetail from './modules/purchase-orders/PurchaseOrdersDetail';
import AIAssistantPanel from './modules/ai/AIAssistantPanel';
import { DEC_OPTIONS, DEC_POSITIONS } from './lib/decoration';
import { parseD } from './lib/dates';
import OrderRequirementsModule from './modules/order-requirements/OrderRequirementsModule';
import POListPage from './modules/saved-lists/POListPage';
import StockListPage from './modules/saved-lists/StockListPage';
import JobListPage from './modules/saved-lists/JobListPage';


// Blank draft for the advanced Job List builder (every field optional → see matchJobList)
const EMPTY_JOB_LIST = {
  jobNo: '', customerId: '', status: '', priority: '', type: '', accMgr: '', shipTo: '', group: '',
  custRef: '', ourRef: '', invoice: '', projectNo: '', serialNo: '',
  name: '', branch: '', priceLevel: '', stockCode: '',
  dateInFrom: '', dateInTo: '', dueFrom: '', dueTo: '', dateOutFrom: '', dateOutTo: '',
  active: false, ready: false, finish: false, invoiced: false, quote: false, overdue: false, tax: false,
};

const TotalImageERP = ({ currentUser, onLogout }) => {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [adminMode, setAdminMode] = useState(false);
  const [pinnedJobs, setPinnedJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  // notifications is derived — no setState needed (avoids infinite-loop from new [] refs each render)
  const [jobsViewMode, setJobsViewMode] = useState('table');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterDateField, setFilterDateField] = useState('dateIn');
  const [filterShipCode, setFilterShipCode] = useState('all');
  const [filterCustomerGroup, setFilterCustomerGroup] = useState('all');
  const [filterOpenFreight, setFilterOpenFreight] = useState(false);
  const [filterQuick, setFilterQuick] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null });
  const [paymentModal, setPaymentModal] = useState({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' });
  const [stockAdjustModal, setStockAdjustModal] = useState({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' });
  const [commentInput, setCommentInput] = useState('');
  const [openDecIdx, setOpenDecIdx] = useState(null);
  const [skuDropdown, setSkuDropdown] = useState({ idx: -1, query: '', highlighted: 0, rect: null });
  const [descDropdown, setDescDropdown] = useState({ idx: -1, query: '', highlighted: 0, rect: null });
  const [poSkuDropdown, setPoSkuDropdown] = useState({ idx: -1, query: '', highlighted: 0 });
  const [custDropdown, setCustDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [shipDropdown, setShipDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [assignedDropdown, setAssignedDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [categoryDropdown, setCategoryDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [locationDropdown, setLocationDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [supplierDropdown, setSupplierDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);
  const [colWidths, setColWidths] = useState({ stock: 130, desc: 210, order: 58, supply: 56, bord: 52, priceEx: 76, priceInc: 76, margin: 52, total: 76, hide: 32 });
  const [lineItemsHeight, setLineItemsHeight] = useState(480);
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0, rowIdx: -1 });

  const [apiError, setApiError] = useState('');

  const queryClient = useQueryClient();
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list, refetchInterval: 60_000, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  useQuery({ queryKey: ['settings/company'], queryFn: api.settings.getCompany, staleTime: 300_000, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: inventory = [], isLoading: invLoading } = useQuery({ queryKey: ['inventory'], queryFn: api.inventory.list, refetchInterval: 60_000, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers.list, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers.list, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  // Admin-managed custom decoration methods (added via the line-item picker's "+ Add method").
  const { data: customDecRaw } = useQuery({ queryKey: ['custom_dec_types'], queryFn: () => api.adminSettings.get('custom_dec_types'), staleTime: 300000, onError: () => {} });
  const customDecTypes = (() => { try { const arr = customDecRaw?.value ? JSON.parse(customDecRaw.value) : []; return Array.isArray(arr) ? arr : []; } catch { return []; } })();
  const decMethods = [...DEC_OPTIONS, ...customDecTypes.filter(c => c && c.v && !DEC_OPTIONS.some(d => d.v === c.v)).map(c => ({ v: c.v, l: c.l || c.v, emoji: '🏷️', dot: 'bg-faint', pill: 'bg-hairline-soft text-header border-hairline' }))];
  const addDecMethod = async () => {
    const name = (window.prompt('New decoration method code (e.g. UV, Foil, DTG):') || '').trim();
    if (!name) return null;
    if (!decMethods.some(d => d.v === name)) {
      try {
        await api.adminSettings.set('custom_dec_types', [...customDecTypes.filter(c => c.v !== name), { v: name, l: name }]);
        queryClient.invalidateQueries({ queryKey: ['custom_dec_types'] });
      } catch (e) { setApiError(e.message); }
    }
    return name;
  };
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders.list, refetchInterval: 60_000, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: garmentReqs = [], refetch: refetchGarmentReqs } = useQuery({ queryKey: ['orderRequirements', 'garment'], queryFn: () => api.jobs.orderRequirements('garment'), enabled: activeModule === 'order-requirements', staleTime: 0, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: decorationReqs = [], refetch: refetchDecorationReqs } = useQuery({ queryKey: ['orderRequirements', 'decoration'], queryFn: () => api.jobs.orderRequirements('decoration'), enabled: activeModule === 'order-requirements', staleTime: 0, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: stockMovements = [] } = useQuery({ queryKey: ['stockMovements'], queryFn: () => api.inventory.movements({ limit: 50 }), refetchInterval: 60_000, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const { data: cardFiles = [] } = useQuery({ queryKey: ['cardFiles'], queryFn: api.cardFiles.list, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });
  const loading = (jobsLoading && !jobs.length) || (invLoading && !inventory.length);
  const [cardFileModal, setCardFileModal] = useState({ open: false, editing: null });
  const [cardFileForm, setCardFileForm] = useState({ shipCode: '', customerCode: '', companyName: '', contactName: '', address1: '', address2: '', suburb: '', state: '', postcode: '', country: 'AU', phone: '', email: '', notes: '' });
  const [selectedCardFile, setSelectedCardFile] = useState(null);
  const [cardFileSearch, setCardFileSearch] = useState('');
  const [cardFileGroup, setCardFileGroup] = useState('all');

  // Open Freight
  const [ofModalOpen, setOfModalOpen] = useState(false);
  const [ofTab, setOfTab] = useState('parcels');
  const [ofAccount, setOfAccount] = useState({ accountNumber: '', accountName: '', depot: '', contactName: '', contactPhone: '', contactEmail: '', apiKey: '', apiKeySet: false, notes: '' });
  const [ofAccountDirty, setOfAccountDirty] = useState(false);
  const [ofParcelModal, setOfParcelModal] = useState({ open: false, editing: null });
  const [ofParcelForm, setOfParcelForm] = useState({ name: '', parcelType: '', service: 'Standard', carrierCode: '', maxWeightKg: '', lengthCm: '', widthCm: '', heightCm: '', rate: '', notes: '' });

  // Both of these used to run on every load of the application. Nothing can
  // open the Open Freight modal (docs/backlog.md F6), so the app was fetching
  // an account and a parcel list that no user could reach — and the query
  // below raises a toast on failure, so a broken /open-freight endpoint
  // showed every user an error for a feature none of them can see.
  //
  // Gated on the modal rather than deleted: whether to wire the feature back
  // up or remove it is a product decision, and this costs nothing either way.
  const { data: ofParcels = [] } = useQuery({ enabled: ofModalOpen, queryKey: ['ofParcels'], queryFn: api.openFreight.listParcels, onError: (e) => { const m = e?.message || String(e); setApiError(m); notify(m, { type: 'error' }); } });

  // AI Assistant
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your ERP assistant — powered by live data + ML analytics.\n\nAsk me about jobs, inventory, revenue, or try:\n• *Forecast next month\'s revenue*\n• *Show anomalies*\n• *Customer churn risk*', ts: new Date() }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiClaudeEnabled, setAiClaudeEnabled] = useState(false);
  const aiEndRef = useRef(null);
  const aiDragOffset = useRef({ x: 0, y: 0 });
  const aiPanelRef = useRef(null);

  useEffect(() => {
    api.ai.status().then(s => setAiClaudeEnabled(!!s?.claude_available)).catch(() => {});
  }, []);
  const jobSearchRef = useRef(null);
  const [f12Open, setF12Open] = useState(false);
  const [f12Input, setF12Input] = useState('');
  const [f12Pos, setF12Pos] = useState(null);
  const f12Ref = useRef(null);
  const f12PopupRef = useRef(null);
  const f12DragOffset = useRef({ x: 0, y: 0 });

  // Warehouse bin map

  // Inventory module view state
  const [invTab, setInvTab] = useState('stock');
  const [invCatFilter, setInvCatFilter] = useState('all');
  const [invStatusFilter, setInvStatusFilter] = useState('all');

  // Suppliers module

  // Purchase Orders module
  const [selectedPO, setSelectedPO] = useState(null);
  const [poStatusFilter, setPoStatusFilter] = useState('all');
  const [receiveQtys, setReceiveQtys] = useState({});

  // Jim2 cycle: open a PO straight from a job line's PO#. Selecting it shows the
  // PO detail panel; if it isn't in the loaded list, surface it via search.
  const openPOById = (poNo) => {
    if (!poNo) return;
    const po = (purchaseOrders || []).find(p => String(p.id) === String(poNo));
    if (po) { setSelectedPO(po); setPoStatusFilter('all'); setSearchTerm(''); }
    else { setSearchTerm(String(poNo)); }
    setActiveModule('purchase-orders');
  };

  // Sidebar nav context menu
  const [navCtxMenu, setNavCtxMenu] = useState({ open: false, x: 0, y: 0, itemId: null, pinnedJobId: null });

  // Jim2-style UI state
  const [tigMenuOpen, setTigMenuOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState({ jobs: true });
  const [navTreeTab, setNavTreeTab] = useState('navigation');

  // New ribbon action modals
  const [dispatchModal, setDispatchModal] = useState({ open: false, job: null, shipVia: '', shipRef: '', cartons: 1, notes: '', advanceStatus: false, loading: false, error: '' });
  const [unprintModal, setUnprintModal] = useState({ open: false, job: null, loading: false, error: '' });
  const [salesRegModal, setSalesRegModal] = useState({ open: false, loading: false, dateFrom: '', dateTo: '', data: null, error: '' });
  const [transferModal, setTransferModal] = useState({ open: false, fromSku: '', toSku: '', toLocation: '', quantity: 1, fromBranch: DEFAULT_BRANCH, toBranch: DEFAULT_BRANCH, reference: '', notes: '', loading: false, error: '' });
  const [stocktakeModal, setStocktakeModal] = useState({ open: false, method: 'Informed', branch: DEFAULT_BRANCH, reference: '', items: [], loading: false, error: '', results: null });
  const [stockFlowModal, setStockFlowModal] = useState({ open: false, loading: false, data: null, search: '' });
  const [pickPackModal, setPickPackModal] = useState({ open: false, job: null });
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const globalSearchRef = useRef(null);

  // Job detail / list view separation
  const [showJobDetail, setShowJobDetail] = useState(false);
  const [jobListModal, setJobListModal] = useState({ open: false, draft: { ...EMPTY_JOB_LIST }, editingId: null });
  const [activeJobList, setActiveJobList] = useState(null); // matchJobList draft + name

  // Saved nav-tree lists (Jim2: named lists that run live in the tree, max 25
  // PER node, per user). Server-synced so lists follow the user across machines;
  // savedJobLists is the local mirror of /saved-lists.
  const JOB_LIST_MAX = 25;
  const [savedJobLists, setSavedJobLists] = useState([]);
  const { data: serverLists } = useQuery({ queryKey: ['savedLists'], queryFn: api.savedLists.list, staleTime: 30_000, onError: (e) => { const m = e?.message || String(e); setApiError(m); } });
  useEffect(() => { if (serverLists) setSavedJobLists(serverLists); }, [serverLists]);
  // One-time migration: lists created before server sync lived in localStorage.
  useEffect(() => {
    if (!serverLists || serverLists.length > 0) return;
    let local = [];
    try { local = JSON.parse(localStorage.getItem('tig.jobLists') || '[]'); } catch { return; }
    if (!local.length) return;
    Promise.allSettled(local.map(l => api.savedLists.create({ id: l.id, name: l.name, node: l.node || 'jobs', filter: l.filter ?? null })))
      .then(() => {
        try { localStorage.removeItem('tig.jobLists'); } catch { /* ignore */ }
        queryClient.invalidateQueries({ queryKey: ['savedLists'] });
      });
  }, [serverLists]);

  const listsForNode = (node) => savedJobLists.filter(l => (l.node || 'jobs') === node);
  const createListOnServer = async (item) => {
    try {
      await api.savedLists.create(item);
      setSavedJobLists(prev => [...prev, item]);
      return true;
    } catch (e) { notify(e.message || 'Could not save list', { type: 'error' }); return false; }
  };
  const updateListFilter = async (id, filter) => {
    try {
      await api.savedLists.update(id, { filter });
      setSavedJobLists(prev => prev.map(l => l.id === id ? { ...l, filter } : l));
    } catch (e) { notify(e.message || 'Could not update list', { type: 'error' }); }
  };
  // Returns true if saved, false if the node is already at the 25-list cap.
  const saveJobList = (name, filter, node = 'jobs') => {
    const sameNode = listsForNode(node);
    if (sameNode.length >= JOB_LIST_MAX) return false;
    const clean = (name || '').trim() || `Job List ${sameNode.length + 1}`;
    createListOnServer({ id: `JL-${Date.now()}`, name: clean, filter, node });
    return true;
  };
  const deleteJobList = async (id) => {
    try {
      await api.savedLists.delete(id);
      setSavedJobLists(prev => prev.filter(l => l.id !== id));
    } catch (e) { notify(e.message || 'Could not delete list', { type: 'error' }); }
  };
  // Jim2: "Create Job List" makes an empty list in the tree immediately, then you
  // filter + Run it. filter=null means "not run yet" (shows 0 until executed).
  const createEmptyJobList = async (node = 'jobs') => {
    if (listsForNode(node).length >= JOB_LIST_MAX) {
      notify(`Maximum ${JOB_LIST_MAX} lists on this node — delete one first.`, { type: 'error' });
      return;
    }
    const id = `JL-${Date.now()}`;
    const prefix = node === 'quotes' ? 'Quote List' : 'Job List';
    const name = `${prefix} ${listsForNode(node).length + 1}`;
    if (!(await createListOnServer({ id, name, filter: null, node }))) return;
    setShowJobDetail(false);
    setActiveModule(node === 'quotes' ? 'quotes' : 'jobs');
    setJobListModal({ open: true, draft: { ...EMPTY_JOB_LIST }, editingId: id });
  };

  // Stock Lists — same per-node model over inventory (node = 'stock').
  const [stockListModal, setStockListModal] = useState({ open: false, draft: { ...EMPTY_STOCK_LIST }, editingId: null });
  const [stockFocusSku, setStockFocusSku] = useState(null);
  const createEmptyStockList = async () => {
    if (listsForNode('stock').length >= JOB_LIST_MAX) {
      notify(`Maximum ${JOB_LIST_MAX} lists on this node — delete one first.`, { type: 'error' });
      return;
    }
    const id = `SL-${Date.now()}`;
    const name = `Stock List ${listsForNode('stock').length + 1}`;
    if (!(await createListOnServer({ id, name, filter: null, node: 'stock' }))) return;
    setActiveModule('inventory');
    setStockListModal({ open: true, draft: { ...EMPTY_STOCK_LIST }, editingId: id });
  };

  // Purchase Lists — same per-node model over purchase orders (node = 'purchases').
  const [poListModal, setPoListModal] = useState({ open: false, draft: { ...EMPTY_PO_LIST }, editingId: null });
  const [stockReportOpen, setStockReportOpen] = useState(false);
  // Jim2 Dispatch list: batch-dispatch ready + invoiced jobs
  const [dispatchListOpen, setDispatchListOpen] = useState(false);
  const [dispatchListBusy, setDispatchListBusy] = useState(false);
  const dispatchBatch = async (batch) => {
    setDispatchListBusy(true);
    try {
      // One transactional session (Jim2 Dispatch #) instead of N separate calls.
      const session = await api.dispatchSessions.create(batch);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      notify(`Dispatch #${session.id} recorded — ${session.line_count} job${session.line_count === 1 ? '' : 's'}`, { type: 'success' });
      setDispatchListOpen(false);
    } catch (e) {
      notify(e.message || 'Dispatch failed', { type: 'error' });
    } finally {
      setDispatchListBusy(false);
    }
  };
  const createEmptyPOList = async () => {
    if (listsForNode('purchases').length >= JOB_LIST_MAX) {
      notify(`Maximum ${JOB_LIST_MAX} lists on this node — delete one first.`, { type: 'error' });
      return;
    }
    const id = `PL-${Date.now()}`;
    const name = `Purchase List ${listsForNode('purchases').length + 1}`;
    if (!(await createListOnServer({ id, name, filter: null, node: 'purchases' }))) return;
    setActiveModule('purchase-orders');
    setPoListModal({ open: true, draft: { ...EMPTY_PO_LIST }, editingId: id });
  };

  // Order Requirements module

  // Job detail tabs
  const [jobDetailTab, setJobDetailTab] = useState('job');
  const [pickState, setPickState] = useState({});
  const [printDropdownOpen, setPrintDropdownOpen] = useState(false);
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const [jobsSort, setJobsSort] = useState({ col: 'dateIn', dir: 'desc' });

  // Customer detail

  // Document printing
  const [documentPrint, setDocumentPrint] = useState(null);

  // Invoice
  const [invoiceJob, setInvoiceJob] = useState(null);
  // Jim2 invoice documents: standard TAX Invoice, TAX Proforma, Proforma Balance ONLY
  const [invoiceVariant, setInvoiceVariant] = useState('standard');
  const openInvoiceDoc = (job, variant = 'standard') => { setInvoiceVariant(variant); setInvoiceJob(job); };
  const [emailModalJob, setEmailModalJob] = useState(null);
  const [matrixPopup, setMatrixPopup] = useState(null); // { idx } when open

  // Notifications panel
  const [notifOpen, setNotifOpen] = useState(false);

  // User settings
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [changePasswordMsg, setChangePasswordMsg] = useState('');


  // Bulk selection
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState(false);

  // Calendar view state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  // Dashboard quick notes
  const [dashNotes, setDashNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tig_dash_notes') || '[]'); } catch { return []; }
  });
  const [dashNoteInput, setDashNoteInput] = useState('');

  // Job templates (persisted in localStorage)
  const [jobTemplates, setJobTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tig_job_templates') || '[]'); } catch { return []; }
  });
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState('');
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);

  // Close context menu on any click outside
  useEffect(() => {
    const close = () => setCtxMenu(m => ({ ...m, visible: false }));
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // F12 — open quick job lookup popup
      if (e.key === 'F12') {
        e.preventDefault();
        setF12Open(o => { if (!o) { setF12Input(''); setF12Pos(null); } return !o; });
        setTimeout(() => f12Ref.current?.focus(), 50);
        return;
      }
      // Ctrl+S / Cmd+S — save active modal
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (showModal) {
          if (modalType === 'job') saveJob();
          else if (modalType === 'inventory') saveInventoryItem();
          else if (modalType === 'customer') saveCustomer();
          else if (modalType === 'supplier') saveSupplier();
          else if (modalType === 'po') savePO();
        }
        return;
      }
      // Ctrl+K / Cmd+K — global search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
        setGlobalSearchQuery('');
        setTimeout(() => globalSearchRef.current?.focus(), 50);
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.altKey) {
        if (e.key === 'j' || e.key === 'J') { e.preventDefault(); setActiveModule('jobs'); setTimeout(() => jobSearchRef.current?.focus(), 50); }
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setActiveModule('inventory'); }
        if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setActiveModule('dashboard'); }
        if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setActiveModule('customers'); }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setActiveModule('reports'); }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); if (activeModule === 'jobs') openModal('job'); else if (activeModule === 'inventory') openModal('inventory'); else if (activeModule === 'customers') openModal('customer'); }
      }
      if (e.key === 'Escape') {
        if (globalSearchOpen) { setGlobalSearchOpen(false); return; }
        if (f12Open) { setF12Open(false); return; }
        if (showModal) closeModal();
        if (activeJob) { setPinnedJobs([]); setActiveJob(null); setShowJobDetail(false); }
        setSelectedJobIds(new Set());
        setBulkActionOpen(false);
        setTemplateModalOpen(false);
        setTemplateSaveOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeModule, showModal, modalType, activeJob, f12Open, globalSearchOpen]);

  // Loaded when the modal opens rather than on mount, for the reason above.
  useEffect(() => {
    if (!ofModalOpen) return;
    api.openFreight.getAccount().then(acc => setOfAccount(acc)).catch(() => {});
  }, [ofModalOpen]);

  // Derive notifications from live data (useMemo avoids setState-in-effect infinite loop)
  const notifications = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lowStockItems = inventory.filter(needsReorder);
    const overdueJobs = jobs.filter(job => {
      if (['FINISH','PAID','CANCEL'].includes(job.status)) return false;
      try { const d = parseD(job.due); return d && d < now; } catch { return false; }
    });

    const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7);
    const expiringQuotes = jobs.filter(j => {
      if (j.status !== 'QUOTE' || !j.validityDate) return false;
      const d = parseD(j.validityDate);
      return d && d >= now && d <= in7Days;
    });

    const dueTodayJobs = jobs.filter(j => {
      if (['FINISH','PAID','CANCEL'].includes(j.status)) return false;
      const d = parseD(j.due);
      return d && d.toISOString().split('T')[0] === todayStr;
    });

    const creditBreaches = customers.filter(c => {
      if (!c.creditLimit || c.creditLimit <= 0) return false;
      const outstanding = jobs.filter(j => j.customerId === c.id).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
      return outstanding > c.creditLimit;
    });

    return [
      ...dueTodayJobs.map(job => ({
        id: `today-${job.id}`, type: 'warning', title: 'Due Today',
        message: `Job #${job.id} for ${job.customer} is due today — ${job.status}`,
        time: 'Today'
      })),
      ...overdueJobs.map(job => ({
        id: `overdue-${job.id}`, type: 'error', title: 'Overdue Job',
        message: `Job #${job.id} for ${job.customer} is overdue. Due: ${job.due}`,
        time: 'Now'
      })),
      ...expiringQuotes.map(job => ({
        id: `quote-exp-${job.id}`, type: 'warning', title: 'Quote Expiring',
        message: `Quote #${job.id} for ${job.customer} expires ${job.validityDate} — follow up needed`,
        time: 'Soon'
      })),
      ...creditBreaches.map(c => ({
        id: `credit-${c.id}`, type: 'error', title: 'Credit Limit Exceeded',
        message: `${c.name} has exceeded their credit limit of $${Number(c.creditLimit).toLocaleString('en-AU')}`,
        time: 'Now'
      })),
      ...lowStockItems.map(item => ({
        id: `low-${item.sku}`, type: 'warning', title: 'Low Stock Alert',
        message: `${item.name} (${item.sku}) is below reorder level. Current: ${item.stock}, Min: ${item.reorderLevel}`,
        time: 'Now'
      })),
    ];
  }, [inventory, jobs, customers]);

  useEffect(() => {
    if (!tigMenuOpen) return;
    const close = () => setTigMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [tigMenuOpen]);

  useEffect(() => {
    if (!navCtxMenu.open) return;
    const close = () => setNavCtxMenu(m => ({ ...m, open: false }));
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [navCtxMenu.open]);

  // Form state
  const [jobForm, setJobForm] = useState({
    customer: '',
    customerId: '',
    status: 'ORDER',
    priority: 'Normal',
    type: 'Standard',
    quote: '',
    dateIn: new Date().toISOString().split('T')[0],
    due: '',
    assignedTo: '',
    branch: 'HQ',
    shipToId: null,
    shippingAddress: '',
    paymentMethod: 'Account',
    paymentStatus: 'unpaid',
    commitmentDate: '',
    validityDate: '',
    locked: false,
    invoiceStatus: 'not_invoiced',
    proofStatus: 'none',
    proofNotes: '',
    priceLevel: '',
    accMgr: '',
    invoiceDesc: '',
    exJobRef: '',
    requestedBy: '',
    lockRate: false,
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
    contact: '',
    email: '',
    phone: '',
    mobile: '',
    address: '',
    abn: '',
    accountType: 'Account',
    paymentTerms: 'Net 30',
    creditLimit: 0,
    accountManager: ''
  });

  const [supplierForm, setSupplierForm] = useState({
    code: '',
    name: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: 'Net 30',
    currency: 'AUD',
    status: 'Active',
  });

  const [poForm, setPoForm] = useState({
    supplierCode: '',
    supplier: '',
    date: new Date().toISOString().split('T')[0],
    expectedDate: '',
    notes: '',
    items: [],
  });

  // Modal handlers
  const openModal = (type, item = null) => {
    setModalType(type);
    setEditingItem(item);
    
    if (type === 'job') {
      if (item) {
        const parseDateToInput = (dateStr) => {
          if (!dateStr) return '';
          const s = dateStr.split(' ')[0];
          const parts = s.split('/');
          if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          return s;
        };
        setJobForm({
          ...item,
          dateIn: parseDateToInput(item.dateIn),
          due: parseDateToInput(item.due),
          notes: item.notes || '',
          priceLevel: item.priceLevel ?? '',
          accMgr: item.accMgr ?? '',
          invoiceDesc: item.invoiceDesc ?? '',
          exJobRef: item.exJobRef ?? '',
          requestedBy: item.requestedBy ?? '',
          lockRate: item.lockRate ?? false,
        });
      } else {
        setJobForm({
          customer: '', customerId: '', status: 'ORDER', priority: 'Normal',
          type: 'Standard', quote: '', dateIn: new Date().toISOString().split('T')[0],
          due: '', out: '', assignedTo: '', branch: 'HQ', shipToId: null, shippingAddress: '',
          paymentMethod: 'Account', custRef: '', ourRef: '', description: '', shipTo: '',
          projectNo: '', notes: '', paymentStatus: 'unpaid', commitmentDate: '', validityDate: '',
          locked: false, invoiceStatus: 'not_invoiced', proofStatus: 'none', proofNotes: '',
          priceLevel: '', accMgr: '', invoiceDesc: '', exJobRef: '', requestedBy: '', lockRate: false,
          fuelLevy: 0, items: []
        });
      }
    } else if (type === 'inventory') {
      if (item) {
        const matchedSupplier = suppliers.find(s => s.name === item.supplier);
        setInventoryForm({ ...item, supplierCode: matchedSupplier?.code || '' });
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
          contact: '',
          email: '',
          phone: '',
          mobile: '',
          address: '',
          abn: '',
          accountType: 'Account',
          paymentTerms: 'Net 30',
          creditLimit: 0,
          accountManager: ''
        });
      }
    } else if (type === 'supplier') {
      if (item) {
        setSupplierForm(item);
      } else {
        setSupplierForm({ code: '', name: '', contact: '', email: '', phone: '', address: '', paymentTerms: 'Net 30', currency: 'AUD', status: 'Active' });
      }
    } else if (type === 'po') {
      setPoForm({ supplierCode: '', supplier: '', date: new Date().toISOString().split('T')[0], expectedDate: '', notes: '', items: [] });
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setEditingItem(null);
    setCustDropdown({ open: false, query: '', highlighted: 0 });
    setShipDropdown({ open: false, query: '', highlighted: 0 });
    setAssignedDropdown({ open: false, query: '', highlighted: 0 });
    setCategoryDropdown({ open: false, query: '', highlighted: 0 });
    setLocationDropdown({ open: false, query: '', highlighted: 0 });
    setDescDropdown({ idx: -1, query: '', highlighted: 0 });
    setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 });
  };

  // ── Job item helpers ──────────────────────────────────────────────────────
  const startLineItemsResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = lineItemsHeight;
    const onMove = (ev) => setLineItemsHeight(Math.max(120, startH + ev.clientY - startY));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startColResize = (col, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = (ev) => setColWidths(w => ({ ...w, [col]: Math.max(48, startW + ev.clientX - startX) }));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const blankItem = () => ({
    displayType: 'product', decorationType: 'None',
    description: '', sizes: '', stockCode: '', embCode: '', trsCode: '', decCode: '',
    stitchCount: '', colorCount: '', decPosition: '',
    order: 0, supply: 0, bOrd: 0, purchasePrice: 0, discount: 0, marginPercent: 0, margin: 0,
    priceEx: 0, priceInc: 0, total: 0,
    qtyDelivered: 0, qtyInvoiced: 0, qtyPick: 0, poNo: '', poDue: '', hide: false,
  });

  const addJobItem = () => setJobForm(f => ({
    ...f,
    items: [...f.items, blankItem()]
  }));

  const removeJobItem = (idx) => setJobForm(f => {
    const items = f.items.filter((_, i) => i !== idx);
    return recalcJobTotals({ ...f, items });
  });
  const ctxAddAbove = (idx) => setJobForm(f => { const items = [...f.items]; items.splice(idx, 0, blankItem()); return { ...f, items }; });
  const ctxAddBelow = (idx) => setJobForm(f => { const items = [...f.items]; items.splice(idx + 1, 0, blankItem()); return { ...f, items }; });
  const ctxDuplicate = (idx) => setJobForm(f => { const items = [...f.items]; items.splice(idx + 1, 0, { ...items[idx] }); return { ...f, items }; });
  const ctxMoveUp = (idx) => setJobForm(f => { if (idx === 0) return f; const items = [...f.items]; [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; return { ...f, items }; });
  const ctxMoveDown = (idx) => setJobForm(f => { if (idx >= f.items.length - 1) return f; const items = [...f.items]; [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]]; return { ...f, items }; });
  const ctxClearRow = (idx) => setJobForm(f => { const items = f.items.map((it, i) => i === idx ? blankItem() : it); return recalcJobTotals({ ...f, items }); });
  const closeCtx = () => setCtxMenu(m => ({ ...m, visible: false }));

  const updateJobItem = (idx, field, value) => setJobForm(f => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [field]: value };
    // Clear stale decoration fields when type changes
    if (field === 'decorationType') {
      if (value !== 'EMB') { items[idx].embCode = ''; items[idx].stitchCount = ''; }
      if (value !== 'TRS' && value !== 'SP') items[idx].trsCode = '';
      const newOpt = DEC_OPTIONS.find(d => d.v === value);
      if (!newOpt?.hasColors) items[idx].colorCount = '';
      items[idx].decPosition = '';
    }
    const it = items[idx];
    const qty = parseFloat(field === 'order' ? value : it.order) || 0;
    const bOrd = parseFloat(field === 'bOrd' ? value : it.bOrd) || 0;

    // Look up stock on hand for the linked SKU (null if no SKU or not in inventory)
    const stockCode = field === 'stockCode' ? value : it.stockCode;
    const invItem = stockCode ? inventory.find(i => i.sku === stockCode) : null;
    const soh = invItem != null ? Math.max(0, (invItem.stock || 0) - (invItem.committed_qty || 0)) : null; // available = on-hand − committed

    if (soh !== null) {
      // Stock-linked item: supply is always capped at what's on hand
      if (field === 'stockCode' || field === 'order') {
        const canSupply = Math.min(qty, soh);
        items[idx].supply = canSupply;
        items[idx].bOrd = Math.max(0, qty - canSupply);
      } else if (field === 'supply') {
        const capped = Math.min(Math.max(0, parseFloat(value) || 0), soh);
        items[idx].supply = capped;
        items[idx].bOrd = Math.max(0, qty - capped);
      } else if (field === 'bOrd') {
        const derivedSupply = Math.min(Math.max(0, qty - bOrd), soh);
        items[idx].supply = derivedSupply;
        items[idx].bOrd = Math.max(0, qty - derivedSupply);
      }
    } else {
      // No inventory link — free split
      const supply = parseFloat(field === 'supply' ? value : it.supply) || 0;
      if (field === 'order' || field === 'supply') {
        items[idx].bOrd = Math.max(0, qty - supply);
      } else if (field === 'bOrd') {
        items[idx].supply = Math.max(0, qty - bOrd);
      }
    }
    let priceEx = parseFloat(field === 'priceEx' ? value : it.priceEx) || 0;
    const purchasePrice = parseFloat(field === 'purchasePrice' ? value : it.purchasePrice) || 0;
    const discount = parseFloat(field === 'discount' ? value : it.discount) || 0;
    // priceInc edited directly → back-calculate priceEx
    if (field === 'priceInc' && parseFloat(value) > 0) {
      const derived = parseFloat((parseFloat(value) / 1.1).toFixed(2));
      items[idx].priceEx = derived;
      priceEx = derived;
    }
    // discount changed → un-apply previous discount from priceEx, then apply new one
    if (field === 'discount' && it.priceEx > 0) {
      const prevDiscount = parseFloat(it.discount) || 0;
      const basePrice = prevDiscount > 0 ? it.priceEx / (1 - prevDiscount / 100) : it.priceEx;
      priceEx = parseFloat((basePrice * (1 - discount / 100)).toFixed(4));
      items[idx].priceEx = parseFloat(priceEx.toFixed(2));
    }
    const priceInc = field === 'priceInc' ? parseFloat(value) || 0 : parseFloat((priceEx * 1.1).toFixed(2));
    if (field !== 'priceInc') items[idx].priceInc = priceInc;
    items[idx].total = parseFloat((qty * priceEx).toFixed(2));
    // margin only meaningful when cost has been entered
    if (priceEx > 0 && purchasePrice > 0) {
      items[idx].margin = parseFloat((priceEx - purchasePrice).toFixed(2));
      items[idx].marginPercent = parseFloat(((priceEx - purchasePrice) / priceEx * 100).toFixed(1));
    } else {
      items[idx].margin = 0;
      items[idx].marginPercent = 0;
    }
    return recalcJobTotals({ ...f, items });
  });

  const recalcJobTotals = (form) => {
    const subtotal = form.items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const tax = parseFloat((subtotal * 0.1).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));
    const balanceDue = parseFloat((total - (parseFloat(form.invoicePaid) || 0)).toFixed(2));
    return { ...form, subtotal, tax, total, balanceDue };
  };

  // Pinned-job helpers
  const pinJob = (job) => {
    setPinnedJobs(prev => prev.find(j => j.id === job.id) ? prev.map(j => j.id === job.id ? job : j) : [...prev, job]);
    setActiveJob(job);
    setShowJobDetail(true);
  };

  const unpinJob = (jobId) => {
    setPinnedJobs(prev => prev.filter(j => j.id !== jobId));
    setActiveJob(cur => (cur?.id === jobId ? null : cur));
    if (activeJob?.id === jobId) setShowJobDetail(false);
  };

  const updatePinnedJob = (updated) => {
    setPinnedJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    setActiveJob(cur => (cur?.id === updated.id ? updated : cur));
  };

  // CRUD operations
  const saveJob = async () => {
    if (!jobForm.customerId) {
      const msg = 'Pick a customer before saving — type a name in the Customer field or choose one from Cust #.';
      setApiError(msg);
      notify(msg, { type: 'error' });
      return;
    }
    try {
      const formWithTotals = recalcJobTotals(jobForm);
      if (editingItem) {
        const updated = await api.jobs.update(editingItem.id, formWithTotals);
        updatePinnedJob(updated);
        notify(`Job ${editingItem.id} saved`, { type: 'success' });
      } else {
        const created = await api.jobs.create(formWithTotals);
        notify(`Job ${created?.id ?? ''} created`.trim(), { type: 'success' });
      }
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      closeModal();
    } catch (e) {
      setApiError(e.message);
      notify(e.message || 'Could not save job', { type: 'error' });
    }
  };

  const deleteJob = (jobId) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete job #${jobId}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.jobs.delete(jobId);
          unpinJob(jobId);
          queryClient.invalidateQueries({ queryKey: ['jobs'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  // ── Job Templates ──────────────────────────────────────────────────────────
  const saveJobTemplate = (name) => {
    const tpl = { id: Date.now(), name, items: jobForm.items, notes: jobForm.notes };
    const updated = [...jobTemplates, tpl];
    setJobTemplates(updated);
    localStorage.setItem('tig_job_templates', JSON.stringify(updated));
    setTemplateSaveOpen(false);
    setTemplateSaveName('');
  };

  const loadJobTemplate = (tpl) => {
    setJobForm(f => recalcJobTotals({ ...f, items: tpl.items.map(it => ({ ...it })), notes: tpl.notes || f.notes }));
    setTemplateModalOpen(false);
  };

  const deleteJobTemplate = (id) => {
    const updated = jobTemplates.filter(t => t.id !== id);
    setJobTemplates(updated);
    localStorage.setItem('tig_job_templates', JSON.stringify(updated));
  };

  // ── Payment terms → due date ───────────────────────────────────────────────
  const calcDueFromTerms = (terms, fromDate) => {
    const base = fromDate ? new Date(fromDate) : new Date();
    const days = terms?.startsWith('Net ') ? parseInt(terms.replace('Net ', ''), 10)
                 : terms === 'COD' || terms === 'On Receipt' ? 0
                 : terms === 'EOM' ? (() => { const d = new Date(base); d.setMonth(d.getMonth() + 1, 0); return Math.floor((d - base) / 86400000); })()
                 : 30;
    const due = new Date(base);
    due.setDate(due.getDate() + (isNaN(days) ? 30 : days));
    return due.toISOString().split('T')[0];
  };

  const applyCustomerToJobForm = (c) => ({
    customer: c.name,
    customerId: c.id || '',
    shippingAddress: c.address || '',
    due: calcDueFromTerms(c.paymentTerms),
    nameContact: c.contact || '',
  });

  // ── Job Cloning ────────────────────────────────────────────────────────────
  const cloneJob = (job) => {
    openModal('job');
    setTimeout(() => {
      setJobForm(f => recalcJobTotals({
        ...f,
        customer: job.customer,
        customerId: job.customerId,
        status: 'QUOTE',
        priority: job.priority,
        type: job.type,
        assignedTo: job.assignedTo,
        shippingAddress: job.shippingAddress,
        paymentMethod: job.paymentMethod,
        shipTo: job.shipTo,
        custRef: job.custRef || '',
        ourRef: job.ourRef || '',
        description: job.description || '',
        notes: job.notes || '',
        items: (job.items || []).map(it => ({ ...it, id: undefined })),
      }));
    }, 0);
  };

  // ── Bulk Operations ────────────────────────────────────────────────────────
  const toggleJobSelect = (id) => setSelectedJobIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = (jobs) => {
    if (selectedJobIds.size === jobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(jobs.map(j => j.id)));
    }
  };

  const bulkStatusChange = async (status) => {
    const ids = [...selectedJobIds];
    const failed = [];
    for (const id of ids) {
      try {
        await api.jobs.updateStatus(id, status);
      } catch (e) {
        failed.push(`#${id} ${e?.message || 'refused'}`);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    setSelectedJobIds(new Set());
    setBulkActionOpen(false);
    if (failed.length) {
      notify(`${failed.length} of ${ids.length} jobs did not move to ${status} — ${failed.join('; ')}`, { type: 'error' });
    }
  };

  const bulkDelete = () => {
    const ids = [...selectedJobIds];
    setConfirmModal({
      show: true,
      message: `Delete ${ids.length} selected jobs? This cannot be undone.`,
      onConfirm: async () => {
        const failed = [];
        for (const id of ids) {
          try {
            await api.jobs.delete(id);
          } catch (e) {
            failed.push(`#${id} ${e?.message || 'refused'}`);
          }
        }
        if (failed.length) {
          notify(`${failed.length} of ${ids.length} jobs were not deleted — ${failed.join('; ')}`, { type: 'error' });
        }
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        setSelectedJobIds(new Set());
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveInventoryItem = async () => {
    try {
      if (editingItem) {
        await api.inventory.update(editingItem.sku, inventoryForm);
      } else {
        await api.inventory.create(inventoryForm);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteInventoryItem = (sku) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete SKU "${sku}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.inventory.delete(sku);
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveCustomer = async () => {
    try {
      if (editingItem) {
        await api.customers.update(editingItem.id, customerForm);
      } else {
        await api.customers.create(customerForm);
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteCustomer = (customerId) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete this customer? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.customers.delete(customerId);
          queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveSupplier = async () => {
    try {
      if (editingItem) {
        await api.suppliers.update(editingItem.code, supplierForm);
      } else {
        await api.suppliers.create(supplierForm);
      }
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteSupplier = (code) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete this supplier? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.suppliers.delete(code);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const savePO = async () => {
    try {
      await api.purchaseOrders.create(poForm);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const updatePOStatus = async (id, status) => {
    try {
      await api.purchaseOrders.updateStatus(id, status);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    } catch (e) { setApiError(e.message); }
  };

  const deletePO = (id) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete PO ${id}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.purchaseOrders.delete(id);
          if (selectedPO?.id === id) setSelectedPO(null);
          queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const receivePO = async (po) => {
    const items = (po.items || [])
      .map(item => ({ id: item.id, qty_received: parseInt(receiveQtys[`${po.id}-${item.id}`] || 0, 10) }))
      .filter(i => i.qty_received > 0);
    if (!items.length) { setApiError('Enter at least one received quantity.'); return; }
    try {
      const updated = await api.purchaseOrders.receive(po.id, items);
      setSelectedPO(updated);
      setReceiveQtys({});
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) { setApiError(e.message); }
  };

  const updateJobStatus = async (jobId, newStatus) => {
    try {
      const updated = await api.jobs.updateStatus(jobId, newStatus);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  const updateJobDue = async (jobId, newDue) => {
    try {
      const updated = await api.jobs.patchDue(jobId, newDue);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  // Rethrows. The stock-adjust dialog closes itself on success and the server
  // refuses an adjustment that would take a line negative, so swallowing here
  // closed the dialog on a rejected write exactly as it does on an applied one.
  const adjustStock = async (sku, adjustment, reason) => {
    try {
      await api.inventory.adjust(sku, adjustment, reason);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) {
      setApiError(e.message);
      throw e;
    }
  };

  const addJobComment = async (jobId, comment, isInternal = false) => {
    try {
      await api.jobs.addComment(jobId, comment, isInternal);
      const updated = await api.jobs.get(jobId);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  // Rethrows rather than resolving on failure. The payment modal has to be able
  // to tell a failed record from a successful one: it closes itself on success,
  // and on the Tyro path the card has already been charged by the time this
  // runs. Swallowing here made a taken-but-unrecorded payment look identical to
  // a completed one, and left the modal's own recovery branch unreachable.
  const recordPayment = async (jobId, amount, method) => {
    try {
      const updated = await api.jobs.recordPayment(jobId, amount, method);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) {
      setApiError(e.message);
      throw e;
    }
  };

  // Dashboard calculations
  const dashboardStats = (() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const parseJobDate = (str) => { if (!str) return null; const s = str.split(' ')[0]; const p = s.split('/'); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s); };
    const isOverdue = (j) => { if (['FINISH','PAID','CANCEL'].includes(j.status)) return false; const d = parseJobDate(j.due); return d && d < now; };
    const jobDateIn = (j) => { const d = parseJobDate(j.dateIn); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : ''; };
    const revenueThisMonth = jobs.filter(j => jobDateIn(j) === thisMonth).reduce((s, j) => s + (j.total || 0), 0);
    const revenueLastMonth = jobs.filter(j => jobDateIn(j) === lastMonth).reduce((s, j) => s + (j.total || 0), 0);
    const revChange = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100) : null;
    const overdueJobs = jobs.filter(isOverdue);
    const quotesAwaitingApproval = jobs.filter(j => j.status === 'QUOTE').length;
    const inProduction = jobs.filter(j => ['ORDER','In Progress','PROOF','PRINT','Pick/Pack'].includes(j.status)).length;
    const toInvoice = jobs.filter(j => j.invoiceStatus === 'to_invoice').length;
    const statusBreakdown = {};
    ['QUOTE','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE'].forEach(s => { statusBreakdown[s] = jobs.filter(j => j.status === s).length; });

    // On-time delivery rate (finished/invoiced/paid jobs in last 90 days that met their due date)
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const completedRecent = jobs.filter(j => {
      if (!['FINISH','INVOICE','PAID'].includes(j.status)) return false;
      const d = parseJobDate(j.dateIn); return d && d >= ninetyDaysAgo;
    });
    const onTimeCount = completedRecent.filter(j => {
      const due = parseJobDate(j.due); const out = parseJobDate(j.out);
      if (!due) return true;
      const completedDate = out || now;
      return completedDate <= due;
    }).length;
    const onTimeRate = completedRecent.length > 0 ? Math.round((onTimeCount / completedRecent.length) * 100) : null;

    // Quotes expiring within 7 days
    const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7);
    const quoteExpiringSoon = jobs.filter(j => {
      if (j.status !== 'QUOTE') return false;
      if (!j.validityDate) return false;
      const d = parseJobDate(j.validityDate);
      return d && d >= now && d <= in7Days;
    });

    // Jobs due today
    const dueToday = jobs.filter(j => {
      if (['FINISH','PAID','CANCEL'].includes(j.status)) return false;
      const d = parseJobDate(j.due);
      if (!d) return false;
      return d.toISOString().split('T')[0] === todayStr;
    });

    // Jobs due in next 48 hours (not today)
    const in48h = new Date(now); in48h.setHours(in48h.getHours() + 48);
    const dueSoon = jobs.filter(j => {
      if (['FINISH','PAID','CANCEL'].includes(j.status)) return false;
      const d = parseJobDate(j.due);
      if (!d) return false;
      const ds = d.toISOString().split('T')[0];
      return ds > todayStr && d <= in48h;
    });

    // 6-month revenue trend
    const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-AU', { month: 'short' });
      const rev = jobs.filter(j => ['INVOICE','PAID','FINISH'].includes(j.status) && jobDateIn(j) === key)
        .reduce((s, j) => s + (j.subtotal || 0), 0);
      return { month: label, revenue: Math.round(rev) };
    });

    // Top 5 customers by revenue
    const custRevMap = {};
    jobs.filter(j => ['INVOICE','PAID'].includes(j.status)).forEach(j => {
      const key = j.customerId || j.customer || 'Unknown';
      const name = j.customer || key;
      if (!custRevMap[key]) custRevMap[key] = { name, revenue: 0, jobCount: 0 };
      custRevMap[key].revenue += (j.subtotal || 0);
      custRevMap[key].jobCount += 1;
    });
    const topCustomers = Object.values(custRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(c => ({
      ...c, revenue: Math.round(c.revenue)
    }));

    // Average margin across jobs with items
    const jobsWithItems = jobs.filter(j => j.items && j.items.length > 0);
    const avgMarginPct = jobsWithItems.length > 0
      ? jobsWithItems.reduce((s, j) => {
          const rev = j.subtotal || 0;
          const cost = (j.items || []).reduce((cs, i) => cs + (parseFloat(i.purchasePrice || 0) * parseInt(i.order || 0, 10)), 0);
          return s + (rev > 0 ? ((rev - cost) / rev) * 100 : 0);
        }, 0) / jobsWithItems.length
      : null;

    // Decoration type breakdown across all job items
    const decBreakdown = {};
    let totalStitches = 0;
    jobs.forEach(j => (j.items || []).forEach(i => {
      if (i.decorationType && i.decorationType !== 'None') {
        decBreakdown[i.decorationType] = (decBreakdown[i.decorationType] || 0) + 1;
        if (i.decorationType === 'EMB' && i.stitchCount) totalStitches += parseInt(i.stitchCount) || 0;
      }
    }));

    return {
      activeJobs: jobs.filter(j => !['FINISH','PAID','CANCEL'].includes(j.status)).length,
      completedToday: jobs.filter(j => j.status === 'FINISH' && j.out === now.toLocaleDateString('en-GB')).length,
      pendingInvoices: jobs.filter(j => j.balanceDue > 0).length,
      lowStock: countNeedingReorder(inventory),
      totalRevenue: jobs.reduce((sum, j) => sum + (j.total || 0), 0),
      outstandingPayments: jobs.reduce((sum, j) => sum + (j.balanceDue || 0), 0),
      warehouseCapacity: Math.round((WAREHOUSE_ZONES.reduce((sum, z) => sum + (z.capacity * z.utilization / 100), 0) / (WAREHOUSE_ZONES.reduce((sum, z) => sum + z.capacity, 0) || 1)) * 100),
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.status === 'Active').length,
      avgOrderValue: jobs.length > 0 ? jobs.reduce((sum, j) => sum + (j.total || 0), 0) / jobs.length : 0,
      revenueThisMonth, revenueLastMonth, revChange,
      overdueJobs, quotesAwaitingApproval, inProduction, toInvoice, statusBreakdown,
      onTimeRate, quoteExpiringSoon, dueToday, dueSoon,
      revenueByMonth, topCustomers, avgMarginPct, decBreakdown, totalStitches,
    };
  })();

  // Auto-reorder
  const runAutoReorder = async () => {
    try {
      const result = await api.inventory.autoReorder();
      if (result.created === 0) {
        setApiError('No low-stock items found — all inventory is above reorder levels.');
      } else {
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
        setApiError('');
        alert(`Auto-reorder complete: ${result.created} draft PO(s) created (${result.purchase_orders.join(', ')}). Check the Purchase Orders tab.`);
      }
    } catch (e) { setApiError(e.message); }
  };

  // AI chat
  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg, ts: new Date() }]);
    setAiLoading(true);
    try {
      const context = `Jobs: ${jobs.length} total, ${jobs.filter(j => j.status === 'FINISH').length} finished. ` +
        `Inventory: ${inventory.length} SKUs, ${countNeedingReorder(inventory)} low stock. ` +
        `Customers: ${customers.length}. Suppliers: ${suppliers.length}. ` +
        `Purchase Orders: ${purchaseOrders.length} total, ${purchaseOrders.filter(p => p.status === 'Draft').length} drafts. ` +
        `Revenue this period: $${jobs.reduce((s, j) => s + (j.total || 0), 0).toLocaleString()}.`;
      const res = await api.ai.chat(userMsg, context);
      setAiMessages(prev => [...prev, { role: 'assistant', text: res.response, ts: new Date() }]);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}`, ts: new Date() }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };


  // Change password
  const handleChangePassword = async () => {
    if (changePasswordForm.newPass !== changePasswordForm.confirm) {
      setChangePasswordMsg('New passwords do not match.');
      return;
    }
    try {
      await api.auth.changePassword(changePasswordForm.current, changePasswordForm.newPass);
      setChangePasswordMsg('Password changed successfully.');
      setChangePasswordForm({ current: '', newPass: '', confirm: '' });
    } catch (e) {
      setChangePasswordMsg(e.message);
    }
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
    openInvoiceDoc(job);
  };

  const _legacyPrintInvoice_unused = (job) => {
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
          <h1>Total Image</h1>
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
  const renderDashboard = () => {
    return (
      <Dashboard
        jobs={jobs}
        onNewJob={() => openModal('job')}
        onNavigateJobs={() => setActiveModule('jobs')}
      />
    );
  };
  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterCustomer('all');
    setFilterAssignedTo('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterShipCode('all');
    setFilterCustomerGroup('all');
    setFilterOpenFreight(false);
    setFilterQuick(null);
    setActiveJobList(null);
  };

  const setJobsFilter = (key, value) => {
    const setters = {
      searchTerm: setSearchTerm,
      status: setFilterStatus,
      priority: setFilterPriority,
      customer: setFilterCustomer,
      assignedTo: setFilterAssignedTo,
      dateFrom: setFilterDateFrom,
      dateTo: setFilterDateTo,
      dateField: setFilterDateField,
      shipCode: setFilterShipCode,
      customerGroup: setFilterCustomerGroup,
      openFreight: setFilterOpenFreight,
      quick: setFilterQuick,
      jobList: setActiveJobList,
    };
    setters[key]?.(value);
  };

  // Render Jobs Module
  const renderJobs = () => {
    const jStatusColors = {
      QUOTE:'bg-hairline-soft text-header', New:'bg-accent-tint text-accent-strong', ORDER:'bg-accent-tint text-accent-strong',
      'In Progress':'bg-warn-tint text-warn', PROOF:'bg-emphasis-tint text-emphasis', PRINT:'bg-accent-tint text-accent-strong',
      'Pick/Pack':'bg-accent-tint text-accent-strong', FINISH:'bg-ok-tint text-ok', INVOICE:'bg-accent-tint text-accent-strong',
      PAID:'bg-ok-tint text-ok', CANCEL:'bg-danger-tint text-danger',
    };

    return (
      <div className="space-y-4">
        {!showJobDetail && (
          <JobsModule
            jobs={jobs}
            filters={{
              searchTerm,
              status: filterStatus,
              priority: filterPriority,
              customer: filterCustomer,
              assignedTo: filterAssignedTo,
              dateFrom: filterDateFrom,
              dateTo: filterDateTo,
              dateField: filterDateField,
              shipCode: filterShipCode,
              customerGroup: filterCustomerGroup,
              openFreight: filterOpenFreight,
              quick: filterQuick,
              jobList: activeJobList,
            }}
            onFilterChange={setJobsFilter}
            onClearFilters={clearFilters}
            viewMode={jobsViewMode === 'board' ? 'board' : 'table'}
            onViewModeChange={setJobsViewMode}
            currentUser={currentUser}
            onJobClick={(job) => { setActiveJob(job); setShowJobDetail(true); }}
            lockedStatus={activeModule === 'quotes' ? 'QUOTE' : undefined}
          />
        )}

        {/* Job Detail — full-page child module */}
        {activeJob && showJobDetail && (
          <div className="space-y-3">
            {/* ── Breadcrumb ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 text-sm select-none rounded-xl shadow-sm px-4 py-2.5" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
              <button onClick={() => setShowJobDetail(false)} className="flex items-center gap-1 font-medium transition-colors shrink-0" style={{ color: T.accentStrong }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                Jobs
              </button>
              <span style={{ color: T.hairline }}>/</span>
              <span className="font-mono text-xs shrink-0" style={{ color: T.accentStrong }}>#{activeJob.id}</span>
              <span style={{ color: T.hairline }}>/</span>
              <span className="font-medium truncate" style={{ color: T.text }}>{activeJob.customer}</span>
              <span className="shrink-0"><StatusBadge status={activeJob.status} size="sm" /></span>
              {activeJob.locked && <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: T.accentTint, color: T.accentStrong }}>🔒 Locked</span>}
              {activeJob.priority === 'Urgent' && <span className="shrink-0 text-xs bg-danger-tint text-danger px-2 py-0.5 rounded-full font-semibold">Urgent</span>}
              <div className="flex-1" />
              {activeJob.status === 'QUOTE' && (
                <button onClick={() => updateJobStatus(activeJob.id, 'ORDER')} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-accent-strong text-white rounded-lg hover:bg-accent-strong font-medium">
                  Convert to Order →
                </button>
              )}
              <button onClick={() => openModal('job', activeJob)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-accent-strong text-white rounded-lg hover:bg-accent-strong font-medium">
                <Edit className="w-3.5 h-3.5" />Edit
              </button>
              <button onClick={() => cloneJob(activeJob)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-white border text-muted rounded-lg hover:bg-panel-alt font-medium">
                <Copy className="w-3.5 h-3.5" />Clone
              </button>
              <div className="relative shrink-0">
                <button onClick={() => setPrintDropdownOpen(o => !o)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white border text-muted rounded-lg hover:bg-panel-alt font-medium">
                  <Printer className="w-3.5 h-3.5" />Print<ChevronDown className="w-3 h-3" />
                </button>
                {printDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-2xl z-30 w-44 py-1.5 overflow-hidden" onMouseLeave={() => setPrintDropdownOpen(false)}>
                    {[
                      { type:'invoice',      label:'TAX Invoice',    action:()=>{ openInvoiceDoc(activeJob); setPrintDropdownOpen(false); } },
                      { type:'proforma',     label:'Proforma Invoice', action:()=>{ openInvoiceDoc(activeJob, 'proforma'); setPrintDropdownOpen(false); } },
                      { type:'proformaBal',  label:'Proforma — Balance ONLY', action:()=>{ openInvoiceDoc(activeJob, 'proformaBalance'); setPrintDropdownOpen(false); } },
                      { type:'pickingSlip',  label:'Picking Slip',   action:()=>{ setDocumentPrint({ type:'pickingSlip',  job:activeJob }); setPrintDropdownOpen(false); } },
                      { type:'deliveryNote', label:'Delivery Note',  action:()=>{ setDocumentPrint({ type:'deliveryNote', job:activeJob }); setPrintDropdownOpen(false); } },
                      { type:'jobSheet',     label:'Job Sheet',      action:()=>{ setDocumentPrint({ type:'jobSheet',     job:activeJob }); setPrintDropdownOpen(false); } },
                      { type:'shipLabel',    label:'Ship Label',     action:()=>{ setDocumentPrint({ type:'shipLabel',    job:activeJob }); setPrintDropdownOpen(false); } },
                    ].map(d => (
                      <button key={d.type} onClick={d.action} className="w-full text-left px-4 py-2 text-sm hover:bg-panel-alt flex items-center gap-2">
                        <Printer className="w-3.5 h-3.5 text-faint" />{d.label}
                      </button>
                    ))}
                    <div className="border-t mx-2 my-1" />
                    <a
                      href={`/api/jobs/${activeJob.id}/pdf?type=${activeJob.status === 'QUOTE' ? 'quote' : 'invoice'}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setPrintDropdownOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-ok-tint flex items-center gap-2 text-ok no-underline"
                    >
                      <Download className="w-3.5 h-3.5" />Download PDF
                    </a>
                  </div>
                )}
              </div>
              <button onClick={() => setEmailModalJob(activeJob)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-white border text-muted rounded-lg hover:bg-panel-alt font-medium">
                <Mail className="w-3.5 h-3.5" />Email
              </button>
            </div>
            <div className="flex gap-4 items-start">
              <div className="flex-1 min-w-0">

            {/* ── Detail card ────────────────────────────────────────────── */}
            <div className="rounded-xl shadow-sm p-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            {/* Jim2-style compact header grid */}
            {(() => {
              const F = ({ label, value, badge, mono, red, green }) => (
                <div className="flex items-baseline gap-1 min-w-0 py-0.5" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                  <span className="text-xs whitespace-nowrap shrink-0 w-20" style={{ color: T.textFaint }}>{label}</span>
                  {badge
                    ? <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${badge}`}>{value || '—'}</span>
                    : <span className={`text-xs font-medium truncate ${mono ? 'font-mono' : ''}`} style={{ color: mono ? T.accentStrong : red ? T.danger : green ? T.ok : T.text }}>{value || <span style={{ color: T.textFaint }}>—</span>}</span>}
                </div>
              );
              const isOverdue = (d) => d && new Date(d.split('/').reverse().join('-')) < new Date() && !['FINISH','PAID','CANCEL'].includes(activeJob.status);
              return (
                <div className="grid grid-cols-4 gap-x-6 mb-5 pb-4 text-xs" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                  {/* Col 1 – job identity */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>Job</div>
                    <F label="Job #" value={activeJob.id} mono />
                    <F label="Cust Ref#" value={activeJob.custRef} />
                    <F label="Invoice#" value={activeJob.invoice} mono />
                    <F label="Date In" value={activeJob.dateIn} />
                    <F label="Desc." value={activeJob.description} />
                    <F label="Project#" value={activeJob.projectNo} />
                    <F label="Serial#" value={activeJob.serialNo} />
                    <F label="Quote Ref" value={activeJob.quote} />
                  </div>
                  {/* Col 2 – customer & shipping */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>Customer</div>
                    <F label="Cust#" value={activeJob.customerId} mono />
                    <F label="Name" value={activeJob.customer} />
                    <F label="Contact" value={activeJob.nameContact} />
                    <F label="Ship#" value={activeJob.shipTo} mono />
                    <F label="Our Ref#" value={activeJob.ourRef} />
                    <F label="Assigned" value={activeJob.assignedTo} />
                    {activeJob.shippingAddress && (
                      <div className="mt-1 text-xs rounded px-1.5 py-1 leading-relaxed" style={{ color: T.textMuted, background: T.hairlineSoft }}>{activeJob.shippingAddress}</div>
                    )}
                  </div>
                  {/* Col 3 – status & dates */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>Status & Dates</div>
                    <div className="flex items-baseline gap-1 min-w-0 py-0.5" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                      <span className="text-xs whitespace-nowrap shrink-0 w-20" style={{ color: T.textFaint }}>Status</span>
                      <StatusBadge status={activeJob.status} size="sm" />
                    </div>
                    <F label="Priority" value={activeJob.priority}
                      red={['High','Urgent'].includes(activeJob.priority)} />
                    <F label="Type" value={activeJob.type} />
                    <F label="Due" value={activeJob.due} red={isOverdue(activeJob.due)} />
                    <F label="Out" value={activeJob.out} />
                    <F label="Commitment" value={activeJob.commitmentDate} />
                    {activeJob.validityDate && (
                      <F label="Valid Until" value={activeJob.validityDate}
                        red={new Date(activeJob.validityDate) < new Date()} />
                    )}
                  </div>
                  {/* Col 4 – financial */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>Financial</div>
                    <F label="Payment" value={activeJob.paymentMethod} />
                    <F label="Paid Status" value={activeJob.paymentStatus || 'unpaid'}
                      badge={activeJob.paymentStatus === 'paid' ? 'bg-ok-tint text-ok' : activeJob.paymentStatus === 'partial' ? 'bg-warn-tint text-warn' : 'bg-danger-tint text-danger'} />
                    <F label="Inv. Status" value={(activeJob.invoiceStatus || 'not_invoiced').replace(/_/g, ' ')}
                      badge={activeJob.invoiceStatus === 'invoiced' ? 'bg-accent-tint text-accent-strong' : activeJob.invoiceStatus === 'to_invoice' ? 'bg-accent-tint text-accent-strong' : 'bg-hairline-soft text-muted'} />
                    {activeJob.proofStatus && activeJob.proofStatus !== 'none' && (
                      <F label="Proof" value={activeJob.proofStatus}
                        badge={activeJob.proofStatus === 'approved' ? 'bg-ok-tint text-ok' : activeJob.proofStatus === 'rejected' ? 'bg-danger-tint text-danger' : 'bg-warn-tint text-warn'} />
                    )}
                    <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: `1px solid ${T.hairline}` }}>
                      <div className="flex justify-between text-xs"><span style={{ color: T.textMuted }}>Subtotal</span><span className="font-medium">${(activeJob.subtotal || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: T.textMuted }}>GST</span><span className="font-medium">${(activeJob.tax || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm font-bold pt-1 mt-1" style={{ borderTop: `1px solid ${T.hairline}` }}><span>Total</span><span>${(activeJob.total || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: T.textMuted }}>Paid</span><span className="font-medium" style={{ color: T.ok }}>${(activeJob.invoicePaid || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: T.textMuted }}>Balance</span>
                        <span className="font-semibold" style={{ color: activeJob.balanceDue > 0 ? T.danger : T.ok }}>${(activeJob.balanceDue || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    {activeJob.balanceDue > 0 && (
                      <button
                        onClick={() => setPaymentModal({ show: true, jobId: activeJob.id, maxAmount: activeJob.balanceDue, amount: activeJob.balanceDue.toFixed(2), method: 'Credit Card' })}
                        className="mt-2 w-full text-white px-2 py-1.5 rounded text-xs flex items-center justify-center gap-1"
                        style={{ background: T.ok }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        <CreditCard className="w-3 h-3" />Record Payment
                      </button>
                    )}
                    {activeJob.locked && (
                      <div className="mt-1 text-center text-xs font-semibold px-2 py-1 rounded" style={{ background: T.accentTint, color: T.accentStrong }}>🔒 Locked</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Jim2-style Invoice Details (Customer / Ship) ── */}
            {(() => {
              const cust = customers.find(c => String(c.id) === String(activeJob.customerId));
              const Row = ({ label, value, mono, accent }) => (
                <div className="flex items-baseline gap-2 py-0.5" style={{ borderBottom: `1px solid ${T.hairlineSoft}` }}>
                  <span className="text-xs shrink-0 w-16" style={{ color: T.textFaint }}>{label}</span>
                  <span className={`text-xs font-medium truncate ${mono ? 'font-mono' : ''}`} style={{ color: accent ? T.accentStrong : value ? T.text : T.textFaint }}>{value || '—'}</span>
                </div>
              );
              return (
                <div className="mb-4 rounded overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                  <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: T.chrome, borderLeft: `3px solid ${T.accent}` }}>
                    <FileText className="w-3.5 h-3.5" style={{ color: T.accent }} />
                    <span className="text-xs font-semibold" style={{ color: T.chromeText }}>Invoice Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>Customer (Bill To)</div>
                      <Row label="Cust#" value={activeJob.customerId} mono accent />
                      <Row label="Name" value={cust?.name || activeJob.customer} />
                      <Row label="Attn" value={cust?.contact} />
                      <Row label="Address" value={cust?.address} />
                      <Row label="Phone" value={cust?.phone || cust?.mobile} />
                      <Row label="Email" value={cust?.email} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>Ship To</div>
                      <Row label="Ship#" value={activeJob.shipTo} mono accent />
                      <Row label="Attn" value={activeJob.nameContact} />
                      <Row label="Address" value={activeJob.shippingAddress} />
                      <Row label="Our Ref#" value={activeJob.ourRef} />
                      <Row label="Branch" value={activeJob.branch} />
                      <Row label="Weight" value={activeJob.weightTotal ? `${activeJob.weightTotal} kg` : ''} />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Jim2-style Comments panel (middle, always visible) ── */}
            <div className="mb-4 rounded" style={{ background: T.hairlineSoft, border: `1px solid ${T.hairline}` }}>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-t" style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>Comments & Activity</span>
                <span className="text-[10px]" style={{ color: T.textFaint }}>{(activeJob.comments || []).length} entries</span>
              </div>
              {(activeJob.comments || []).length > 0 && (
                <div className="overflow-x-auto max-h-44 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0" style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
                      <tr>
                        <th className="px-2 py-1 text-center font-semibold w-7" style={{ color: T.textMuted }}>#</th>
                        <th className="px-2 py-1 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Date</th>
                        <th className="px-2 py-1 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Time</th>
                        <th className="px-2 py-1 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>User</th>
                        <th className="px-2 py-1 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Status</th>
                        <th className="px-2 py-1 text-center font-semibold whitespace-nowrap w-7" title="Include in customer documents" style={{ color: T.textMuted }}>Inc</th>
                        <th className="px-2 py-1 text-left font-semibold" style={{ color: T.textMuted }}>Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.hairline }}>
                      {[...activeJob.comments].reverse().map((comment, idx) => (
                        <tr key={idx} style={{ background: comment.isInternal ? '#fffbeb' : idx % 2 === 0 ? T.panel : T.hairlineSoft }}>
                          <td className="px-2 py-1 text-center" style={{ color: T.textFaint }}>{activeJob.comments.length - idx}</td>
                          <td className="px-2 py-1 whitespace-nowrap" style={{ color: T.text }}>{comment.date}</td>
                          <td className="px-2 py-1 whitespace-nowrap" style={{ color: T.text }}>{comment.time}</td>
                          <td className="px-2 py-1 font-mono font-semibold whitespace-nowrap" title={comment.authorName} style={{ color: T.text }}>{comment.initials}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {comment.status && (
                              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: T.accentTint, color: T.accentStrong }}>{comment.status}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {comment.inc ? <span className="font-bold" style={{ color: T.ok }}>✓</span> : <span style={{ color: T.textFaint }}>—</span>}
                          </td>
                          <td className={`px-2 py-1 ${comment.isInternal ? 'italic text-accent-strong' : ''}`} style={comment.isInternal ? {} : { color: T.text }}>
                            {comment.isInternal && <span className="mr-1 text-accent-strong font-semibold">[int]</span>}
                            {comment.comment}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(activeJob.comments || []).length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: T.textFaint }}>No comments yet</p>
              )}
              <div className="flex gap-2 px-3 py-2" style={{ borderTop: `1px solid ${T.hairline}` }}>
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && commentInput.trim()) {
                      addJobComment(activeJob.id, commentInput.trim());
                      setCommentInput('');
                    }
                  }}
                  placeholder="Add a comment or note… (Enter to submit)"
                  className="flex-1 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-focus"
                  style={{ border: `1px solid ${T.hairline}` }}
                />
                <button
                  onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim(), true); setCommentInput(''); } }}
                  className="text-xs px-2 py-1 rounded hover:bg-hairline whitespace-nowrap"
                  style={{ background: T.hairlineSoft, color: T.textMuted, border: `1px solid ${T.hairline}` }}
                  title="Add as internal note (not visible to customer)"
                >Internal</button>
                <button
                  onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim()); setCommentInput(''); } }}
                  className="text-xs text-white px-3 py-1 rounded whitespace-nowrap"
                  style={{ background: T.accentStrong }}
                >Add</button>
              </div>
            </div>

            {/* ── Jim2-style Line Items panel (bottom) ── */}
            {activeJob.items && activeJob.items.length > 0 && (
              <div className="rounded overflow-hidden" style={{ border: `1px solid ${T.hairline}` }}>
                <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>Order Items</span>
                  <span className="text-[10px]" style={{ color: T.textFaint }}>{activeJob.items.filter(i => !i.displayType).length} lines</span>
                </div>
                {(() => {
                  const linkedPOs = [...new Set(activeJob.items.filter(i => i.poNo).map(i => i.poNo))];
                  if (linkedPOs.length === 0) return null;
                  return (
                    <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap" style={{ background: T.panel, borderBottom: `1px solid ${T.hairline}` }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.textFaint }}>Purchase Orders</span>
                      {linkedPOs.map(po => (
                        <button key={po} onClick={() => openPOById(po)} title={`Open PO ${po}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold hover:underline"
                          style={{ background: T.accentTint, color: T.accentStrong, border: `1px solid ${T.accentStrong}` }}>
                          {po}<ExternalLink className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 860 }}>
                    <thead style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Status</th>
                        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>PO #</th>
                        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>PO Due</th>
                        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Stock Code</th>
                        <th className="px-2 py-1.5 text-left font-semibold" style={{ color: T.textMuted }}>Description</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Order</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Supply</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>B. Ord</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Qty Pick</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Price Ex</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Price Inc</th>
                        <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Tax</th>
                        <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Hide</th>
                        <th className="px-2 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: T.hairline }}>
                      {activeJob.items.map((item, idx) => {
                        const isSec = item.displayType === 'section';
                        const isNote = item.displayType === 'note';
                        if (isSec) return (
                          <tr key={idx} style={{ background: T.accentTint, borderLeft: `4px solid ${T.accentStrong}` }}>
                            <td colSpan={14} className="px-3 py-1.5 font-bold text-xs" style={{ color: T.accentStrong }}>{item.description}</td>
                          </tr>
                        );
                        if (isNote) return (
                          <tr key={idx} className="bg-warn-tint">
                            <td colSpan={14} className="px-3 py-1.5 italic text-warn text-xs">{item.description}</td>
                          </tr>
                        );
                        return (
                        <tr key={idx} className={`hover:bg-accent-tint ${item.hide ? 'opacity-50' : ''}`} style={{ background: idx % 2 === 0 ? T.panel : T.hairlineSoft }}>
                          <td className="px-2 py-1.5">
                            {item.itemStatus
                              ? <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: T.accentTint, color: T.accentStrong }}>{item.itemStatus}</span>
                              : <span style={{ color: T.textFaint }}>—</span>}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {item.poNo
                              ? <button onClick={() => openPOById(item.poNo)} title={`Open PO ${item.poNo}`}
                                  className="inline-flex items-center gap-1 hover:underline" style={{ color: T.accentStrong, fontWeight: 600 }}>
                                  {item.poNo}<ExternalLink className="w-3 h-3" />
                                </button>
                              : <span style={{ color: T.textFaint }}>—</span>}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: T.text }}>{item.poDue || <span style={{ color: T.textFaint }}>—</span>}</td>
                          <td className="px-2 py-1.5 font-mono" style={{ color: T.accentStrong }}>{item.stockCode || <span style={{ color: T.textFaint }}>—</span>}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium" style={{ color: T.text }}>{item.description}</div>
                            {item.sizes && <div className="whitespace-pre-line mt-0.5" style={{ color: T.textMuted }}>{item.sizes}</div>}
                            {(item.decCode || item.embCode || item.trsCode) && <div className="text-xs font-mono mt-0.5" style={{ color: T.accentStrong }}>{item.decorationType && item.decorationType !== 'None' ? `${item.decorationType}: ` : ''}{item.decCode || item.embCode || item.trsCode}{item.stitchCount ? ` · ${item.stitchCount} sts` : ''}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right" style={{ color: T.text }}>{item.order}</td>
                          <td className="px-2 py-1.5 text-right">
                            <span style={{ color: item.supply >= item.order ? T.ok : T.danger, fontWeight: item.supply >= item.order ? 500 : undefined }}>
                              {item.supply}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-accent-strong font-medium">{item.bOrd > 0 ? item.bOrd : <span style={{ color: T.textFaint }}>—</span>}</td>
                          <td className="px-2 py-1.5 text-right text-emphasis font-medium">{item.qtyPick > 0 ? item.qtyPick : <span style={{ color: T.textFaint }}>—</span>}</td>
                          <td className="px-2 py-1.5 text-right">${(item.priceEx || 0).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right">${(item.priceInc || 0).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-center" style={{ color: T.textMuted }}>{item.taxType || 'G'}</td>
                          <td className="px-2 py-1.5 text-center">{item.hide ? <span className="text-accent font-bold">✓</span> : <span style={{ color: T.textFaint }}>✗</span>}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">${(item.total || 0).toFixed(2)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                      <tr>
                        <td colSpan={13} className="px-3 py-1.5 text-right text-xs" style={{ color: T.textMuted }}>
                          {activeJob.weightTotal > 0 && (
                            <span className="mr-4 text-accent-strong"><strong>Weight: {Number(activeJob.weightTotal).toFixed(2)} kg</strong></span>
                          )}
                          <span className="mr-4">Subtotal: <strong>${(activeJob.subtotal || 0).toFixed(2)}</strong></span>
                          <span className="mr-4">GST: <strong>${(activeJob.tax || 0).toFixed(2)}</strong></span>
                          <span className="mr-4">Total (Inc): <strong style={{ color: T.text }}>${(activeJob.totalInc || activeJob.total || 0).toFixed(2)}</strong></span>
                          {activeJob.balanceDue > 0 && <span style={{ color: T.danger }}>Balance: <strong>${(activeJob.balanceDue || 0).toFixed(2)}</strong></span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-sm">
                          ${(activeJob.totalInc || activeJob.total || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Jim2-style Freight + Totals footer ───────────────────── */}
            {(() => {
              const freightItem = (activeJob.items || []).find(i => (i.stockCode || '').toUpperCase() === 'FREIGHT' || (i.description || '').toLowerCase().includes('freight'));
              const freightAmt = freightItem ? parseFloat(freightItem.priceEx || freightItem.total || 0) : 0;
              const freightTax = Math.round(freightAmt * 0.10 * 100) / 100;
              const cartons = freightItem ? (parseInt(freightItem.order) || parseInt(freightItem.qty) || 1) : 1;
              const TR = ({ label, value, strong, color }) => (
                <div className="flex justify-between items-baseline" style={{ fontSize: strong ? 14 : 12, padding: strong ? '5px 0' : '3px 0', marginTop: strong ? 2 : 0, borderTop: strong ? `1px solid ${T.hairline}` : 'none', fontWeight: strong ? 500 : 400 }}>
                  <span style={{ color: strong ? T.text : T.textMuted }}>{label}</span>
                  <span className="font-mono" style={{ color: color || T.text, fontWeight: 500 }}>{value}</span>
                </div>
              );
              return (
                <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: '1fr 260px', alignItems: 'start' }}>
                  <div className="rounded-lg p-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                    <div className="flex items-center gap-1.5 mb-1" style={{ color: T.textMuted }}>
                      <Package className="w-3.5 h-3.5" /><span className="text-xs font-bold uppercase tracking-wide">Freight</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4">
                      <TR label="Freight $" value={freightAmt ? freightAmt.toFixed(2) : '—'} color={freightAmt ? T.text : T.textFaint} />
                      <TR label="Tax" value={freightAmt ? freightTax.toFixed(2) : '0.00'} />
                      <TR label="Amount" value={freightAmt ? (freightAmt + freightTax).toFixed(2) : '0.00'} />
                      <TR label="Cartons" value={String(cartons)} />
                      <TR label="Fuel Levy" value={activeJob.fuelLevy ? activeJob.fuelLevy.toFixed(2) : '0.00'} />
                      <TR label="Weight" value={activeJob.weightTotal ? `${activeJob.weightTotal} kg` : '—'} color={activeJob.weightTotal ? T.text : T.textFaint} />
                    </div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                    <TR label="SubTotal $" value={(activeJob.subtotal || 0).toFixed(2)} />
                    <TR label="Tax $" value={(activeJob.tax || 0).toFixed(2)} />
                    <TR label="Total $ (AUD)" value={(activeJob.totalInc || activeJob.total || 0).toFixed(2)} strong />
                    <TR label="Prepaid $" value={(activeJob.invoicePaid || 0).toFixed(2)} color={T.ok} />
                    <TR label="Balance Due $" value={(activeJob.balanceDue || 0).toFixed(2)} strong color={activeJob.balanceDue > 0 ? T.danger : T.ok} />
                  </div>
                </div>
              );
            })()}

            {/* ── Secondary tab strip ──────────────────────────────────── */}
            <div className="mt-3 pt-1 flex gap-0 text-xs" style={{ borderTop: `1px solid ${T.hairline}` }}>
              {[
                { id: 'job',       label: 'Job',                icon: FileText },
                { id: 'cost',      label: 'Cost',               icon: DollarSign },
                { id: 'stats',     label: 'Stats',              icon: BarChart3 },
                { id: 'linked',    label: 'Linked Jobs/Quotes', icon: Layers },
                { id: 'pickpack',  label: 'Pick / Pack',        icon: CheckSquare },
                { id: 'documents', label: 'Documents',          icon: ClipboardList },
                { id: 'activity',  label: 'Activity',           icon: Bell },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = jobDetailTab === tab.id;
                return (
                  <button key={tab.id}
                    onClick={() => setJobDetailTab(isActive ? 'job' : tab.id)}
                    className="flex items-center gap-1 px-3 py-1.5 border-b-2 transition-colors"
                    style={isActive
                      ? { borderColor: T.accent, color: T.accentStrong, fontWeight: 500, background: T.accentTint }
                      : { borderColor: 'transparent', color: T.textMuted }}>
                    <Icon className="w-3 h-3" />{tab.label}
                  </button>
                );
              })}
            </div>

            {/* ── STATS TAB ────────────────────────────────────────────── */}
            {jobDetailTab === 'stats' && (() => {
              const lines = (activeJob.items || []).filter(i => i.displayType !== 'section' && i.displayType !== 'note');
              const totalQty = lines.reduce((s, i) => s + (parseInt(i.order) || parseInt(i.qty) || 0), 0);
              const parseD = (d) => d ? new Date(String(d).split('/').reverse().join('-')) : null;
              const din = parseD(activeJob.dateIn);
              const daysIn = din && !isNaN(din.getTime()) ? Math.max(0, Math.round((new Date() - din) / 86400000)) : null;
              const stats = [
                { label: 'Line Items', value: String(lines.length), note: 'Product lines' },
                { label: 'Total Qty', value: totalQty.toLocaleString(), note: 'Units ordered' },
                { label: 'Order Value', value: `$${(activeJob.total || 0).toFixed(2)}`, note: 'Inc GST' },
                { label: 'Margin', value: `$${(activeJob.marginTotal || 0).toFixed(2)}`, note: `${activeJob.marginPct || 0}% of revenue`, color: (activeJob.marginTotal || 0) >= 0 ? T.ok : T.danger },
                { label: 'Weight', value: activeJob.weightTotal ? `${activeJob.weightTotal} kg` : '—', note: 'Order weight' },
                { label: 'Days In', value: daysIn != null ? String(daysIn) : '—', note: 'Since date in' },
              ];
              return (
                <div className="grid grid-cols-3 gap-4">
                  {stats.map(s => (
                    <div key={s.label} className="rounded-lg p-4 text-center" style={{ background: T.hairlineSoft }}>
                      <p className="text-xs mb-1" style={{ color: T.textMuted }}>{s.label}</p>
                      <p className="text-2xl font-bold" style={{ color: s.color || T.text }}>{s.value}</p>
                      <p className="text-xs mt-1" style={{ color: T.textFaint }}>{s.note}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── LINKED JOBS / QUOTES TAB ─────────────────────────────── */}
            {jobDetailTab === 'linked' && (() => {
              const related = (jobs || []).filter(j => j.id !== activeJob.id && String(j.customerId) === String(activeJob.customerId)).slice(0, 12);
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg p-3" style={{ background: T.hairlineSoft }}>
                      <p className="text-xs mb-1" style={{ color: T.textMuted }}>Originating Job (Ex.Job#)</p>
                      <p className="text-sm font-mono font-semibold" style={{ color: activeJob.exJobRef ? T.accentStrong : T.textFaint }}>{activeJob.exJobRef || '—'}</p>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: T.hairlineSoft }}>
                      <p className="text-xs mb-1" style={{ color: T.textMuted }}>Quote Reference</p>
                      <p className="text-sm font-mono font-semibold" style={{ color: activeJob.quote ? T.accentStrong : T.textFaint }}>{activeJob.quote || '—'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: T.textMuted }}>Other jobs for {activeJob.customer || 'this customer'}</p>
                    {related.length === 0 ? (
                      <p className="text-sm text-center py-6 border rounded" style={{ color: T.textFaint, borderColor: T.hairline }}>No other jobs for this customer.</p>
                    ) : (
                      <div className="border rounded overflow-hidden" style={{ borderColor: T.hairline }}>
                        <table className="w-full text-sm">
                          <thead style={{ background: T.hairlineSoft }}>
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Job #</th>
                              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Status</th>
                              <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Due</th>
                              <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: T.textMuted }}>Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {related.map(j => (
                              <tr key={j.id} className="hover:bg-panel-alt cursor-pointer" onClick={() => pinJob(j)}>
                                <td className="px-3 py-2 font-mono" style={{ color: T.accentStrong }}>#{j.id}</td>
                                <td className="px-3 py-2"><StatusBadge status={j.status} size="sm" /></td>
                                <td className="px-3 py-2" style={{ color: T.text }}>{j.due || '—'}</td>
                                <td className="px-3 py-2 text-right font-medium" style={{ color: T.text }}>${(j.total || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── PICK / PACK TAB ──────────────────────────────────────── */}
            {jobDetailTab === 'pickpack' && (() => {
              // Persisted Pick/Pack (Jim2 Qty Pick): drafts overlay the saved
              // qty_pick per line; Save Picks writes them via /jobs/{id}/pick.
              const productLines = (activeJob.items || []).filter(i => (i.displayType || 'product') === 'product');
              const target = (i) => i.supply || i.qty || i.order || 0;
              const draft = pickState[activeJob.id] || {};
              const pickedOf = (i) => (draft[i.id] !== undefined ? draft[i.id] : (i.qtyPick || 0));
              const setDraft = (itemId, val) => setPickState(prev => ({
                ...prev, [activeJob.id]: { ...(prev[activeJob.id] || {}), [itemId]: val },
              }));
              const fullyPicked = productLines.length > 0 && productLines.every(i => target(i) > 0 && pickedOf(i) >= target(i));
              const pickedCount = productLines.filter(i => target(i) > 0 && pickedOf(i) >= target(i)).length;
              const pct = productLines.length ? Math.round((pickedCount / productLines.length) * 100) : 0;
              const dirty = productLines.some(i => draft[i.id] !== undefined && draft[i.id] !== (i.qtyPick || 0));
              const savePicks = async () => {
                try {
                  const picks = productLines.map(i => ({ item_id: i.id, qty_pick: pickedOf(i) }));
                  const { allPicked, job } = await api.jobs.pick(activeJob.id, picks);
                  setActiveJob(job);
                  updatePinnedJob(job);
                  setPickState(prev => ({ ...prev, [activeJob.id]: {} }));
                  queryClient.invalidateQueries({ queryKey: ['jobs'] });
                  notify(allPicked ? 'Picks saved — all lines picked' : 'Picks saved', { type: 'success' });
                } catch (e) { notify(e.message || 'Could not save picks', { type: 'error' }); }
              };
              return (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm" style={{ color: T.textMuted }}>Enter quantities as you pick them — picks are saved to the job.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPickState(prev => ({ ...prev, [activeJob.id]: Object.fromEntries(productLines.map(i => [i.id, target(i)])) }))}
                      className="text-sm px-3 py-1.5 rounded border flex items-center"
                      style={{ borderColor: T.hairline, color: T.textMuted }}
                    >
                      <CheckSquare className="w-3 h-3 mr-1" />Pick All
                    </button>
                    <button
                      onClick={savePicks}
                      disabled={!dirty}
                      className="text-sm text-white px-3 py-1.5 rounded flex items-center disabled:opacity-40"
                      style={{ background: T.accentStrong }}
                    >
                      <Save className="w-3 h-3 mr-1" />Save Picks
                    </button>
                    <button
                      onClick={() => setDocumentPrint({ type: 'pickingSlip', job: activeJob })}
                      className="text-sm bg-accent-strong text-white px-3 py-1.5 rounded hover:bg-accent-strong flex items-center"
                    >
                      <Printer className="w-3 h-3 mr-1" />Picking Slip
                    </button>
                  </div>
                </div>
                {productLines.length === 0 ? (
                  <p className="text-sm text-center py-6 border rounded" style={{ color: T.textFaint, borderColor: T.hairline }}>No product lines on this job.</p>
                ) : (
                  <div className="border rounded overflow-hidden" style={{ borderColor: T.hairline }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: T.hairlineSoft }}>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Stock Code</th>
                          <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Sizes</th>
                          <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: T.textMuted }}>Bin</th>
                          <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: T.textMuted }}>Supply</th>
                          <th className="px-3 py-2 text-right text-xs font-medium w-24" style={{ color: T.textMuted }}>Qty Pick</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {productLines.map((item) => {
                          const t = target(item);
                          const p = pickedOf(item);
                          const done = t > 0 && p >= t;
                          const binLoc = inventory.find(i => i.sku === item.stockCode)?.location || '—';
                          return (
                            <tr key={item.id} style={done ? { background: T.okTint } : {}} className={done ? '' : 'hover:bg-panel-alt'}>
                              <td className="px-3 py-2">
                                {done
                                  ? <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: T.okTint, color: T.ok }}>Picked</span>
                                  : p > 0
                                    ? <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: T.accentTint, color: T.accentStrong }}>Partial</span>
                                    : <span className="text-xs" style={{ color: T.textFaint }}>—</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs">{item.stockCode}</td>
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="px-3 py-2 text-xs" style={{ color: T.textMuted }}>{item.sizes || '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs font-medium" style={{ color: T.accentStrong }}>{binLoc}</td>
                              <td className="px-3 py-2 text-right font-medium">{t}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={t}
                                  value={p}
                                  onChange={e => setDraft(item.id, Math.max(0, Math.min(t, parseInt(e.target.value, 10) || 0)))}
                                  className="w-16 text-right border rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus"
                                  style={{ borderColor: done ? T.ok : T.hairline }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {productLines.length > 0 && (
                  <div className="rounded p-3" style={{ background: T.hairlineSoft }}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span style={{ color: T.textMuted }}>Pick Progress</span>
                      <span className="font-medium">{pickedCount}/{productLines.length} lines ({pct}%)</span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ background: T.hairline }}>
                      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? T.ok : T.accent }} />
                    </div>
                    {fullyPicked && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-medium" style={{ color: T.ok }}>All lines picked{dirty ? ' — save picks to record' : ''}</span>
                        <button onClick={() => updateJobStatus(activeJob.id, 'FINISH')} disabled={dirty} className="px-3 py-1 rounded text-sm text-white disabled:opacity-40" style={{ background: T.ok }}>
                          Mark Complete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* ── DOCUMENTS TAB ────────────────────────────────────────── */}
            {jobDetailTab === 'documents' && (
              <div>
                <p className="text-sm mb-4" style={{ color: T.textMuted }}>Generate and print documents for Job #{activeJob.id}.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'invoice', label: 'TIG TAX Invoice', desc: 'Standard tax invoice with totals and payment details', icon: FileText, color: 'bg-accent-tint hover:bg-accent-tint border-accent text-accent-strong' },
                    { type: 'pickingSlip', label: 'TIG Picking Slip', desc: 'Warehouse pick list with bin locations and checkboxes', icon: ClipboardList, color: 'bg-accent-tint hover:bg-accent-tint border-accent text-accent-strong' },
                    { type: 'deliveryNote', label: 'TIG Delivery Note', desc: 'Customer delivery confirmation with signature fields', icon: Truck, color: 'bg-ok-tint hover:bg-ok-tint border-ok text-ok' },
                    { type: 'jobSheet', label: 'TIG Job Sheet', desc: 'Production order with job details and instructions', icon: FileSpreadsheet, color: 'bg-emphasis-tint hover:bg-emphasis-tint border-emphasis text-emphasis' },
                    { type: 'shipLabel', label: 'Ship Label', desc: 'Large-format shipping label with recipient address and job number', icon: Tag, color: 'bg-danger-tint hover:bg-danger-tint border-danger text-danger' },
                  ].map(doc => {
                    const Icon = doc.icon;
                    return (
                      <button
                        key={doc.type}
                        onClick={() => {
                          if (doc.type === 'invoice') openInvoiceDoc(activeJob);
                          else setDocumentPrint({ type: doc.type, job: activeJob });
                        }}
                        className={`p-4 rounded-lg border text-left transition-colors ${doc.color}`}
                      >
                        <Icon className="w-5 h-5 mb-2" />
                        <p className="font-semibold text-sm">{doc.label}</p>
                        <p className="text-xs opacity-70 mt-0.5">{doc.desc}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 text-xs" style={{ borderTop: `1px solid ${T.hairline}`, color: T.textFaint }}>
                  <p>All documents open a print-ready preview. Use your browser's print function (Ctrl+P) to print or save as PDF.</p>
                </div>
              </div>
            )}

            {/* ── COST TAB ─────────────────────────────────────────────── */}
            {jobDetailTab === 'cost' && (
              <div className="space-y-4">
                {(() => {
                  const productLines = (activeJob.items || []).filter(i => i.displayType !== 'section' && i.displayType !== 'note');
                  const totalCost = productLines.reduce((s, i) => s + (parseFloat(i.purchasePrice || 0) * (parseInt(i.order) || 0)), 0);
                  const grossMargin = (activeJob.subtotal || 0) - totalCost;
                  const marginPct = activeJob.subtotal > 0 ? (grossMargin / activeJob.subtotal * 100) : 0;
                  const hasCostData = totalCost > 0;
                  return (
                    <div className="grid grid-cols-3 gap-4">
                      {(hasCostData ? [
                        { label: 'Total Cost', value: totalCost.toFixed(2), tokenColor: T.text, note: 'From line item costs' },
                        { label: 'Gross Margin', value: grossMargin.toFixed(2), tokenColor: grossMargin >= 0 ? T.ok : T.danger, note: `${marginPct.toFixed(1)}% of revenue` },
                        { label: 'Margin %', value: `${marginPct.toFixed(1)}%`, tokenColor: marginPct >= 30 ? T.ok : marginPct >= 15 ? 'text-warn' : T.danger, note: marginPct >= 30 ? 'Healthy' : marginPct >= 15 ? 'OK' : 'Low' },
                      ] : [
                        { label: 'Est. Materials', value: ((activeJob.subtotal || 0) * 0.55).toFixed(2), tokenColor: T.text, note: '~55% estimate' },
                        { label: 'Est. Labour', value: ((activeJob.subtotal || 0) * 0.30).toFixed(2), tokenColor: T.text, note: '~30% estimate' },
                        { label: 'Est. Margin', value: ((activeJob.subtotal || 0) * 0.15).toFixed(2), tokenColor: T.ok, note: '~15% estimate' },
                      ]).map(row => (
                        <div key={row.label} className="rounded-lg p-4 text-center" style={{ background: T.hairlineSoft }}>
                          <p className="text-xs mb-1" style={{ color: T.textMuted }}>{row.label}</p>
                          <p className={`text-2xl font-bold${row.tokenColor === 'text-warn' ? ' text-warn' : ''}`} style={row.tokenColor !== 'text-warn' ? { color: row.tokenColor } : {}}>{row.value.startsWith('%') ? row.value : `$${row.value}`}</p>
                          <p className="text-xs mt-1" style={{ color: T.textFaint }}>{row.note}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="rounded p-4 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
                  <div className="flex justify-between py-1.5" style={{ borderBottom: `1px solid ${T.hairline}` }}><span style={{ color: T.textMuted }}>Subtotal (ex GST):</span><span className="font-medium">${(activeJob.subtotal || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5" style={{ borderBottom: `1px solid ${T.hairline}` }}><span style={{ color: T.textMuted }}>GST (10%):</span><span className="font-medium">${(activeJob.tax || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5 font-semibold" style={{ borderBottom: `1px solid ${T.hairline}` }}><span>Invoice Total:</span><span>${(activeJob.total || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5" style={{ borderBottom: `1px solid ${T.hairline}`, color: T.ok }}><span>Paid:</span><span>${(activeJob.invoicePaid || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5 font-bold" style={{ color: T.danger }}><span>Balance Due:</span><span>${(activeJob.balanceDue || 0).toFixed(2)}</span></div>
                </div>
                {/* Decoration type breakdown */}
                {(() => {
                  const decMap = {};
                  (activeJob.items || []).filter(i => i.decorationType && i.decorationType !== 'None').forEach(i => {
                    if (!decMap[i.decorationType]) decMap[i.decorationType] = { count: 0, total: 0 };
                    decMap[i.decorationType].count += 1;
                    decMap[i.decorationType].total += parseFloat(i.total || 0);
                  });
                  const entries = Object.entries(decMap);
                  if (!entries.length) return null;
                  return (
                    <div className="rounded p-4 text-sm" style={{ border: `1px solid ${T.hairline}` }}>
                      <p className="font-medium mb-2" style={{ color: T.text }}>Decoration Types</p>
                      {entries.map(([type, v]) => (
                        <div key={type} className="flex justify-between py-1 text-xs last:border-0" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                          <span className="text-emphasis font-medium">{type}</span>
                          <span>{v.count} line{v.count > 1 ? 's' : ''}</span>
                          <span className="font-medium">${v.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {jobDetailTab === 'activity' && (
              <div className="space-y-4">
                <h4 className="font-semibold" style={{ color: T.text }}>Status History & Activity Log</h4>
                {/* Status timeline */}
                {(() => {
                  const statusChanges = (activeJob.comments || []).filter(c => c.comment?.startsWith('Status changed to') || c.isInternal);
                  if (!statusChanges.length) return <p className="text-sm text-center py-4" style={{ color: T.textFaint }}>No activity recorded yet.</p>;
                  return (
                    <div className="relative ml-4 space-y-0" style={{ borderLeft: `2px solid ${T.hairline}` }}>
                      {[...statusChanges].reverse().map((c, i) => (
                        <div key={c.id || i} className="relative pl-6 pb-4">
                          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white${c.comment?.startsWith('Job locked') || c.comment?.startsWith('Job unlocked') ? ' bg-accent-strong' : ''}`} style={c.comment?.startsWith('Status changed') ? { background: T.accent } : c.comment?.startsWith('Payment') ? { background: T.ok } : c.comment?.startsWith('Job locked') || c.comment?.startsWith('Job unlocked') ? {} : { background: T.textFaint }} />
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-medium" style={{ color: T.text }}>{c.comment}</p>
                              <p className="text-xs" style={{ color: T.textFaint }}>{c.authorName || c.initials} · {c.date} {c.time}</p>
                            </div>
                            {c.status && <span className="text-xs px-1.5 py-0.5 rounded ml-2 shrink-0" style={{ background: T.hairlineSoft, color: T.textMuted }}>{c.status}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Add comment */}
                <div className="pt-3" style={{ borderTop: `1px solid ${T.hairline}` }}>
                  <h4 className="font-semibold mb-2" style={{ color: T.text }}>Add Comment</h4>
                  <div className="flex gap-2">
                    <textarea
                      value={commentInput}
                      onChange={e => setCommentInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim()); setCommentInput(''); e.preventDefault(); } }}
                      placeholder="Add a note or comment… (Enter to submit, Shift+Enter for new line)"
                      rows={2}
                      className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus resize-none"
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim()); setCommentInput(''); } }}
                        className="px-3 py-1.5 text-white rounded text-xs font-medium" style={{ background: T.accentStrong }}>Send</button>
                      <button onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim(), true); setCommentInput(''); } }}
                        className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: T.hairline, color: T.text }}>Internal</button>
                    </div>
                  </div>
                </div>
                {/* All comments unified */}
                <h4 className="font-semibold pt-3" style={{ borderTop: `1px solid ${T.hairline}`, color: T.text }}>All Comments</h4>
                {[...(activeJob.comments || [])].sort((a, b) => b.id - a.id).map((c, i) => (
                  <div key={c.id || i} className={`rounded-lg p-3 text-sm ${c.isInternal ? 'bg-accent-tint border border-accent' : ''}`} style={c.isInternal ? {} : { background: T.hairlineSoft }}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: T.accentTint, color: T.accentStrong }}>{(c.initials || '?').slice(0, 2)}</div>
                        <span className="font-medium text-xs" style={{ color: T.text }}>{c.authorName || c.initials}</span>
                        {c.isInternal && <span className="text-[10px] bg-accent-strong text-accent-strong px-1 rounded font-medium">Internal</span>}
                      </div>
                      <span className="text-xs shrink-0" style={{ color: T.textFaint }}>{c.date} {c.time}</span>
                    </div>
                    <p className="text-xs ml-6" style={{ color: T.textMuted }}>{c.comment}</p>
                  </div>
                ))}
                {!(activeJob.comments || []).length && <p className="text-sm text-center py-2" style={{ color: T.textFaint }}>No comments yet.</p>}
              </div>
            )}

            </div>
              </div>{/* /flex-1 */}

              {/* ── FactBox Sidebar ────────────────────────────────────── */}
              {(() => {
                const fbCust = customers.find(c => c.id === activeJob.customerId) || {};
                const custJobs = jobs.filter(j => j.customerId === activeJob.customerId && j.id !== activeJob.id);
                const openCustJobs = custJobs.filter(j => !['PAID','CANCEL'].includes(j.status));
                const paid = (activeJob.total || 0) - (activeJob.balanceDue || 0);
                const balPct = activeJob.total > 0 ? Math.max(0, Math.min(100, (paid / activeJob.total) * 100)) : 0;
                return (
                  <div className="w-72 shrink-0 space-y-3">

                    {/* Customer Card */}
                    <div className="rounded-xl shadow-sm p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: T.textMuted }}>Customer</h4>
                        {fbCust.id && <button onClick={() => setActiveModule('customers')} className="text-[11px]" style={{ color: T.accentStrong }}>View →</button>}
                      </div>
                      <p className="font-semibold text-sm leading-tight" style={{ color: T.text }}>{activeJob.customer}</p>
                      {fbCust.contact && <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{fbCust.contact}</p>}
                      <div className="mt-2 space-y-1">
                        {fbCust.phone && <div className="flex items-center gap-1.5 text-xs" style={{ color: T.text }}><Phone className="w-3 h-3 shrink-0" style={{ color: T.textFaint }} />{fbCust.phone}</div>}
                        {fbCust.mobile && fbCust.mobile !== fbCust.phone && <div className="flex items-center gap-1.5 text-xs" style={{ color: T.text }}><Phone className="w-3 h-3 shrink-0" style={{ color: T.textFaint }} />{fbCust.mobile}</div>}
                        {fbCust.email && <div className="flex items-center gap-1.5 text-xs" style={{ color: T.text }}><Mail className="w-3 h-3 shrink-0" style={{ color: T.textFaint }} /><span className="truncate">{fbCust.email}</span></div>}
                        {(activeJob.shipTo || fbCust.address) && <div className="flex items-start gap-1.5 text-xs mt-1" style={{ color: T.text }}><MapPin className="w-3 h-3 shrink-0 mt-0.5" style={{ color: T.textFaint }} /><span className="leading-tight">{activeJob.shipTo || fbCust.address}</span></div>}
                      </div>
                      {fbCust.paymentTerms && <div className="mt-2 pt-2 text-xs" style={{ borderTop: `1px solid ${T.hairline}`, color: T.textMuted }}>Terms: <span className="font-medium" style={{ color: T.text }}>{fbCust.paymentTerms}</span></div>}
                    </div>

                    {/* Financial Summary */}
                    <div className="rounded-xl shadow-sm p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                      <h4 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: T.textMuted }}>Financials</h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span style={{ color: T.textMuted }}>Subtotal</span><span className="font-medium" style={{ color: T.text }}>${(activeJob.subtotal || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span style={{ color: T.textMuted }}>GST</span><span className="font-medium" style={{ color: T.text }}>${(activeJob.tax || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between pt-1 mt-1" style={{ borderTop: `1px solid ${T.hairline}` }}><span className="font-semibold" style={{ color: T.text }}>Total (inc. GST)</span><span className="font-bold" style={{ color: T.text }}>${(activeJob.totalInc || activeJob.total || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span style={{ color: T.textMuted }}>Paid</span><span className="font-medium" style={{ color: T.ok }}>${paid.toFixed(2)}</span></div>
                        {activeJob.balanceDue > 0 && <div className="flex justify-between"><span className="font-semibold" style={{ color: T.danger }}>Balance Due</span><span className="font-bold" style={{ color: T.danger }}>${Number(activeJob.balanceDue).toFixed(2)}</span></div>}
                      </div>
                      {activeJob.total > 0 && (
                        <div className="mt-2.5">
                          <div className="w-full rounded-full h-1.5" style={{ background: T.hairlineSoft }}>
                            <div className="bg-ok h-1.5 rounded-full transition-all" style={{ width: `${balPct}%` }} />
                          </div>
                          <p className="text-[10px] mt-0.5 text-right" style={{ color: T.textFaint }}>{balPct.toFixed(0)}% paid</p>
                        </div>
                      )}
                      {activeJob.balanceDue > 0 && (
                        <button onClick={() => setPaymentModal({ show: true, jobId: activeJob.id, maxAmount: activeJob.balanceDue, amount: activeJob.balanceDue.toFixed(2), method: 'Credit Card' })}
                          className="w-full mt-2 text-xs bg-ok text-white py-1.5 rounded-lg hover:bg-ok font-semibold">
                          Record Payment
                        </button>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="rounded-xl shadow-sm p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                      <h4 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: T.textMuted }}>Quick Actions</h4>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          // Colour says what kind of action this is, not which
                          // button it happens to be. Editing the job is the one
                          // that changes it, so it is the only accented tile;
                          // the four documents below print what is already
                          // there and read as one quiet group.
                          { label: 'Edit Job',  icon: Edit,          variant: 'primary',   action: () => openModal('job', activeJob),                               disabled: !isJobEditable(activeJob), title: jobLockReason(activeJob) },
                          { label: 'Clone',     icon: Copy,          variant: 'secondary', action: () => cloneJob(activeJob) },
                          { label: 'Job Sheet', icon: Printer,       variant: 'secondary', action: () => setDocumentPrint({ type: 'jobSheet', job: activeJob }) },
                          { label: 'Invoice',   icon: FileText,      variant: 'secondary', action: () => openInvoiceDoc(activeJob) },
                          { label: 'Delivery',  icon: Package,       variant: 'secondary', action: () => setDocumentPrint({ type: 'deliveryNote', job: activeJob }) },
                          { label: 'Picking',   icon: ClipboardList, variant: 'secondary', action: () => setDocumentPrint({ type: 'pickingSlip', job: activeJob }) },
                        ].map(a => (
                          <Button key={a.label} variant={a.variant} size="tile" onClick={a.action} disabled={a.disabled} title={a.title || undefined}>
                            <a.icon className="w-4 h-4" />{a.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Proof Approval */}
                    <ProofPanel
                      key={activeJob.id}
                      job={activeJob}
                      onUpdate={async (status, notes) => {
                        await api.jobs.update(activeJob.id, { ...activeJob, proofStatus: status, proofNotes: notes });
                        queryClient.invalidateQueries({ queryKey: ['jobs'] });
                        setActiveJob(j => ({ ...j, proofStatus: status, proofNotes: notes }));
                      }}
                    />

                    {/* Related */}
                    <div className="rounded-xl shadow-sm p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                      <h4 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: T.textMuted }}>Related</h4>
                      <div className="space-y-1.5">
                        <button onClick={() => { setActiveModule('jobs'); setFilterCustomer(activeJob.customerId || ''); }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium" style={{ background: T.hairlineSoft, color: T.text }}>
                          <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" style={{ color: T.textFaint }} />Other Jobs</span>
                          <span className="px-2 py-0.5 rounded-full font-bold text-[11px]" style={openCustJobs.length > 0 ? { background: T.accentTint, color: T.accentStrong } : { background: T.hairlineSoft, color: T.textMuted }}>{openCustJobs.length}</span>
                        </button>
                        {activeJob.poNumber && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: T.hairlineSoft, color: T.text }}>
                            <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5" style={{ color: T.textFaint }} />Customer PO</span>
                            <span className="font-mono font-medium" style={{ color: T.text }}>{activeJob.poNumber}</span>
                          </div>
                        )}
                        {activeJob.assignedTo && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: T.hairlineSoft, color: T.text }}>
                            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" style={{ color: T.textFaint }} />Assigned To</span>
                            <span className="font-medium" style={{ color: T.text }}>{activeJob.assignedTo}</span>
                          </div>
                        )}
                        {activeJob.status === 'QUOTE' && (
                          <button onClick={() => updateJobStatus(activeJob.id, 'ORDER')}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white mt-1" style={{ background: T.accentStrong }}>
                            Convert to Order →
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })()}

            </div>{/* /flex wrapper */}
          </div>
        )}
      </div>
    );
  };

  // Render Customers Module




  const renderReports = () => (
    <ReportsModule
      jobs={jobs}
      inventory={inventory}
      suppliers={suppliers}
      purchaseOrders={purchaseOrders}
      onOpenJob={(jobId) => {
        const j = jobs.find(j => j.id === jobId);
        if (j) { setActiveModule('jobs'); openModal('job', j); }
      }}
      onNavigateToPO={(po) => {
        setActiveModule('purchase-orders');
        setSelectedPO(po);
      }}
    />
  );




  // Render Warehouse Module — Live Bin-Location Map

  // Modal Renderer
  const renderModal = () => {
    if (!showModal) return null;

    return (
      <DraggableModal onClose={closeModal} cardClass="overflow-auto" cardStyle={{ resize: 'both', width: '90vw', maxWidth: '1400px', minWidth: '520px', height: '90vh', minHeight: '400px', maxHeight: '96vh' }}>
          <div className="flex flex-col h-full">
            {/* Modal title bar */}
            <div className="flex items-center justify-between px-5 py-3 cursor-move select-none shrink-0" style={{ background: T.chrome, borderBottom: `2px solid ${T.accent}` }}>
              <h2 className="text-sm font-semibold tracking-wide" style={{ color: T.chromeText }}>
                {editingItem ? 'Edit' : 'New'} {modalType.charAt(0).toUpperCase() + modalType.slice(1)}
              </h2>
              <button onClick={closeModal} className="transition-colors" style={{ color: T.chromeTextMuted }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          <div className="p-6 flex-1 overflow-auto">

            {modalType === 'job' && (
              <div className="space-y-2 text-sm">
                {/* ── Jim2-style compact header grid ── */}
                <div className="border rounded-lg overflow-visible text-xs shadow-sm" style={{background: T.panel, borderColor: T.hairline}}>

                  {/* Row 1: Primary identifiers */}
                  <div className="flex divide-x border-b" style={{background: T.hairlineSoft, borderColor: T.hairline}}>
                    {/* Job # */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:72}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Job #</span>
                      <span className="font-mono font-bold text-sm" style={{color: T.accentStrong}}>{editingItem?.id || 'NEW'}</span>
                    </div>
                    {/* Customer name */}
                    <div className="flex flex-col px-2.5 py-1.5 flex-1 relative" style={{minWidth:200}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Customer *</span>
                      <input type="text"
                        value={custDropdown.open ? custDropdown.query : jobForm.customer}
                        onChange={(e) => { setCustDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({ ...jobForm, customer: e.target.value }); }}
                        onFocus={() => setCustDropdown({ open: true, query: jobForm.customer, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setCustDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const hits = customers.filter(c => { const q = custDropdown.query.toLowerCase(); return !q || c.name.toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q); }).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[custDropdown.highlighted]) { e.preventDefault(); setJobForm(f => ({ ...f, ...applyCustomerToJobForm(hits[custDropdown.highlighted]) })); setCustDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setCustDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="bg-transparent border-0 p-0 focus:outline-none font-medium w-full text-xs placeholder-faint"
                        style={{color: T.text}}
                        placeholder="Type to search…" autoComplete="off" required />
                      {custDropdown.open && (() => {
                        const q = custDropdown.query.toLowerCase();
                        const hits = customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 rounded-xl shadow-2xl z-50 overflow-hidden" style={{fontSize:12,minWidth:280,background:T.panel,border:`1px solid ${T.hairline}`}}>
                            <div className="px-3 py-1.5 text-xs border-b flex items-center gap-1" style={{color:T.textFaint,background:T.hairlineSoft,borderColor:T.hairline}}><Search className="w-3 h-3" />{q ? `"${custDropdown.query}"` : 'All customers'}</div>
                            {hits.map((c, i) => (
                              <div key={c.id||c.name} onMouseDown={() => { setJobForm(f => ({ ...f, ...applyCustomerToJobForm(c) })); setCustDropdown({ open: false, query: '', highlighted: 0 }); }} onMouseEnter={() => setCustDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === custDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}>
                                <div className="w-6 h-6 rounded-full bg-accent-tint text-accent-strong font-bold text-[10px] flex items-center justify-center shrink-0">{c.name.charAt(0).toUpperCase()}</div>
                                <div className="flex-1 min-w-0"><div className="font-medium truncate text-xs" style={{color:T.text}}>{c.name}</div>{c.id && <div className="text-xs font-mono" style={{color:T.textFaint}}>{c.id}</div>}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Cust ID */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:140}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Cust #</span>
                      <select value={jobForm.customerId} onChange={(e) => { const c = customers.find(c => c.id === e.target.value); setJobForm(f => c ? { ...f, ...applyCustomerToJobForm(c) } : { ...f, customerId: e.target.value }); }}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}>
                        <option value="">— select —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
                      </select>
                    </div>
                    {/* Invoice # */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:110}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Invoice #</span>
                      <input value={jobForm.invoice || ''} onChange={e => setJobForm({...jobForm, invoice: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full font-mono" style={{color: T.text}} placeholder="INV-XXXX" />
                    </div>
                    {/* Quote Ref */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:90}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Quote Ref</span>
                      <input value={jobForm.quote || ''} onChange={e => setJobForm({...jobForm, quote: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} placeholder="QT-XXXX" />
                    </div>
                  </div>

                  {/* Row 2: References */}
                  <div className="flex divide-x border-b" style={{borderColor: T.hairline}}>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Cust Ref #</span>
                      <input value={jobForm.custRef || ''} onChange={e => setJobForm({...jobForm, custRef: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} placeholder="Customer's ref" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Our Ref #</span>
                      <input value={jobForm.ourRef || ''} onChange={e => setJobForm({...jobForm, ourRef: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} placeholder="Internal contact" />
                    </div>
                    {/* Ship To */}
                    <div className="flex flex-col px-2.5 py-1.5 relative" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Ship To</span>
                      <input type="text"
                        value={shipDropdown.open ? shipDropdown.query : (jobForm.shipTo || '')}
                        onChange={(e) => { setShipDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({ ...jobForm, shipTo: e.target.value }); }}
                        onFocus={() => setShipDropdown({ open: true, query: jobForm.shipTo || '', highlighted: 0 })}
                        onBlur={() => setTimeout(() => setShipDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = shipDropdown.query.toLowerCase();
                          const hits = cardFiles.filter(cf => !q || (cf.shipCode||'').toLowerCase().includes(q) || (cf.companyName||'').toLowerCase().includes(q)).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[shipDropdown.highlighted]) { e.preventDefault(); const cf = hits[shipDropdown.highlighted]; const fullAddr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n'); setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: fullAddr || jobForm.shippingAddress }); setShipDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setShipDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} placeholder="Code or address" autoComplete="off" />
                      {shipDropdown.open && (() => {
                        const q = shipDropdown.query.toLowerCase();
                        const hits = cardFiles.filter(cf => !q || (cf.shipCode||'').toLowerCase().includes(q) || (cf.companyName||'').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 rounded-xl shadow-2xl z-50 overflow-hidden" style={{fontSize:12,minWidth:260,background:T.panel,border:`1px solid ${T.hairline}`}}>
                            <div className="px-3 py-1.5 text-xs border-b flex items-center gap-1" style={{color:T.textFaint,background:T.hairlineSoft,borderColor:T.hairline}}><Search className="w-3 h-3" />Card files</div>
                            {hits.map((cf, i) => { const addr = [cf.suburb, cf.state, cf.postcode].filter(Boolean).join(' '); return (
                              <div key={cf.shipCode} onMouseDown={() => { const fullAddr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n'); setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: fullAddr || jobForm.shippingAddress }); setShipDropdown({ open: false, query: '', highlighted: 0 }); }} onMouseEnter={() => setShipDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === shipDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}>
                                <div className="shrink-0 bg-ok-tint text-ok text-[10px] font-bold font-mono px-1.5 py-0.5 rounded">{cf.shipCode}</div>
                                <div className="flex-1 min-w-0"><div className="font-medium truncate text-xs" style={{color:T.text}}>{cf.companyName||cf.shipCode}</div>{addr && <div className="text-xs truncate" style={{color:T.textFaint}}>{addr}</div>}</div>
                              </div>
                            ); })}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5 flex-1" style={{minWidth:160}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Description</span>
                      <input value={jobForm.description || ''} onChange={e => setJobForm({...jobForm, description: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} placeholder="e.g. Ad-Hoc Sale" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:100}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Project #</span>
                      <input value={jobForm.projectNo || ''} onChange={e => setJobForm({...jobForm, projectNo: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:90}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Branch</span>
                      <select value={jobForm.branch || 'HQ'} onChange={e => setJobForm({...jobForm, branch: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}>
                        {['HQ','Warehouse','Melbourne','Sydney','Brisbane','Perth'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    {/* Assigned To */}
                    <div className="flex flex-col px-2.5 py-1.5 relative" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Assigned To</span>
                      <input type="text"
                        value={assignedDropdown.open ? assignedDropdown.query : jobForm.assignedTo}
                        onChange={(e) => { setAssignedDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({...jobForm, assignedTo: e.target.value}); }}
                        onFocus={() => setAssignedDropdown({ open: true, query: jobForm.assignedTo, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setAssignedDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = assignedDropdown.query.toLowerCase();
                          const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                          const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[assignedDropdown.highlighted]) { e.preventDefault(); setJobForm({...jobForm, assignedTo: hits[assignedDropdown.highlighted]}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setAssignedDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} placeholder="Type or pick…" autoComplete="off" />
                      {assignedDropdown.open && (() => {
                        const q = (assignedDropdown.query || '').toLowerCase();
                        const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                        const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 rounded-xl shadow-2xl z-50 overflow-hidden" style={{fontSize:12,minWidth:200,background:T.panel,border:`1px solid ${T.hairline}`}}>
                            <div className="px-3 py-1.5 text-xs border-b" style={{color:T.textFaint,background:T.hairlineSoft,borderColor:T.hairline}}>Previous assignees</div>
                            {hits.map((name, i) => (
                              <div key={name} onMouseDown={() => { setJobForm({...jobForm, assignedTo: name}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }} onMouseEnter={() => setAssignedDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === assignedDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}>
                                <div className="w-5 h-5 rounded-full bg-accent-tint text-accent-strong font-bold text-[10px] flex items-center justify-center shrink-0">{name.charAt(0).toUpperCase()}</div>
                                <span className="text-xs" style={{color:T.text}}>{name}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:100}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Serial #</span>
                      <input value={jobForm.serialNo || ''} onChange={e => setJobForm({...jobForm, serialNo: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} />
                    </div>
                  </div>

                  {/* Row 3: Dates */}
                  <div className="flex divide-x border-b" style={{background: T.hairlineSoft, borderColor: T.hairline}}>
                    {[
                      { label: 'Date In', key: 'dateIn' },
                      { label: 'Due Date', key: 'due' },
                      { label: 'Out Date', key: 'out' },
                      { label: 'Commitment', key: 'commitmentDate' },
                      { label: 'Valid Until', key: 'validityDate' },
                    ].map(({ label, key }) => (
                      <div key={key} className="flex flex-col px-2.5 py-1.5 flex-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>{label}</span>
                        <input type="date" value={jobForm[key] || ''} onChange={e => setJobForm({...jobForm, [key]: e.target.value})}
                          className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}} />
                      </div>
                    ))}
                    <div className="flex flex-col px-2.5 py-1.5 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Pay Method</span>
                      <select value={jobForm.paymentMethod} onChange={e => setJobForm({...jobForm, paymentMethod: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}>
                        <option>Account</option><option>Credit Card</option><option>Cash</option><option>Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 4: Status flags */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b" style={{background: T.panel, borderColor: T.hairline}}>
                    {/* Status */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: T.textFaint}}>Status</span>
                      <select value={jobForm.status} onChange={e => setJobForm({...jobForm, status: e.target.value})}
                        className="border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus font-semibold text-xs" style={{background: T.panel, borderColor: T.hairline, color: T.text}}>
                        {['QUOTE','New','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="w-px h-4" style={{background: T.hairline}} />
                    {/* Priority — semantic colours kept (red=Urgent, orange=High) */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: T.textFaint}}>Priority</span>
                      <select value={jobForm.priority} onChange={e => setJobForm({...jobForm, priority: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus text-xs ${jobForm.priority === 'Urgent' ? 'bg-danger-tint text-danger border-danger' : jobForm.priority === 'High' ? 'bg-accent-tint text-accent-strong border-accent' : ''}`}
                        style={jobForm.priority === 'Urgent' || jobForm.priority === 'High' ? {} : {background: T.panel, borderColor: T.hairline, color: T.text}}>
                        <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                      </select>
                    </div>
                    {/* Type */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: T.textFaint}}>Type</span>
                      <select value={jobForm.type} onChange={e => setJobForm({...jobForm, type: e.target.value})} className="border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus text-xs" style={{background: T.panel, borderColor: T.hairline, color: T.text}}>
                        <option>Standard</option><option>Custom</option><option>Rush</option>
                      </select>
                    </div>
                    <div className="w-px h-4" style={{background: T.hairline}} />
                    {/* Paid — semantic colours kept */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: T.textFaint}}>Paid</span>
                      <select value={jobForm.paymentStatus || 'unpaid'} onChange={e => setJobForm({...jobForm, paymentStatus: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus text-xs font-semibold ${jobForm.paymentStatus === 'paid' ? 'bg-ok-tint text-ok border-ok' : jobForm.paymentStatus === 'partial' ? 'bg-warn-tint text-warn border-warn' : 'bg-danger-tint text-danger border-danger'}`}>
                        <option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option>
                      </select>
                    </div>
                    {/* Invoice status — semantic colours kept */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: T.textFaint}}>Invoice</span>
                      <select value={jobForm.invoiceStatus || 'not_invoiced'} onChange={e => setJobForm({...jobForm, invoiceStatus: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus text-xs font-medium ${jobForm.invoiceStatus === 'invoiced' ? 'bg-accent-tint text-accent-strong border-accent' : jobForm.invoiceStatus === 'to_invoice' ? 'bg-accent-tint text-accent-strong border-accent' : ''}`}
                        style={jobForm.invoiceStatus === 'invoiced' || jobForm.invoiceStatus === 'to_invoice' ? {} : {background: T.hairlineSoft, borderColor: T.hairline, color: T.textMuted}}>
                        <option value="not_invoiced">Not Invoiced</option><option value="to_invoice">To Invoice</option><option value="invoiced">Invoiced</option>
                      </select>
                    </div>
                    {/* Proof — semantic colours kept */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{color: T.textFaint}}>Proof</span>
                      <select value={jobForm.proofStatus || 'none'} onChange={e => setJobForm({...jobForm, proofStatus: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus text-xs font-medium ${jobForm.proofStatus === 'approved' ? 'bg-ok-tint text-ok border-ok' : jobForm.proofStatus === 'sent' ? 'bg-warn-tint text-warn border-warn' : jobForm.proofStatus === 'rejected' ? 'bg-danger-tint text-danger border-danger' : ''}`}
                        style={jobForm.proofStatus === 'approved' || jobForm.proofStatus === 'sent' || jobForm.proofStatus === 'rejected' ? {} : {background: T.hairlineSoft, borderColor: T.hairline, color: T.textMuted}}>
                        <option value="none">No Proof</option><option value="sent">Sent</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div className="w-px h-4" style={{background: T.hairline}} />
                    {/* Lock — amber kept as identity colour */}
                    <button type="button" onClick={() => setJobForm(f => ({ ...f, locked: !f.locked }))}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold transition-colors ${jobForm.locked ? 'bg-accent-tint text-accent-strong border-accent hover:bg-accent-strong' : ''}`}
                      style={jobForm.locked ? {} : {background: T.panel, color: T.textMuted, borderColor: T.hairline}}>
                      {jobForm.locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                  </div>

                  {/* Row 5: Notes + Shipping address + Credit warning */}
                  <div className="flex divide-x" style={{borderColor: T.hairline}}>
                    <div className="flex flex-col px-2.5 py-1.5 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Job Notes</span>
                      <textarea value={jobForm.notes || ''} onChange={e => setJobForm({...jobForm, notes: e.target.value})}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full resize-none leading-relaxed" style={{color: T.text}} rows={2} placeholder="Special instructions, artwork notes…" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:220}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Shipping Address</span>
                      <textarea value={jobForm.shippingAddress || ''} onChange={e => setJobForm({...jobForm, shippingAddress: e.target.value})}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full resize-none leading-relaxed" style={{color: T.text}} rows={2} />
                    </div>
                    {(() => {
                      const fc = customers.find(c => c.id === jobForm.customerId);
                      if (!fc || !fc.creditLimit) return null;
                      const outstanding = jobs.filter(j => j.customerId === fc.id).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
                      const overLimit = outstanding > fc.creditLimit;
                      const util = Math.min(100, (outstanding / fc.creditLimit) * 100);
                      if (util < 80) return null;
                      return (
                        <div className={`flex items-center gap-2 px-3 py-2 text-xs ${overLimit ? 'bg-danger-tint text-danger' : 'bg-warn-tint text-warn'}`} style={{minWidth:200}}>
                          <span className="text-base">{overLimit ? '🚫' : '⚠️'}</span>
                          <div>
                            <div className="font-semibold">{overLimit ? 'Over Credit Limit' : 'Near Limit'}</div>
                            <div className="text-[10px]">${outstanding.toLocaleString('en-AU', {maximumFractionDigits:0})} / ${Number(fc.creditLimit).toLocaleString()} ({util.toFixed(0)}%)</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Row 6: Jim2 Sprint-2 fields */}
                  <div className="flex divide-x border-t" style={{borderColor: T.hairline}}>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:120}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Price Level</span>
                      <select
                        value={jobForm.priceLevel || ''}
                        onChange={e => setJobForm(f => ({ ...f, priceLevel: e.target.value }))}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}
                      >
                        <option value="">— select —</option>
                        {['Retail', 'Trade', 'Wholesale', 'VIP', 'Cost'].map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:110}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Acc Mgr</span>
                      <input
                        value={jobForm.accMgr || ''}
                        onChange={e => setJobForm(f => ({ ...f, accMgr: e.target.value }))}
                        placeholder="Initials or name"
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}
                      />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Ex Job Ref</span>
                      <input
                        value={jobForm.exJobRef || ''}
                        onChange={e => setJobForm(f => ({ ...f, exJobRef: e.target.value }))}
                        placeholder="Customer PO or ref"
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}
                      />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:140}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Requested By</span>
                      <input
                        value={jobForm.requestedBy || ''}
                        onChange={e => setJobForm(f => ({ ...f, requestedBy: e.target.value }))}
                        placeholder="Person who placed order"
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full" style={{color: T.text}}
                      />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{color: T.textFaint}}>Invoice Description</span>
                      <textarea
                        value={jobForm.invoiceDesc || ''}
                        onChange={e => setJobForm(f => ({ ...f, invoiceDesc: e.target.value }))}
                        rows={2}
                        placeholder="Description to print on invoice"
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs w-full resize-none leading-relaxed" style={{color: T.text}}
                      />
                    </div>
                    <div className="flex items-center px-2.5 py-1.5 gap-1.5">
                      <input
                        type="checkbox"
                        id="lockRate"
                        checked={!!jobForm.lockRate}
                        onChange={e => setJobForm(f => ({ ...f, lockRate: e.target.checked }))}
                        className="rounded"
                      />
                      <label htmlFor="lockRate" className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap" style={{color: T.textFaint}}>Lock Rate</label>
                    </div>
                  </div>

                </div>
                {/* ── end compact header ── */}
                {/* ↓ Line Items follow immediately after compact header ↓ */}
                <div className="hidden">

                  {/* Column 1: Customer & Dates */}
                  <div className="space-y-2">
                    <div className="relative">
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Customer Name</label>
                      <input
                        type="text"
                        value={custDropdown.open ? custDropdown.query : jobForm.customer}
                        onChange={(e) => {
                          setCustDropdown({ open: true, query: e.target.value, highlighted: 0 });
                          setJobForm({ ...jobForm, customer: e.target.value });
                        }}
                        onFocus={() => setCustDropdown({ open: true, query: jobForm.customer, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setCustDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const hits = customers.filter(c => {
                            const q = custDropdown.query.toLowerCase();
                            return !q || c.name.toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q);
                          }).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[custDropdown.highlighted]) {
                            e.preventDefault();
                            const c = hits[custDropdown.highlighted];
                            setJobForm(f => ({ ...f, ...applyCustomerToJobForm(c) }));
                            setCustDropdown({ open: false, query: '', highlighted: 0 });
                          }
                          if (e.key === 'Escape') setCustDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}}
                        placeholder="Type to search customers…"
                        autoComplete="off"
                        required
                      />
                      {custDropdown.open && (() => {
                        const q = custDropdown.query.toLowerCase();
                        const hits = customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 w-full rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 280, background: T.panel, border: `1px solid ${T.hairline}` }}>
                            <div className="px-3 py-1.5 text-xs border-b flex items-center gap-1" style={{color: T.textFaint, background: T.hairlineSoft, borderColor: T.hairline}}>
                              <Search className="w-3 h-3" />{q ? `Customers matching "${custDropdown.query}"` : 'All customers'}
                            </div>
                            {hits.map((c, i) => (
                              <div
                                key={c.id || c.name}
                                onMouseDown={() => {
                                  setJobForm(f => ({ ...f, ...applyCustomerToJobForm(c) }));
                                  setCustDropdown({ open: false, query: '', highlighted: 0 });
                                }}
                                onMouseEnter={() => setCustDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === custDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}
                              >
                                <div className="w-7 h-7 rounded-full bg-accent-tint text-accent-strong font-bold text-xs flex items-center justify-center flex-shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate text-xs" style={{color: T.text}}>{c.name}</div>
                                  {c.id && <div className="text-xs font-mono" style={{color: T.textFaint}}>{c.id}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Customer ID</label>
                      <select
                        value={jobForm.customerId}
                        onChange={(e) => {
                          const c = customers.find(c => c.id === e.target.value);
                          setJobForm(f => c ? { ...f, ...applyCustomerToJobForm(c) } : { ...f, customerId: e.target.value });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}}
                      >
                        <option value="">Select Customer</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                    {(() => {
                      const fc = customers.find(c => c.id === jobForm.customerId);
                      if (!fc || !fc.creditLimit) return null;
                      const outstanding = jobs.filter(j => j.customerId === fc.id).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
                      const overLimit = outstanding > fc.creditLimit;
                      const util = Math.min(100, (outstanding / fc.creditLimit) * 100);
                      if (util < 80) return null;
                      return (
                        <div className={`rounded-lg px-3 py-2 text-sm flex items-start gap-2 ${overLimit ? 'bg-danger-tint border border-danger text-danger' : 'bg-warn-tint border border-warn text-warn'}`}>
                          <span className="text-lg leading-tight">{overLimit ? '🚫' : '⚠️'}</span>
                          <div>
                            <span className="font-semibold">{overLimit ? 'Over Credit Limit' : 'Near Credit Limit'}</span>
                            <span className="ml-1">{fc.name} — ${outstanding.toLocaleString('en-AU', { maximumFractionDigits: 0 })} outstanding of ${Number(fc.creditLimit).toLocaleString()} limit ({util.toFixed(0)}% used)</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Date In</label>
                        <input type="date" value={jobForm.dateIn} onChange={(e) => setJobForm({...jobForm, dateIn: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} />
                      </div>
                      <div>
                        <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Due Date <span className="font-normal text-xs" style={{color: T.textFaint}}>(auto from terms)</span></label>
                        <input type="date" value={jobForm.due} onChange={(e) => setJobForm({...jobForm, due: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Out Date</label>
                        <input type="date" value={jobForm.out || ''} onChange={(e) => setJobForm({...jobForm, out: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} />
                      </div>
                      <div>
                        <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Commitment Date</label>
                        <input type="date" value={jobForm.commitmentDate || ''} onChange={(e) => setJobForm({...jobForm, commitmentDate: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} title="Promised delivery date" />
                      </div>
                    </div>
                  </div>

                  {/* Column 2: References & Assignment */}
                  <div className="space-y-2">
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Cust Ref #</label>
                      <input type="text" value={jobForm.custRef || ''} onChange={(e) => setJobForm({...jobForm, custRef: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} placeholder="Customer's own reference" />
                    </div>
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Our Ref #</label>
                      <input type="text" value={jobForm.ourRef || ''} onChange={(e) => setJobForm({...jobForm, ourRef: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} placeholder="Internal contact" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Quote Ref</label>
                        <input type="text" value={jobForm.quote} onChange={(e) => setJobForm({...jobForm, quote: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} />
                      </div>
                      <div>
                        <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Valid Until</label>
                        <input type="date" value={jobForm.validityDate || ''} onChange={(e) => setJobForm({...jobForm, validityDate: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} title="Quote expiry date" />
                      </div>
                    </div>
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Description</label>
                      <input type="text" value={jobForm.description || ''} onChange={(e) => setJobForm({...jobForm, description: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} placeholder="e.g. Ad-Hoc Sale" />
                    </div>
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Project #</label>
                      <input type="text" value={jobForm.projectNo || ''} onChange={(e) => setJobForm({...jobForm, projectNo: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}} />
                    </div>
                    <div className="relative">
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Assigned To</label>
                      <input
                        type="text"
                        value={assignedDropdown.open ? assignedDropdown.query : jobForm.assignedTo}
                        onChange={(e) => { setAssignedDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({...jobForm, assignedTo: e.target.value}); }}
                        onFocus={() => setAssignedDropdown({ open: true, query: jobForm.assignedTo, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setAssignedDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = assignedDropdown.query.toLowerCase();
                          const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                          const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[assignedDropdown.highlighted]) { e.preventDefault(); setJobForm({...jobForm, assignedTo: hits[assignedDropdown.highlighted]}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setAssignedDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}}
                        placeholder="Type or pick…"
                        autoComplete="off"
                      />
                      {assignedDropdown.open && (() => {
                        const q = (assignedDropdown.query || '').toLowerCase();
                        const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                        const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 w-full rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 200, background: T.panel, border: `1px solid ${T.hairline}` }}>
                            <div className="px-3 py-1.5 text-xs border-b" style={{color: T.textFaint, background: T.hairlineSoft, borderColor: T.hairline}}>Previous assignees</div>
                            {hits.map((name, i) => (
                              <div key={name}
                                onMouseDown={() => { setJobForm({...jobForm, assignedTo: name}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }}
                                onMouseEnter={() => setAssignedDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === assignedDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}>
                                <div className="w-6 h-6 rounded-full bg-accent-tint text-accent-strong font-bold text-xs flex items-center justify-center flex-shrink-0">{name.charAt(0).toUpperCase()}</div>
                                <span className="text-xs" style={{color: T.text}}>{name}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Column 3: Shipping & Notes */}
                  <div className="space-y-2">
                    <div className="relative">
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Ship To</label>
                      <input
                        type="text"
                        value={shipDropdown.open ? shipDropdown.query : (jobForm.shipTo || '')}
                        onChange={(e) => {
                          setShipDropdown({ open: true, query: e.target.value, highlighted: 0 });
                          setJobForm({ ...jobForm, shipTo: e.target.value });
                        }}
                        onFocus={() => setShipDropdown({ open: true, query: jobForm.shipTo || '', highlighted: 0 })}
                        onBlur={() => setTimeout(() => setShipDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = shipDropdown.query.toLowerCase();
                          const hits = cardFiles.filter(cf => !q || (cf.shipCode || '').toLowerCase().includes(q) || (cf.companyName || '').toLowerCase().includes(q)).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[shipDropdown.highlighted]) {
                            e.preventDefault();
                            const cf = hits[shipDropdown.highlighted];
                            const addr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n');
                            setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: addr || jobForm.shippingAddress });
                            setShipDropdown({ open: false, query: '', highlighted: 0 });
                          }
                          if (e.key === 'Escape') setShipDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}}
                        placeholder="Ship-to code or address"
                        autoComplete="off"
                      />
                      {shipDropdown.open && (() => {
                        const q = shipDropdown.query.toLowerCase();
                        const hits = cardFiles.filter(cf => !q || (cf.shipCode || '').toLowerCase().includes(q) || (cf.companyName || '').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 w-full rounded-xl shadow-2xl z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 280, background: T.panel, border: `1px solid ${T.hairline}` }}>
                            <div className="px-3 py-1.5 text-xs border-b flex items-center gap-1" style={{color: T.textFaint, background: T.hairlineSoft, borderColor: T.hairline}}>
                              <Search className="w-3 h-3" />{q ? `Ship codes matching "${shipDropdown.query}"` : 'Card file addresses'}
                            </div>
                            {hits.map((cf, i) => {
                              const addr = [cf.suburb, cf.state, cf.postcode].filter(Boolean).join(' ');
                              return (
                                <div
                                  key={cf.shipCode}
                                  onMouseDown={() => {
                                    const fullAddr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n');
                                    setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: fullAddr || jobForm.shippingAddress });
                                    setShipDropdown({ open: false, query: '', highlighted: 0 });
                                  }}
                                  onMouseEnter={() => setShipDropdown(s => ({ ...s, highlighted: i }))}
                                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-0 ${i === shipDropdown.highlighted ? 'bg-accent-tint' : 'hover:bg-panel-alt'}`}
                                >
                                  <div className="flex-shrink-0 bg-ok-tint text-ok text-xs font-bold font-mono px-2 py-0.5 rounded">
                                    {cf.shipCode}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate text-xs" style={{color: T.text}}>{cf.companyName || cf.shipCode}</div>
                                    {addr && <div className="text-xs truncate" style={{color: T.textFaint}}>{addr}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Shipping Address</label>
                      <textarea
                        value={jobForm.shippingAddress}
                        onChange={(e) => setJobForm({...jobForm, shippingAddress: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}}
                        rows="3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-0.5" style={{color: T.textMuted}}>Job Notes</label>
                      <textarea
                        value={jobForm.notes || ''}
                        onChange={(e) => setJobForm({...jobForm, notes: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-focus" style={{borderColor: T.hairline, color: T.text}}
                        rows="3"
                        placeholder="Special instructions, artwork notes..."
                      />
                    </div>
                  </div>

                </div>


              {/* Line Items */}
              <div className="rounded-lg flex flex-col" style={{ height: lineItemsHeight, minHeight: 120, background: T.hairlineSoft, border: `1px solid ${T.hairline}` }}>
                <div className="px-3 py-2 flex-1" style={{ minHeight: 0, overflowY: 'visible', overflowX: 'auto' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="font-semibold text-sm" style={{ color: T.text }}>Line Items <span className="text-xs font-normal" style={{ color: T.textFaint }}>(right-click for options)</span></h3>
                    <div className="flex items-center gap-1 flex-wrap">
                      <div className="relative">
                        <button type="button" onClick={() => setTemplateModalOpen(true)}
                          className="text-xs px-2 py-1 rounded hover:bg-panel-alt flex items-center gap-1" style={{ background: T.panel, color: T.textMuted, border: `1px solid ${T.hairline}` }}>
                          <BookOpen className="w-3 h-3" />Load
                        </button>
                        {templateModalOpen && (
                          <div className="absolute left-0 top-full mt-1 w-72 rounded-lg shadow-xl z-50 p-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold" style={{ color: T.text }}>Job Templates</span>
                              <button onClick={() => setTemplateModalOpen(false)} style={{ color: T.textMuted }}><X className="w-4 h-4" /></button>
                            </div>
                            {jobTemplates.length === 0 ? (
                              <p className="text-xs text-center py-3" style={{ color: T.textFaint }}>No templates saved yet.</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {jobTemplates.map(tpl => (
                                  <div key={tpl.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-panel-alt group">
                                    <button type="button" onMouseDown={() => loadJobTemplate(tpl)} className="flex-1 text-left text-sm font-medium truncate hover:text-accent-strong" style={{ color: T.text }}>
                                      {tpl.name} <span className="text-xs font-normal" style={{ color: T.textFaint }}>({tpl.items?.length || 0} items)</span>
                                    </button>
                                    <button type="button" onMouseDown={() => deleteJobTemplate(tpl.id)} className="text-danger hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button type="button" onClick={() => setTemplateSaveOpen(o => !o)}
                          className="text-xs px-2 py-1 rounded hover:bg-panel-alt flex items-center gap-1" style={{ background: T.panel, color: T.textMuted, border: `1px solid ${T.hairline}` }}>
                          <Save className="w-3 h-3" />Save
                        </button>
                        {templateSaveOpen && (
                          <div className="absolute left-0 top-full mt-1 w-60 rounded-lg shadow-xl z-50 p-3" style={{ background: T.panel, border: `1px solid ${T.hairline}` }} onClick={e => e.stopPropagation()}>
                            <p className="text-xs font-semibold mb-1.5" style={{ color: T.textMuted }}>Template name</p>
                            <input autoFocus type="text" value={templateSaveName}
                              onChange={e => setTemplateSaveName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && templateSaveName.trim()) saveJobTemplate(templateSaveName.trim()); if (e.key === 'Escape') setTemplateSaveOpen(false); }}
                              className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus mb-2" placeholder="e.g. Standard Polo Order" />
                            <div className="flex gap-2">
                              <button type="button" onMouseDown={() => { if (templateSaveName.trim()) saveJobTemplate(templateSaveName.trim()); }}
                                className="flex-1 bg-ok text-white text-xs py-1.5 rounded hover:bg-ok font-medium" disabled={!templateSaveName.trim()}>Save</button>
                              <button type="button" onMouseDown={() => setTemplateSaveOpen(false)} className="text-xs text-muted hover:text-header">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => setJobForm(f => ({ ...f, items: [...f.items, { ...blankItem(), displayType: 'note' }] }))}
                        className="text-xs px-2 py-1 rounded hover:bg-panel-alt" style={{ background: T.panel, color: T.textMuted, border: `1px solid ${T.hairline}` }}>+ Note</button>
                      <button type="button" onClick={addJobItem}
                        className="text-xs px-3 py-1 rounded flex items-center gap-0.5" style={{ background: T.accentStrong, color: T.panel }}>
                        <Plus className="w-3 h-3" />Add Item
                      </button>
                      <button type="button"
                        onClick={() => setJobForm(f => recalcJobTotals({ ...f, items: [...f.items, { ...blankItem(), displayType: 'product', description: 'Freight', stockCode: 'FREIGHT', priceEx: 0, priceInc: 0, qty: 1, order: 1 }] }))}
                        className="text-xs px-2 py-1 rounded hover:bg-panel-alt" style={{ background: T.panel, color: T.textMuted, border: `1px solid ${T.hairline}` }}>+ Freight</button>
                      <button type="button"
                        onClick={() => {
                          const freightItem = jobForm.items.find(i => (i.stockCode || '').toUpperCase() === 'FREIGHT' || (i.description || '').toLowerCase().includes('freight'));
                          const freightAmt = freightItem ? parseFloat(freightItem.priceEx || freightItem.total || 0) : 0;
                          const levy = freightAmt > 0 ? Math.round(freightAmt * 0.13 * 100) / 100 : 0;
                          setJobForm(f => recalcJobTotals({ ...f, items: [...f.items, { ...blankItem(), displayType: 'product', description: 'Fuel Levy', stockCode: 'FUEL-LEVY', priceEx: levy, priceInc: levy * 1.1, qty: 1, order: 1 }] }));
                        }}
                        className="text-xs px-2 py-1 rounded hover:bg-panel-alt" style={{ background: T.panel, color: T.textMuted, border: `1px solid ${T.hairline}` }}>+ Fuel Levy</button>
                    </div>
                  </div>

                  {jobForm.items.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: T.textFaint }}>No items yet. Click "Add Item" to begin.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="line-items-table border-collapse" style={{ tableLayout: 'fixed', width: '100%', minWidth: 820, fontSize: 12 }}>
                        <thead>
                          <tr className="select-none" style={{ background: T.hairlineSoft, borderBottom: `2px solid ${T.hairline}`, color: T.textMuted }}>
                            <th className="px-1 py-1 text-center text-[11px] font-semibold" style={{ width: 26, borderRight: `1px solid ${T.hairline}` }}>#</th>
                            {[
                              { key: 'stock', label: 'Stock Code', align: 'left' },
                              { key: 'desc', label: 'Description', align: 'left' },
                              { key: 'order', label: 'Ord', align: 'right' },
                              { key: 'supply', label: 'Sup', align: 'right' },
                              { key: 'bord', label: 'B.Ord', align: 'right', color: 'text-accent' },
                              { key: 'priceEx', label: 'Price Ex', align: 'right' },
                              { key: 'priceInc', label: 'Price Inc', align: 'right' },
                              { key: 'margin', label: 'M%', align: 'right', color: 'text-ok' },
                              { key: 'total', label: 'Total', align: 'right', color: 'text-header' },
                              { key: 'hide', label: 'H', align: 'center' },
                            ].map(col => (
                              <th key={col.key} className={`text-${col.align} px-1 py-1 text-[11px] font-semibold relative ${col.color || ''}`} style={{ width: colWidths[col.key], borderRight: `1px solid ${T.hairline}`, color: col.color ? undefined : T.textMuted }}>
                                {col.label}
                                <div onMouseDown={(e) => startColResize(col.key, e)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10" />
                              </th>
                            ))}
                            <th style={{ width: 24 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobForm.items.map((item, idx) => {
                            const isSec = item.displayType === 'section';
                            const isNote = item.displayType === 'note';
                            const invItem = item.stockCode ? inventory.find(i => i.sku === item.stockCode) : null;
                            const isOutOfStock = !isSec && !isNote && invItem != null && invItem.stock <= 0;
                            const isLowMargin = !isSec && !isNote && item.priceEx > 0 && item.purchasePrice > 0 && (item.marginPercent || 0) < 15;
                            const decOpt = decMethods.find(o => o.v === (item.decorationType || 'None')) || DEC_OPTIONS[0];
                            const hasDecoration = !isSec && !isNote && item.decorationType && item.decorationType !== 'None';

                            const rowBg = isSec ? 'bg-accent-tint' : isNote ? 'bg-warn-tint'
                              : isOutOfStock ? 'bg-accent-tint' : isLowMargin ? 'bg-danger-tint'
                              : idx % 2 === 0 ? 'bg-white' : 'bg-panel-alt/50';
                            const borderLeft = isSec ? 'border-l-2 border-l-blue-500' : isNote ? 'border-l-2 border-l-yellow-300'
                              : isOutOfStock ? 'border-l-2 border-l-indigo-400' : isLowMargin ? 'border-l-2 border-l-red-400' : '';

                            const ci = 'w-full h-6 border border-hairline rounded px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent-focus bg-white';
                            const ciR = ci + ' text-right tabular-nums';

                            const dIsOpen = descDropdown.idx === idx;
                            const dq = dIsOpen ? descDropdown.query : (item.description || '');
                            const skuIsOpen = skuDropdown.idx === idx;
                            const skuQ = skuIsOpen ? skuDropdown.query : (item.stockCode || '');

                            const invSearch = (term) => inventory.map(inv => {
                              const sku = inv.sku.toLowerCase(); const name = (inv.name || '').toLowerCase(); const t = term.toLowerCase();
                              if (!t) return { inv, score: 0 };
                              if (name === t) return { inv, score: 100 };
                              if (name.startsWith(t)) return { inv, score: 80 };
                              if (sku === t) return { inv, score: 75 };
                              if (sku.startsWith(t)) return { inv, score: 70 };
                              if (name.includes(t)) return { inv, score: 50 };
                              if (sku.includes(t)) return { inv, score: 40 };
                              return { inv, score: 0 };
                            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);

                            const dScored = dIsOpen ? invSearch(descDropdown.query) : [];
                            const skuScored = skuIsOpen ? inventory.map(inv => {
                              const sku = inv.sku.toLowerCase(); const name = (inv.name || '').toLowerCase(); const term = skuQ.toLowerCase();
                              if (!term) return { inv, score: 0 };
                              if (sku === term) return { inv, score: 100 };
                              if (sku.startsWith(term)) return { inv, score: 80 };
                              if (sku.includes(term)) return { inv, score: 60 };
                              if (name.includes(term)) return { inv, score: 30 };
                              return { inv, score: 0 };
                            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8) : [];

                            const hl = (text, term) => { if (!term) return text; const i = (text || '').toLowerCase().indexOf(term.toLowerCase()); if (i === -1) return text; return <>{text.slice(0, i)}<strong className="text-fg">{text.slice(i, i + term.length)}</strong>{text.slice(i + term.length)}</>; };

                            const selectInvItem = (inv) => {
                              setJobForm(f => {
                                const items = [...f.items];
                                const cost = parseFloat(inv.unitCost || 0);
                                const priceEx = parseFloat(inv.unitPrice || inv.unitCost || 0);
                                const priceInc = parseFloat((priceEx * 1.1).toFixed(2));
                                const margin = cost > 0 ? parseFloat((priceEx - cost).toFixed(2)) : 0;
                                const marginPercent = priceEx > 0 && cost > 0 ? parseFloat(((priceEx - cost) / priceEx * 100).toFixed(1)) : 0;
                                // Jim2 stock split: supply from available (on-hand − committed), back-order the rest.
                                const order = parseFloat(items[idx].order) || 0;
                                const avail = Math.max(0, (inv.stock || 0) - (inv.committed_qty || 0));
                                const supply = Math.min(order, avail);
                                const bOrd = Math.max(0, order - supply);
                                items[idx] = { ...items[idx], stockCode: inv.sku, description: inv.name, purchasePrice: cost, priceEx, priceInc, margin, marginPercent, supply, bOrd, total: parseFloat((priceEx * order).toFixed(2)) };
                                return recalcJobTotals({ ...f, items });
                              });
                              setDescDropdown({ idx: -1, query: '', highlighted: 0 });
                              setSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                            };

                            return (
                              <React.Fragment key={idx}>
                                <tr
                                  className={`hover:bg-accent-tint/30 ${rowBg} ${borderLeft} ${ctxMenu.rowIdx === idx && ctxMenu.visible ? 'ring-1 ring-inset ring-accent-focus' : ''}`}
                                  style={{ borderBottom: `1px solid ${T.hairline}` }}
                                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, rowIdx: idx }); }}
                                >
                                  <td className="px-1 py-0.5 text-center text-[10px] select-none" style={{ width: 26, borderRight: `1px solid ${T.hairline}`, color: T.textFaint }}>
                                    <span className={isSec ? 'text-accent-strong font-bold' : isNote ? 'text-warn' : ''}>{isSec ? '§' : isNote ? '¶' : idx + 1}</span>
                                  </td>

                                  {isSec || isNote ? (
                                    <td colSpan={11} className="px-2 py-0.5">
                                      <input type="text" value={item.description || ''} onChange={e => updateJobItem(idx, 'description', e.target.value)}
                                        className={`w-full bg-transparent text-xs h-6 focus:outline-none border-b border-transparent focus:border-current px-0 ${isSec ? 'font-bold text-accent-strong' : 'italic text-warn'}`}
                                        placeholder={isSec ? 'Section heading…' : 'Note or instruction…'} />
                                    </td>
                                  ) : (<>
                                    {/* Stock Code */}
                                    <td className="px-0.5 py-0.5 relative" style={{ width: colWidths.stock, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="text" value={skuQ}
                                        onChange={e => { setSkuDropdown(s => ({ ...s, idx, query: e.target.value, highlighted: 0, typed: true })); updateJobItem(idx, 'stockCode', e.target.value); }}
                                        onFocus={(e) => { const r = e.target.getBoundingClientRect(); setSkuDropdown({ idx, query: item.stockCode || '', highlighted: 0, rect: r, typed: false }); }}
                                        onBlur={() => setTimeout(() => setSkuDropdown({ idx: -1, query: '', highlighted: 0, rect: null }), 200)}
                                        onKeyDown={e => {
                                          if (!skuIsOpen) return;
                                          if (e.key === 'ArrowDown') { e.preventDefault(); setSkuDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, skuScored.length - 1) })); }
                                          if (e.key === 'ArrowUp') { e.preventDefault(); setSkuDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                                          if (e.key === 'Enter' && skuScored[skuDropdown.highlighted]) { e.preventDefault(); selectInvItem(skuScored[skuDropdown.highlighted].inv); }
                                          if (e.key === 'Escape') setSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                                        }}
                                        className={ci + ' font-mono'} placeholder="SKU…" autoComplete="off" />
                                      {skuIsOpen && skuDropdown.rect && skuDropdown.typed && skuScored.length > 0 && (
                                        <div className="rounded-xl shadow-2xl" style={{ position: 'fixed', zIndex: 99999, minWidth: 380, left: skuDropdown.rect.left, top: skuDropdown.rect.top - 4, transform: 'translateY(-100%)', background: T.panel, border: `1px solid ${T.hairline}` }}>
                                          <div className="px-3 py-1.5 text-xs flex items-center gap-1.5" style={{ color: T.textMuted, borderBottom: `1px solid ${T.hairline}`, background: T.hairlineSoft }}><Search className="w-3 h-3" />{skuQ ? `SKU: "${skuQ}"` : 'Browse by SKU'}</div>
                                          {skuScored.length === 0 ? <div className="px-4 py-4 text-xs text-center" style={{ color: T.textFaint }}>No matches</div>
                                            : skuScored.map(({ inv }, i) => (
                                              <div key={inv.sku} onMouseDown={() => selectInvItem(inv)} onMouseEnter={() => setSkuDropdown(s => ({ ...s, highlighted: i }))}
                                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-panel-alt`}
                                                style={{ borderBottom: `1px solid ${T.hairline}`, background: i === skuDropdown.highlighted ? T.accentTint : undefined }}>
                                                <div className="flex-1 min-w-0">
                                                  <div className="font-mono font-bold text-xs" style={{ color: T.accentStrong }}>{hl(inv.sku, skuQ)}</div>
                                                  <div className="text-xs truncate" style={{ color: T.textMuted }}>{inv.name}</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                  <div className={`text-xs font-semibold ${(inv.stock || 0) === 0 ? 'text-danger' : 'text-ok'}`}>{(inv.stock || 0) === 0 ? 'Out' : inv.stock}</div>
                                                  {inv.unitPrice > 0 && <div className="text-faint text-xs">${inv.unitPrice.toFixed(2)}</div>}
                                                </div>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </td>

                                    {/* Description + Sizes */}
                                    <td className="px-0.5 py-0.5" style={{ width: colWidths.desc, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="text" value={dq}
                                        onChange={e => { setDescDropdown(s => ({ ...s, idx, query: e.target.value, highlighted: 0, typed: true })); updateJobItem(idx, 'description', e.target.value); }}
                                        onFocus={(e) => { const r = e.target.getBoundingClientRect(); setDescDropdown({ idx, query: item.description || '', highlighted: 0, rect: r, typed: false }); }}
                                        onBlur={() => setTimeout(() => setDescDropdown({ idx: -1, query: '', highlighted: 0, rect: null }), 200)}
                                        onKeyDown={e => {
                                          if (!dIsOpen) return;
                                          if (e.key === 'ArrowDown') { e.preventDefault(); setDescDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, dScored.length - 1) })); }
                                          if (e.key === 'ArrowUp') { e.preventDefault(); setDescDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                                          if (e.key === 'Enter' && dScored[descDropdown.highlighted]) { e.preventDefault(); selectInvItem(dScored[descDropdown.highlighted].inv); }
                                          if (e.key === 'Escape') setDescDropdown({ idx: -1, query: '', highlighted: 0 });
                                        }}
                                        className={ci} placeholder="Description…" autoComplete="off" />
                                      {dIsOpen && descDropdown.rect && descDropdown.typed && dScored.length > 0 && (
                                        <div className="rounded-xl shadow-2xl" style={{ position: 'fixed', zIndex: 99999, minWidth: 420, left: descDropdown.rect.left, top: descDropdown.rect.top - 4, transform: 'translateY(-100%)', background: T.panel, border: `1px solid ${T.hairline}` }}>
                                          <div className="px-3 py-1.5 text-xs flex items-center gap-1.5" style={{ color: T.textMuted, borderBottom: `1px solid ${T.hairline}`, background: T.hairlineSoft }}><Search className="w-3 h-3" />{dq ? `"${dq}"` : 'All items'}</div>
                                          {dScored.map(({ inv }, i) => (
                                            <div key={inv.sku} onMouseDown={() => selectInvItem(inv)} onMouseEnter={() => setDescDropdown(s => ({ ...s, highlighted: i }))}
                                              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-panel-alt"
                                              style={{ borderBottom: `1px solid ${T.hairline}`, background: i === descDropdown.highlighted ? T.accentTint : undefined }}>
                                              <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-xs" style={{ color: T.text }}>{hl(inv.name || '', dq)}</div>
                                                <div className="font-mono text-xs" style={{ color: T.accentStrong }}>{inv.sku}{inv.category && <span className="ml-1.5" style={{ color: T.textFaint }}>· {inv.category}</span>}</div>
                                              </div>
                                              <div className="text-right shrink-0">
                                                <div className={`text-xs font-semibold ${(inv.stock || 0) === 0 ? 'text-danger' : 'text-ok'}`}>{(inv.stock || 0) === 0 ? 'Out' : `${inv.stock}`}</div>
                                                {inv.unitPrice > 0 && <div className="text-xs" style={{ color: T.textFaint }}>${inv.unitPrice.toFixed(2)}</div>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-0.5 mt-0.5">
                                        <input type="text" value={item.sizes || ''} onChange={e => updateJobItem(idx, 'sizes', e.target.value)}
                                          className="flex-1 h-5 border border-hairline-soft rounded px-1 text-[10px] text-faint placeholder-faint focus:outline-none focus:ring-1 focus:ring-accent-focus bg-white"
                                          placeholder="Sizes…" />
                                        <button type="button" onClick={() => setMatrixPopup({ idx })} title="Size/colour matrix"
                                          className="shrink-0 h-5 w-5 flex items-center justify-center border border-accent text-accent rounded hover:bg-accent-tint text-[10px] font-bold leading-none">⊞</button>
                                      </div>
                                    </td>

                                    {/* Order */}
                                    <td className="px-0.5 py-0.5" style={{ width: colWidths.order, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="number" value={item.order || ''} onChange={e => updateJobItem(idx, 'order', e.target.value)} className={ciR} min="0" />
                                    </td>

                                    {/* Supply */}
                                    <td className="px-0.5 py-0.5" style={{ width: colWidths.supply, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="number" value={isOutOfStock ? 0 : (item.supply || '')} onChange={e => updateJobItem(idx, 'supply', e.target.value)}
                                        className={`${ciR} ${isOutOfStock ? 'bg-hairline-soft text-faint pointer-events-none' : ''}`}
                                        min="0" readOnly={isOutOfStock} title={invItem != null ? `${invItem.stock} on hand` : ''} />
                                    </td>

                                    {/* B.Ord */}
                                    <td className="px-0.5 py-0.5" style={{ width: colWidths.bord, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="number" value={item.bOrd || ''} onChange={e => updateJobItem(idx, 'bOrd', e.target.value)}
                                        className={`${ciR} ${item.bOrd > 0 ? 'text-accent-strong font-semibold border-accent bg-accent-tint' : ''}`}
                                        min="0" placeholder="0" />
                                    </td>

                                    {/* Price Ex */}
                                    <td className="px-0.5 py-0.5" style={{ width: colWidths.priceEx, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="number" step="0.01" value={item.priceEx || ''} onChange={e => updateJobItem(idx, 'priceEx', e.target.value)} className={`${ciR} font-medium`} min="0" />
                                    </td>

                                    {/* Price Inc */}
                                    <td className="px-0.5 py-0.5" style={{ width: colWidths.priceInc, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="number" step="0.01" value={item.priceInc || ''} onChange={e => updateJobItem(idx, 'priceInc', e.target.value)} className={ciR} min="0" />
                                    </td>

                                    {/* Margin % */}
                                    <td className="px-1 py-0.5 text-right" style={{ width: colWidths.margin, borderRight: `1px solid ${T.hairline}` }}
                                      title={isLowMargin ? `Low margin: ${(item.marginPercent || 0).toFixed(1)}% < 15%` : ''}>
                                      <span className={`text-[11px] font-semibold ${isLowMargin ? 'text-danger' : item.marginPercent > 0 ? 'text-ok' : item.marginPercent < 0 ? 'text-danger' : ''}`}
                                        style={!isLowMargin && item.marginPercent === 0 ? { color: T.textFaint } : undefined}>
                                        {item.priceEx > 0 && item.purchasePrice > 0 ? `${isLowMargin ? '⚠' : ''}${(item.marginPercent || 0).toFixed(0)}%` : '—'}
                                      </span>
                                    </td>

                                    {/* Total */}
                                    <td className="px-1 py-0.5 text-right font-bold text-[11px] tabular-nums" style={{ width: colWidths.total, borderRight: `1px solid ${T.hairline}`, color: T.text }}>
                                      ${(parseFloat(item.total) || 0).toFixed(2)}
                                    </td>

                                    {/* Hide */}
                                    <td className="px-0.5 py-0.5 text-center" style={{ width: colWidths.hide, borderRight: `1px solid ${T.hairline}` }}>
                                      <input type="checkbox" className="w-3 h-3 accent-accent-strong cursor-pointer" checked={item.hide || false} onChange={e => updateJobItem(idx, 'hide', e.target.checked)} title="Hide from customer documents" />
                                    </td>
                                  </>)}

                                  <td className="px-0.5 py-0.5 text-center" style={{ width: 24 }}>
                                    <button type="button" onClick={() => removeJobItem(idx)} className="text-danger hover:text-danger transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>

                                {/* Decoration sub-row */}
                                {hasDecoration && (
                                  <tr className={`${decOpt.v === 'EMB' ? 'bg-emphasis-tint/50' : decOpt.v === 'TRS' || decOpt.v === 'SP' ? 'bg-accent-tint/50' : decOpt.v === 'DTF' ? 'bg-accent-tint/50' : decOpt.v === 'SCR' ? 'bg-danger-tint/50' : 'bg-panel-alt/50'}`}
                                    style={{ borderBottom: `1px solid ${T.hairline}` }}>
                                    <td className="text-center text-[10px] select-none" style={{ width: 26, borderRight: `1px solid ${T.hairline}`, color: T.textFaint }}>↳</td>
                                    <td colSpan={10} className="px-2 py-0.5">
                                      <div className="flex items-center gap-2 relative">
                                        <button type="button" onClick={() => setOpenDecIdx(openDecIdx === idx ? null : idx)}
                                          className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${decOpt.pill}`}>
                                          {decOpt.emoji} {decOpt.l} <ChevronDown className="w-2.5 h-2.5 opacity-40" />
                                        </button>
                                        {openDecIdx === idx && (
                                          <>
                                            <div className="fixed inset-0 z-40" onClick={() => setOpenDecIdx(null)} />
                                            <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-hairline rounded-lg shadow-xl overflow-hidden" style={{ minWidth: 148 }}>
                                              {decMethods.map(opt => (
                                                <button key={opt.v} type="button"
                                                  onMouseDown={() => { updateJobItem(idx, 'decorationType', opt.v); setOpenDecIdx(null); }}
                                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-panel-alt ${opt.v === (item.decorationType || 'None') ? 'font-semibold bg-panel-alt' : 'text-header'}`}>
                                                  <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} /> {opt.emoji} {opt.l}
                                                </button>
                                              ))}
                                              <button type="button"
                                                onMouseDown={async () => { const v = await addDecMethod(); if (v) updateJobItem(idx, 'decorationType', v); setOpenDecIdx(null); }}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left font-medium border-t" style={{ color: T.accentStrong, borderColor: T.hairline }}>
                                                ＋ Add method…
                                              </button>
                                            </div>
                                          </>
                                        )}
                                        {/* Generic decoration code — works for any method (EMB/TRS/SP/DTF…) */}
                                        <input type="text" value={item.decCode || item.embCode || item.trsCode || ''} onChange={e => updateJobItem(idx, 'decCode', e.target.value)}
                                          className="h-5 border rounded px-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-accent-focus w-32 bg-white" style={{ borderColor: T.hairline, color: T.accentStrong }} placeholder={`${decOpt.v} code…`} />
                                        {/* EMB: stitch count */}
                                        {decOpt.v === 'EMB' && (
                                          <div className="flex items-center gap-0.5">
                                            <input type="number" min="0" value={item.stitchCount || ''} onChange={e => updateJobItem(idx, 'stitchCount', e.target.value)}
                                              className="h-5 w-20 border rounded px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-accent-focus bg-white" style={{ borderColor: T.hairline }} placeholder="Stitches" />
                                            <span className="text-[10px] shrink-0" style={{ color: T.textFaint }}>sts</span>
                                          </div>
                                        )}
                                        {/* Color count for Screen/DTF/DTG/Sub/Pad */}
                                        {decOpt.hasColors && (
                                          <div className="flex items-center gap-0.5">
                                            <input type="number" min="1" max="16" value={item.colorCount || ''} onChange={e => updateJobItem(idx, 'colorCount', e.target.value)}
                                              className="h-5 w-12 border border-hairline rounded px-1.5 text-[11px] text-muted focus:outline-none focus:ring-1 focus:ring-accent-focus bg-white" placeholder="#" />
                                            <span className="text-[10px] text-faint shrink-0">col</span>
                                          </div>
                                        )}
                                        {/* Position for all decoration types */}
                                        <select value={item.decPosition || ''} onChange={e => updateJobItem(idx, 'decPosition', e.target.value)}
                                          className="h-5 border border-hairline rounded px-1 text-[11px] text-muted focus:outline-none focus:ring-1 focus:ring-accent-focus bg-white">
                                          <option value="">Position…</option>
                                          {DEC_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                      </div>
                                    </td>
                                    <td style={{ width: 24 }}></td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {jobForm.items.length > 0 && (() => {
                    const productItems = jobForm.items.filter(i => i.displayType !== 'section' && i.displayType !== 'note');
                    const totalCost = productItems.reduce((s, i) => s + ((parseFloat(i.purchasePrice) || 0) * (parseFloat(i.order) || 0)), 0);
                    const grossMargin = (jobForm.subtotal || 0) - totalCost;
                    const marginPct = jobForm.subtotal > 0 ? (grossMargin / jobForm.subtotal * 100) : 0;
                    const marginColor = marginPct >= 30 ? 'text-ok' : marginPct >= 15 ? 'text-warn' : 'text-danger';
                    return (
                      <div className="mt-2 pt-2 border-t flex justify-between items-start gap-4">
                        {totalCost > 0 && (
                          <div className={`flex-1 rounded-lg p-2.5 text-xs border ${marginPct < 0 ? 'bg-danger-tint border-danger' : marginPct < 15 ? 'bg-warn-tint border-warn' : 'bg-panel-alt border-hairline'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1">
                                {marginPct < 0 && <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />}
                                <span className="font-semibold text-muted">Profitability</span>
                              </div>
                              <span className={`font-bold text-sm ${marginColor}`}>{marginPct.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-hairline rounded-full h-1.5 mb-1 overflow-hidden">
                              {marginPct >= 0
                                ? <div className={`h-1.5 rounded-full ${marginPct >= 30 ? 'bg-ok' : marginPct >= 15 ? 'bg-warn' : 'bg-danger'}`} style={{ width: `${Math.min(100, marginPct)}%` }} />
                                : <div className="h-1.5 w-full bg-danger rounded-full animate-pulse" />
                              }
                            </div>
                            <div className="flex justify-between text-muted">
                              <span>Cost: ${totalCost.toFixed(2)}</span>
                              <span className={marginColor}>Profit: ${grossMargin.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                        <div className="w-56 space-y-0.5 text-xs flex-shrink-0">
                          {totalCost > 0 && <div className="flex justify-between" style={{ color: T.textFaint }}><span>Total Cost:</span><span>${totalCost.toFixed(2)}</span></div>}
                          {totalCost > 0 && (
                            <div className={`flex justify-between font-medium ${grossMargin >= 0 ? 'text-ok' : 'text-danger'}`}>
                              <span>Gross Margin:</span><span>${grossMargin.toFixed(2)} ({marginPct.toFixed(1)}%)</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-0.5" style={{ color: T.textMuted, borderTop: `1px solid ${T.hairline}` }}>
                            <span>Subtotal (ex GST):</span><span>${(jobForm.subtotal || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between" style={{ color: T.textMuted }}>
                            <span>GST (10%):</span><span>${(jobForm.tax || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-sm pt-0.5" style={{ color: T.text, borderTop: `1px solid ${T.hairline}` }}>
                            <span>Total (inc GST):</span><span>${(jobForm.total || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {/* Drag handle */}
                <div
                  onMouseDown={startLineItemsResize}
                  className="h-2 flex items-center justify-center cursor-ns-resize rounded-b-lg hover:bg-accent-tint group flex-shrink-0"
                  style={{ background: T.hairlineSoft, borderTop: `1px solid ${T.hairline}` }}
                  title="Drag to resize"
                >
                  <div className="w-8 h-0.5 rounded-full group-hover:bg-accent-strong" style={{ background: T.hairline }} />
                </div>
              </div>

              {apiError && (
                <div className="mt-2 flex items-center justify-between bg-danger-tint border border-danger text-danger text-xs px-3 py-2 rounded-lg">
                  <span>{apiError}</span>
                  <button onClick={() => setApiError('')} className="ml-3 text-danger hover:text-danger text-sm font-bold">✕</button>
                </div>
              )}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 border rounded hover:bg-panel-alt"
                >
                  Cancel
                </button>
                {!jobForm.customerId && (
                  <span className="self-center text-xs" style={{ color: T.textFaint }}>Pick a customer to save</span>
                )}
                <button
                  onClick={saveJob}
                  className="px-4 py-2 bg-accent-strong text-white rounded hover:bg-accent-strong flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Job
                </button>
              </div>
            </div>
            )}

            {modalType === 'inventory' && (
              <InventoryForm
                categoryDropdown={categoryDropdown}
                closeModal={closeModal}
                editingItem={editingItem}
                inventory={inventory}
                inventoryForm={inventoryForm}
                locationDropdown={locationDropdown}
                saveInventoryItem={saveInventoryItem}
                setCategoryDropdown={setCategoryDropdown}
                setInventoryForm={setInventoryForm}
                setLocationDropdown={setLocationDropdown}
                suppliers={suppliers}
              />
            )}

            {modalType === 'customer' && (
              <CustomerForm
                closeModal={closeModal}
                customerForm={customerForm}
                saveCustomer={saveCustomer}
                setCustomerForm={setCustomerForm}
              />
            )}

            {modalType === 'supplier' && (
              <SupplierForm
                closeModal={closeModal}
                editingItem={editingItem}
                saveSupplier={saveSupplier}
                setSupplierForm={setSupplierForm}
                supplierForm={supplierForm}
              />
            )}

            {modalType === 'po' && (
              <PurchaseOrderForm
                closeModal={closeModal}
                inventory={inventory}
                poForm={poForm}
                poSkuDropdown={poSkuDropdown}
                savePO={savePO}
                setPoForm={setPoForm}
                setPoSkuDropdown={setPoSkuDropdown}
                setSupplierDropdown={setSupplierDropdown}
                supplierDropdown={supplierDropdown}
                suppliers={suppliers}
              />
            )}
          </div>
          </div>
      </DraggableModal>
    );
  };







  // ── Dispatch Modal ──────────────────────────────────────────────────────────

  // ── Unprint Modal ────────────────────────────────────────────────────────────

  // ── Sales Register Modal ─────────────────────────────────────────────────────

  // ── Transfer Stock Modal ─────────────────────────────────────────────────────

  // ── Stocktake Modal ──────────────────────────────────────────────────────────

  // ── Stock Flow Modal ─────────────────────────────────────────────────────────

  // Card Files Module
  const renderCardFiles = () => {
    const openEdit = (card) => {
      setCardFileForm({ ...card });
      setCardFileModal({ open: true, editing: card.shipCode });
    };

    const saveCard = async () => {
      try {
        if (cardFileModal.editing) {
          const updated = await api.cardFiles.update(cardFileModal.editing, cardFileForm);
          if (selectedCardFile?.shipCode === cardFileModal.editing) setSelectedCardFile(updated);
        } else {
          await api.cardFiles.create(cardFileForm);
        }
        queryClient.invalidateQueries({ queryKey: ['cardFiles'] });
        setCardFileModal({ open: false, editing: null });
      } catch (e) { alert(e.message); }
    };

    const deleteCard = async (shipCode) => {
      if (!window.confirm(`Delete card file ${shipCode}?`)) return;
      try {
        await api.cardFiles.delete(shipCode);
        if (selectedCardFile?.shipCode === shipCode) setSelectedCardFile(null);
        queryClient.invalidateQueries({ queryKey: ['cardFiles'] });
      } catch (e) { alert(e.message); }
    };

    const card = selectedCardFile;
    const relatedJobs = card ? jobs.filter(j => j.shipTo === card.shipCode) : [];

    return (
      <>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 46%', minWidth: 0 }}>
            <CardFilesModule
              cardFiles={cardFiles}
              search={cardFileSearch}
              group={cardFileGroup}
              onSearchChange={setCardFileSearch}
              onGroupChange={setCardFileGroup}
              selectedId={selectedCardFile?.shipCode ?? null}
              onSelectCard={(c) => setSelectedCardFile(c)}
              onNewCard={() => {
                setCardFileForm({ shipCode: '', customerCode: '', companyName: '', contactName: '', address1: '', address2: '', suburb: '', state: '', postcode: '', country: 'AU', phone: '', email: '', notes: '' });
                setCardFileModal({ open: true, editing: null });
              }}
            />
          </div>

          {/* Right: detail */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!card ? (
              <div className="bg-white rounded-lg shadow flex items-center justify-center h-64 text-faint">
                <div className="text-center">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Select a card file to view details</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow">
                {/* Card header */}
                <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-black text-2xl text-accent-strong">{card.shipCode}</span>
                      <span className="text-sm bg-hairline-soft text-muted px-2 py-1 rounded font-mono">Group: {card.group}</span>
                    </div>
                    <p className="text-muted text-sm mt-1">Customer Code: <span className="font-mono font-semibold text-header">{card.customerCode}</span></p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => openEdit(card)}
                      className="flex items-center space-x-1 px-3 py-2 bg-hairline-soft hover:bg-hairline rounded text-sm">
                      <Edit className="w-4 h-4" /><span>Edit</span>
                    </button>
                    <button onClick={() => deleteCard(card.shipCode)}
                      className="flex items-center space-x-1 px-3 py-2 bg-danger-tint hover:bg-danger-tint text-danger rounded text-sm">
                      <Trash2 className="w-4 h-4" /><span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Address + contact */}
                <div className="grid grid-cols-2 gap-6 px-6 py-5">
                  <div>
                    <p className="text-xs font-semibold text-faint uppercase mb-3">Ship-To Address</p>
                    <div className="space-y-1">
                      {card.companyName && <p className="font-semibold text-fg">{card.companyName}</p>}
                      {card.address1 && <p className="text-sm text-muted">{card.address1}</p>}
                      {card.address2 && <p className="text-sm text-muted">{card.address2}</p>}
                      {(card.suburb || card.state || card.postcode) && (
                        <p className="text-sm text-muted">
                          {[card.suburb, card.state, card.postcode].filter(Boolean).join('  ')}
                        </p>
                      )}
                      {card.country && card.country !== 'AU' && <p className="text-sm text-muted">{card.country}</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-faint uppercase mb-3">Contact</p>
                    <div className="space-y-2">
                      {card.contactName && <p className="text-sm text-header flex items-center"><User className="w-4 h-4 mr-2 text-faint" />{card.contactName}</p>}
                      {card.phone && <p className="text-sm text-header flex items-center"><Phone className="w-4 h-4 mr-2 text-faint" />{card.phone}</p>}
                      {card.email && <p className="text-sm text-header flex items-center"><Mail className="w-4 h-4 mr-2 text-faint" />{card.email}</p>}
                    </div>
                    {card.notes && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-faint uppercase mb-1">Notes</p>
                        <p className="text-sm text-muted bg-panel-alt rounded p-2">{card.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Related jobs */}
                <div className="px-6 pb-5 border-t pt-4">
                  <p className="text-xs font-semibold text-faint uppercase mb-3">Jobs shipping to {card.shipCode} ({relatedJobs.length})</p>
                  {relatedJobs.length === 0 ? (
                    <p className="text-sm text-faint">No jobs found for this ship code.</p>
                  ) : (
                    <div className="divide-y rounded border overflow-hidden">
                      {relatedJobs.slice(0, 10).map(j => (
                        <button key={j.id} onClick={() => { pinJob(j); setActiveModule('jobs'); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-accent-tint flex items-center justify-between">
                          <div>
                            <span className="font-mono text-accent-strong font-semibold text-sm">#{j.id}</span>
                            <span className="ml-3 text-sm text-muted">{j.customer}</span>
                            {j.invoice && <span className="ml-2 text-xs text-faint">Inv: {j.invoice}</span>}
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-muted">{j.due}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              { QUOTE:'bg-hairline-soft text-header', New:'bg-warn-tint text-warn', 'Pick/Pack':'bg-accent-tint text-accent-strong', FINISH:'bg-ok-tint text-ok', INVOICE:'bg-accent-tint text-accent-strong', PAID:'bg-ok-tint text-ok', CANCEL:'bg-danger-tint text-danger' }[j.status] || 'bg-hairline-soft text-muted'
                            }`}>{j.status}</span>
                          </div>
                        </button>
                      ))}
                      {relatedJobs.length > 10 && (
                        <div className="px-4 py-2 text-xs text-faint text-center">+{relatedJobs.length - 10} more — use job filter to see all</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create / Edit Modal */}
        {cardFileModal.open && (
          <CardFileFormModal
            cardFileForm={cardFileForm}
            cardFileModal={cardFileModal}
            saveCard={saveCard}
            setCardFileForm={setCardFileForm}
            setCardFileModal={setCardFileModal}
          />
        )}
      </>
    );
  };

  // Import Data Module

  // Scheduling Module
  const renderScheduling = () => (
    <SchedulingModule
      jobs={jobs}
      onPinJob={(job) => { pinJob(job); setActiveModule('jobs'); }}
      onUpdateJobDue={updateJobDue}
      currentUser={currentUser}
    />
  );

  // ── Open Freight Modal ────────────────────────────────────────────────────
  const renderOpenFreightModal = () => {
    if (!ofModalOpen) return null;

    const PARCEL_TYPES = ['Satchel', 'Box', 'Envelope', 'Pallet', 'Bag', 'Tube', 'Other'];
    const SERVICES = ['Standard', 'Express', 'Overnight', 'Same Day', 'Economy'];
    const TYPE_COLORS = {
      Satchel: 'bg-accent-tint text-accent-strong',
      Box: 'bg-accent-tint text-accent-strong',
      Envelope: 'bg-warn-tint text-warn',
      Pallet: 'bg-hairline-soft text-header',
      Bag: 'bg-ok-tint text-ok',
      Tube: 'bg-emphasis-tint text-emphasis',
      Other: 'bg-hairline-soft text-muted',
    };

    const openAddParcel = () => {
      setOfParcelForm({ name: '', parcelType: 'Satchel', service: 'Standard', carrierCode: '', maxWeightKg: '', lengthCm: '', widthCm: '', heightCm: '', rate: '', notes: '' });
      setOfParcelModal({ open: true, editing: null });
    };

    const openEditParcel = (p) => {
      setOfParcelForm({
        name: p.name, parcelType: p.parcelType, service: p.service,
        carrierCode: p.carrierCode, maxWeightKg: p.maxWeightKg || '',
        lengthCm: p.lengthCm || '', widthCm: p.widthCm || '',
        heightCm: p.heightCm || '', rate: p.rate || '', notes: p.notes,
      });
      setOfParcelModal({ open: true, editing: p.id });
    };

    const saveParcel = async () => {
      try {
        const data = {
          ...ofParcelForm,
          maxWeightKg: ofParcelForm.maxWeightKg ? parseFloat(ofParcelForm.maxWeightKg) : null,
          lengthCm: ofParcelForm.lengthCm ? parseFloat(ofParcelForm.lengthCm) : null,
          widthCm: ofParcelForm.widthCm ? parseFloat(ofParcelForm.widthCm) : null,
          heightCm: ofParcelForm.heightCm ? parseFloat(ofParcelForm.heightCm) : null,
          rate: ofParcelForm.rate ? parseFloat(ofParcelForm.rate) : null,
        };
        if (ofParcelModal.editing) {
          await api.openFreight.updateParcel(ofParcelModal.editing, data);
        } else {
          await api.openFreight.createParcel(data);
        }
        queryClient.invalidateQueries({ queryKey: ['ofParcels'] });
        setOfParcelModal({ open: false, editing: null });
      } catch (e) { alert(e.message); }
    };

    const deleteParcel = async (id, name) => {
      if (!window.confirm(`Delete parcel type "${name}"?`)) return;
      try {
        await api.openFreight.deleteParcel(id);
        queryClient.invalidateQueries({ queryKey: ['ofParcels'] });
      } catch (e) { alert(e.message); }
    };

    const saveAccount = async () => {
      try {
        const saved = await api.openFreight.saveAccount(ofAccount);
        setOfAccount(saved);
        setOfAccountDirty(false);
      } catch (e) { alert(e.message); }
    };

    return (
      <>
        {/* Main Open Freight modal */}
        <DraggableModal onClose={() => setOfModalOpen(false)} cardClass="w-full max-w-3xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 rounded-t-xl"
              style={{ background: T.chrome, borderBottom: `1px solid ${T.chromeRaised}` }}>
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <Truck className="w-5 h-5" style={{ color: T.accent }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: T.chromeText }}>Open Freight</h2>
                  <p className="text-xs" style={{ color: T.chromeTextMuted }}>Carrier account &amp; parcel types</p>
                </div>
              </div>
              <button onClick={() => setOfModalOpen(false)} className="p-1.5 rounded-lg transition-colors"
                style={{ color: T.chromeTextMuted }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-6" style={{ borderBottom: `1px solid ${T.hairline}`, background: T.hairlineSoft }}>
              {[
                { id: 'parcels', label: 'Parcel Types', icon: Box },
                { id: 'account', label: 'Account', icon: Settings },
              ].map(tab => {
                const Icon = tab.icon;
                const active = ofTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setOfTab(tab.id)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
                    style={{
                      borderBottomColor: active ? T.accentStrong : 'transparent',
                      color: active ? T.accentStrong : T.textMuted,
                    }}>
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.id === 'parcels' && ofParcels.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: T.accentTint, color: T.accentStrong }}>
                        {ofParcels.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── PARCEL TYPES TAB ─────────────────────────────────────── */}
              {ofTab === 'parcels' && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm" style={{ color: T.textMuted }}>Configure the parcel types you use with Open Freight. These can be selected when booking a shipment.</p>
                    </div>
                    <button onClick={openAddParcel}
                      className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                      style={{ background: T.accentStrong, color: '#fff' }}>
                      <Plus className="w-4 h-4" />
                      <span>Add Parcel Type</span>
                    </button>
                  </div>

                  {ofParcels.length === 0 ? (
                    <div className="text-center py-16" style={{ color: T.textFaint }}>
                      <Box className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium" style={{ color: T.textMuted }}>No parcel types yet</p>
                      <p className="text-sm mt-1">Click <strong>+ Add Parcel Type</strong> to create your first one</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {ofParcels.map(p => (
                        <div key={p.id} className="rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                          style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate" style={{ color: T.text }}>{p.name}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                {p.parcelType && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[p.parcelType] || 'bg-hairline-soft text-muted'}`}>
                                    {p.parcelType}
                                  </span>
                                )}
                                {p.service && (
                                  <span className="text-xs px-2 py-0.5 rounded-full"
                                    style={{ color: T.textMuted, background: T.hairlineSoft }}>{p.service}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex space-x-1 ml-2 flex-shrink-0">
                              <button onClick={() => openEditParcel(p)}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: T.textMuted }}>
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteParcel(p.id, p.name)}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: T.textMuted }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mt-3 text-xs" style={{ color: T.textMuted }}>
                            {p.maxWeightKg > 0 && (
                              <div className="flex items-center space-x-1">
                                <Weight className="w-3 h-3" style={{ color: T.textFaint }} />
                                <span>Max {p.maxWeightKg} kg</span>
                              </div>
                            )}
                            {(p.lengthCm > 0 || p.widthCm > 0 || p.heightCm > 0) && (
                              <div className="flex items-center space-x-1 col-span-2">
                                <Ruler className="w-3 h-3" style={{ color: T.textFaint }} />
                                <span>
                                  {[p.lengthCm, p.widthCm, p.heightCm].filter(Boolean).join(' × ')} cm
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2"
                            style={{ borderTop: `1px solid ${T.hairline}` }}>
                            {p.carrierCode && (
                              <span className="text-xs font-mono px-2 py-0.5 rounded"
                                style={{ color: T.textMuted, background: T.hairlineSoft }}>
                                {p.carrierCode}
                              </span>
                            )}
                            {p.rate > 0 && (
                              <span className="ml-auto text-sm font-bold" style={{ color: T.accentStrong }}>
                                ${Number(p.rate).toFixed(2)}
                              </span>
                            )}
                          </div>
                          {p.notes && <p className="text-xs mt-2 italic" style={{ color: T.textFaint }}>{p.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ACCOUNT TAB ──────────────────────────────────────────── */}
              {ofTab === 'account' && (
                <div className="p-6 space-y-5">
                  <p className="text-sm" style={{ color: T.textMuted }}>Store your Open Freight account credentials and depot details here for quick reference when booking shipments.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Account Number</label>
                      <input type="text" value={ofAccount.accountNumber}
                        onChange={e => { setOfAccount(a => ({ ...a, accountNumber: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="e.g. OF-12345" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Account Name</label>
                      <input type="text" value={ofAccount.accountName}
                        onChange={e => { setOfAccount(a => ({ ...a, accountName: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="Total Image" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Depot / Branch</label>
                      <input type="text" value={ofAccount.depot}
                        onChange={e => { setOfAccount(a => ({ ...a, depot: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="e.g. Sydney West" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Contact Name</label>
                      <input type="text" value={ofAccount.contactName}
                        onChange={e => { setOfAccount(a => ({ ...a, contactName: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Contact Phone</label>
                      <input type="text" value={ofAccount.contactPhone}
                        onChange={e => { setOfAccount(a => ({ ...a, contactPhone: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Contact Email</label>
                      <input type="email" value={ofAccount.contactEmail}
                        onChange={e => { setOfAccount(a => ({ ...a, contactEmail: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>
                      API Key / Login
                      <span className="ml-1 text-xs font-normal" style={{ color: T.textFaint }}>(optional)</span>
                    </label>
                    <input type="password" value={ofAccount.apiKey}
                      onChange={e => { setOfAccount(a => ({ ...a, apiKey: e.target.value })); setOfAccountDirty(true); }}
                      className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                      style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                      placeholder={ofAccount.apiKeySet ? '(configured — leave blank to keep)' : 'API key or login credentials'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Notes</label>
                    <textarea rows={3} value={ofAccount.notes}
                      onChange={e => { setOfAccount(a => ({ ...a, notes: e.target.value })); setOfAccountDirty(true); }}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                      placeholder="Any additional account notes…" />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={saveAccount} disabled={!ofAccountDirty}
                      className="flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={ofAccountDirty
                        ? { background: T.accentStrong, color: '#fff' }
                        : { background: T.hairlineSoft, color: T.textFaint, cursor: 'not-allowed' }}>
                      <Save className="w-4 h-4" />
                      <span>{ofAccountDirty ? 'Save Account' : 'Saved'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
        </DraggableModal>

        {/* ── Add / Edit Parcel Type sub-modal ─────────────────────────── */}
        {ofParcelModal.open && (
          <DraggableModal onClose={() => setOfParcelModal({ open: false, editing: null })} cardClass="w-full max-w-lg max-h-[90vh] overflow-y-auto" overlayClass="z-[60]">
              <div className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: `1px solid ${T.hairline}` }}>
                <h3 className="font-bold" style={{ color: T.text }}>
                  {ofParcelModal.editing ? 'Edit Parcel Type' : 'New Parcel Type'}
                </h3>
                <button onClick={() => setOfParcelModal({ open: false, editing: null })}>
                  <X className="w-5 h-5" style={{ color: T.textMuted }} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>
                    Name <span style={{ color: T.danger }}>*</span>
                  </label>
                  <input type="text" value={ofParcelForm.name}
                    onChange={e => setOfParcelForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                    placeholder="e.g. Standard Satchel 500g" autoFocus />
                </div>

                {/* Type + Service */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Parcel Type</label>
                    <div className="flex flex-wrap gap-2">
                      {PARCEL_TYPES.map(t => (
                        <button key={t} type="button"
                          onClick={() => setOfParcelForm(f => ({ ...f, parcelType: t }))}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            ofParcelForm.parcelType === t
                              ? (TYPE_COLORS[t] || 'bg-hairline text-header') + ' border-current'
                              : ''
                          }`}
                          style={ofParcelForm.parcelType === t ? {} : {
                            background: T.panel, color: T.textMuted,
                            border: `1px solid ${T.hairline}`,
                          }}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Service Level</label>
                    <select value={ofParcelForm.service}
                      onChange={e => setOfParcelForm(f => ({ ...f, service: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ border: `1px solid ${T.hairline}`, color: T.text }}>
                      {SERVICES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Weight + Dimensions */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: T.text }}>Size &amp; Weight</label>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: T.textMuted }}>Max Weight (kg)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.maxWeightKg}
                        onChange={e => setOfParcelForm(f => ({ ...f, maxWeightKg: e.target.value }))}
                        className="w-full rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="0.5" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: T.textMuted }}>Length (cm)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.lengthCm}
                        onChange={e => setOfParcelForm(f => ({ ...f, lengthCm: e.target.value }))}
                        className="w-full rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="30" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: T.textMuted }}>Width (cm)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.widthCm}
                        onChange={e => setOfParcelForm(f => ({ ...f, widthCm: e.target.value }))}
                        className="w-full rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="20" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: T.textMuted }}>Height (cm)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.heightCm}
                        onChange={e => setOfParcelForm(f => ({ ...f, heightCm: e.target.value }))}
                        className="w-full rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="10" />
                    </div>
                  </div>
                </div>

                {/* Carrier code + Rate */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>
                      Carrier Code
                      <span className="ml-1 text-xs font-normal" style={{ color: T.textFaint }}>(for labels)</span>
                    </label>
                    <input type="text" value={ofParcelForm.carrierCode}
                      onChange={e => setOfParcelForm(f => ({ ...f, carrierCode: e.target.value.toUpperCase() }))}
                      className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                      style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                      placeholder="e.g. SAT500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Rate ($ per parcel)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-sm" style={{ color: T.textMuted }}>$</span>
                      <input type="number" step="0.01" min="0" value={ofParcelForm.rate}
                        onChange={e => setOfParcelForm(f => ({ ...f, rate: e.target.value }))}
                        className="w-full rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none"
                        style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                        placeholder="0.00" />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: T.text }}>Notes</label>
                  <input type="text" value={ofParcelForm.notes}
                    onChange={e => setOfParcelForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ border: `1px solid ${T.hairline}`, color: T.text }}
                    placeholder="Any special handling notes…" />
                </div>
              </div>

              <div className="flex justify-end space-x-3 px-6 py-4 rounded-b-xl"
                style={{ borderTop: `1px solid ${T.hairline}`, background: T.hairlineSoft }}>
                <button onClick={() => setOfParcelModal({ open: false, editing: null })}
                  className="px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
                <button onClick={saveParcel} disabled={!ofParcelForm.name.trim()}
                  className="flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={ofParcelForm.name.trim()
                    ? { background: T.accentStrong, color: '#fff' }
                    : { background: T.hairline, color: T.textFaint, cursor: 'not-allowed' }}>
                  <Save className="w-4 h-4" />
                  <span>{ofParcelModal.editing ? 'Save Changes' : 'Add Parcel Type'}</span>
                </button>
              </div>
          </DraggableModal>
        )}
      </>
    );
  };

  // Document Print Modal (Picking Slip, Delivery Note, Job Sheet)

  return (
    <AppShell
      activeModule={activeModule}
      onNavigate={setActiveModule}
      adminMode={adminMode}
      onAdminToggle={() => setAdminMode(v => !v)}
      currentUser={currentUser}
      badges={{
        jobCount: (jobs ?? []).filter(j => !['PAID','CANCEL'].includes(j.status)).length,
        quoteCount: (jobs ?? []).filter(j => j.status === 'QUOTE').length,
      }}
      onNewJob={() => openModal('job')}
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      notifCount={(jobs ?? []).filter(j => !['PAID','CANCEL'].includes(j.status) && j.due && parseD(j.due) < new Date()).length}
      jobs={jobs ?? []}
      pinnedJobs={pinnedJobs}
      onOpenJob={pinJob}
      onUnpinJob={unpinJob}
      onSelectList={(listId) => {
        clearFilters();
        if (listId === 'mine') setFilterQuick('myJobs');
        else if (listId === 'due-today') setFilterQuick('dueToday');
        else if (listId === 'overdue') setFilterQuick('overdue');
        else if (listId === 'pickpack') setFilterStatus('Pick/Pack');
        setShowJobDetail(false);
        setActiveModule('jobs');
      }}
      savedLists={listsForNode('jobs').map(l => ({ id: l.id, name: l.name, jobs: l.filter ? (jobs ?? []).filter(j => matchJobList(j, l.filter)) : [] }))}
      onRunList={(listId) => {
        const l = savedJobLists.find(x => x.id === listId);
        if (l) { setActiveJobList({ ...l.filter, name: l.name }); setShowJobDetail(false); setActiveModule('jobs'); }
      }}
      onDeleteList={deleteJobList}
      savedStockLists={listsForNode('stock').map(l => ({ id: l.id, name: l.name, items: l.filter ? (inventory ?? []).filter(i => matchStockList(i, l.filter)) : [] }))}
      onRunStockList={(listId) => {
        const l = savedJobLists.find(x => x.id === listId);
        if (l) { setStockListModal({ open: true, draft: { ...(l.filter || EMPTY_STOCK_LIST) }, editingId: l.id }); setActiveModule('inventory'); }
      }}
      onDeleteStockList={deleteJobList}
      onOpenStock={(sku) => { setStockFocusSku(sku); setActiveModule('inventory'); }}
      savedQuoteLists={listsForNode('quotes').map(l => ({ id: l.id, name: l.name, jobs: l.filter ? (jobs ?? []).filter(j => j.status === 'QUOTE' && matchJobList(j, l.filter)) : [] }))}
      onRunQuoteList={(listId) => {
        const l = savedJobLists.find(x => x.id === listId);
        if (l) { setActiveJobList({ ...(l.filter || {}), name: l.name }); setShowJobDetail(false); setActiveModule('quotes'); }
      }}
      onDeleteQuoteList={deleteJobList}
      savedPOLists={listsForNode('purchases').map(l => ({ id: l.id, name: l.name, pos: l.filter ? (purchaseOrders ?? []).filter(p => matchPOList(p, l.filter)) : [] }))}
      onRunPOList={(listId) => {
        const l = savedJobLists.find(x => x.id === listId);
        if (l) { setPoListModal({ open: true, draft: { ...(l.filter || EMPTY_PO_LIST) }, editingId: l.id }); setActiveModule('purchase-orders'); }
      }}
      onDeletePOList={deleteJobList}
      onOpenPO={(poId) => { const po = (purchaseOrders ?? []).find(p => p.id === poId); if (po) { setSelectedPO(po); } setActiveModule('purchase-orders'); }}
    >

      {/* ── Contextual Action Toolbar ── */}
      <div className="shrink-0 bg-white border-b border-hairline overflow-x-auto">
        <div className="flex items-center h-11 px-3 gap-0.5">

          {/* ── JOBS ribbon (also used by Quotes) ── */}
          {(activeModule === 'jobs' || activeModule === 'quotes') && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => openModal('job')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Add Job</span>
              </button>
              <button onClick={() => { if (activeJob) { setShowJobDetail(true); setActiveModule('jobs'); } }} disabled={!activeJob} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Eye className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">View Job</span>
              </button>
              <button onClick={() => createEmptyJobList(activeModule === 'quotes' ? 'quotes' : 'jobs')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <ClipboardList className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Create List</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Truck className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Return</span>
              </button>
              <button onClick={() => setSalesRegModal(m => ({ ...m, open: true, data: null, error: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <DollarSign className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Sales Reg.</span>
              </button>
              <button onClick={() => { setShowJobDetail(false); setDispatchListOpen(true); }} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Box className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Dispatch</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && setPaymentModal({ show: true, jobId: activeJob.id, maxAmount: activeJob.totalInc || 0, amount: '', method: 'Credit Card' })} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <CreditCard className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Payment</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Download className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Import Jobs</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button
                disabled={!activeJob || !['INVOICE','PAID'].includes(activeJob?.status)}
                onClick={() => activeJob && setUnprintModal({ open: true, job: activeJob, loading: false, error: '' })}
                title={!activeJob ? 'Open a job first' : !['INVOICE','PAID'].includes(activeJob?.status) ? `Only available on INVOICE or PAID jobs (current: ${activeJob?.status})` : 'Revert this job from invoiced back to FINISH'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40"
              >
                <Printer className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Unprint</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && openInvoiceDoc(activeJob)} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <FileText className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Invoice Job</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled={!activeJob} onClick={() => activeJob && openModal('job', activeJob)} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Edit className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Edit</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && cloneJob(activeJob)} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Copy className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Clone</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Send className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Reply</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Forward</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && setDocumentPrint({ type: 'jobSheet', job: activeJob })} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Eye className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Preview</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled={!activeJob} onClick={() => activeJob && setDocumentPrint({ type: 'jobSheet', job: activeJob })} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Printer className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Print</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email</span>
              </button>
              <button onClick={() => { const filtered = jobs.filter(j => filterStatus === 'all' || j.status === filterStatus); exportToCSV(filtered.map(j => ({ ID: j.id, Customer: j.customer, Status: j.status, DateIn: j.dateIn, Due: j.due, Invoice: j.invoice || '', Total: j.total, Balance: j.balanceDue, Priority: j.priority })), 'jobs'); }} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <FileSpreadsheet className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Excel</span>
              </button>
              <div className="relative">
                <button
                  disabled={!activeJob}
                  onClick={() => setReportDropdownOpen(o => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40"
                  title={activeJob ? 'Print a report for this job' : 'Open a job first'}
                >
                  <BarChart3 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Report ▾</span>
                </button>
                {reportDropdownOpen && activeJob && (
                  <div
                    className="absolute left-0 top-full z-[9999] bg-white border border-hairline shadow-2xl min-w-[230px] py-1 text-[13px] rounded-lg"
                    onMouseLeave={() => setReportDropdownOpen(false)}
                    onClick={() => setReportDropdownOpen(false)}
                  >
                    {[
                      { type: 'jobSheet',     label: 'TIG Job Sheet',                       action: () => setDocumentPrint({ type: 'jobSheet',     job: activeJob }) },
                      { type: 'pickingSlip',  label: 'TIG Picking Slip',                    action: () => setDocumentPrint({ type: 'pickingSlip',  job: activeJob }) },
                      { type: 'deliveryNote', label: 'TIG Delivery Note',                   action: () => setDocumentPrint({ type: 'deliveryNote', job: activeJob }) },
                      { type: 'shipLabel',    label: 'Job Label',                           action: () => setDocumentPrint({ type: 'shipLabel',    job: activeJob }) },
                      { type: 'shipLabel',    label: 'Ship Label – Total Image',            action: () => setDocumentPrint({ type: 'shipLabel',    job: activeJob }) },
                      { type: 'deliveryNote', label: 'TIG Delivery Note – NZ',              action: () => setDocumentPrint({ type: 'deliveryNote', job: activeJob }) },
                      null,
                      { type: 'invoice',      label: 'TIG TAX Proforma Invoice',            action: () => openInvoiceDoc(activeJob, 'proforma') },
                      { type: 'invoice',      label: 'TIG TAX Proforma Invoice Balance ONLY', action: () => openInvoiceDoc(activeJob, 'proformaBalance') },
                      null,
                      // These two used to download a ReportLab PDF built from a
                      // second, independent layout. Now that the job sheet and the
                      // picking list are templates, that PDF disagreed with the one
                      // this same menu prints — two ways to get one document,
                      // producing different paper. They open the template preview,
                      // which prints to PDF itself. The invoice below stays on
                      // ReportLab: invoices were not converted, so it has no second
                      // version to disagree with.
                      { type: 'jobSheet',    label: 'Job Sheet (print / PDF)',    action: () => setDocumentPrint({ type: 'jobSheet',    job: activeJob }) },
                      { type: 'pickingSlip', label: 'Picking List (print / PDF)', action: () => setDocumentPrint({ type: 'pickingSlip', job: activeJob }) },
                      { type: 'pdf-invoice',      label: 'Download Invoice (PDF)',      action: () => window.open(`/api/jobs/${activeJob?.id}/pdf?type=${activeJob?.status === 'QUOTE' ? 'quote' : 'invoice'}`, '_blank') },
                    ].map((r, i) =>
                      r === null
                        ? <div key={i} className="border-t border-hairline my-0.5" />
                        : (
                          <button
                            key={i}
                            disabled={r.disabled}
                            onClick={r.action}
                            className={`w-full text-left px-4 py-1.5 flex items-center gap-2.5 ${r.disabled ? 'text-faint cursor-default' : 'hover:bg-accent-strong hover:text-white text-header'}`}
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />{r.label}
                          </button>
                        )
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                disabled={!activeJob}
                title={activeJob ? 'View job notes & internal comments' : 'Open a job first'}
                onClick={() => { if (activeJob) { pinJob(activeJob); setShowJobDetail(true); } }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40"
              >
                <BookOpen className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── PURCHASES ribbon ── */}
          {activeModule === 'purchase-orders' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => openModal('po')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Add Purchase</span>
              </button>
              <button disabled={!selectedPO} onClick={() => selectedPO && openModal('po', selectedPO)} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Edit className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">View/Edit</span>
              </button>
              <button onClick={() => createEmptyPOList()} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <ClipboardList className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Create List</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Truck className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Return to Vendor</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Printer className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Unprint</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">PO Other</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Box className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Pick/Pack</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email Actions</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Job Reports</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── CARDFILES ribbon ── */}
          {activeModule === 'card-files' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => setCardFileModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Add CardFile</span>
              </button>
              <button disabled={!selectedCardFile} onClick={() => selectedCardFile && setCardFileModal({ open: true, editing: selectedCardFile })} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors disabled:opacity-40">
                <Edit className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">View/Edit</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <ClipboardList className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Create List</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Clock className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Time Sheets</span>
              </button>
              <button onClick={() => setCardFileModal({ open: true, editing: null })} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <User className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Quick Add</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Merge</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Users className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Reassign</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <CreditCard className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Payment</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">CF Other</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Printer className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Print</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <FileSpreadsheet className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Excel</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Report ▾</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── ITEMS (order-requirements) ribbon ── */}
          {activeModule === 'order-requirements' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => openModal('inventory')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Add Item</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Edit className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">View/Edit Item</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <ClipboardList className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Create Item List</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── STOCK (inventory) ribbon ── */}
          {activeModule === 'inventory' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => openModal('inventory')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Add Stock</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Edit className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">View/Edit Stock</span>
              </button>
              <button onClick={() => createEmptyStockList()} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <ClipboardList className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Create List</span>
              </button>
              <button onClick={() => setTransferModal(m => ({ ...m, open: true, fromSku: '', toSku: '', toLocation: '', quantity: 1, reference: '', notes: '', error: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <RefreshCw className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Transfer Stock</span>
              </button>
              <button onClick={() => setStockAdjustModal(m => ({ ...m, show: true }))} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Stock Adjustments</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <ShoppingCart className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Procurement</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Package className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Packaging</span>
              </button>
              <button onClick={() => setActiveModule('warehouse')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Warehouse className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Warehouse Mgmt</span>
              </button>
              <button onClick={() => setStocktakeModal(m => ({ ...m, open: true, method: 'Informed', reference: '', items: inventory.map(i => ({ sku: i.sku, name: i.name, currentStock: i.stock, countedQty: i.stock, notes: '' })), results: null, error: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <CheckSquare className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Stocktake</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Tag className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Promo Pricing</span>
              </button>
              <button onClick={() => { setStockFlowModal({ open: true, loading: true, data: null, search: '' }); api.inventory.stockFlow().then(d => setStockFlowModal(m => ({ ...m, loading: false, data: d }))).catch(e => setStockFlowModal(m => ({ ...m, loading: false, data: [] }))); }} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <TrendingUp className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Stock Flow</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Stock Other</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Printer className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Unprint</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Box className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Pick/Pack</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email Actions</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <div className="relative">
                <button onClick={() => setStockReportOpen(o => !o)} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                  <BarChart3 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Report ▾</span>
                </button>
                {stockReportOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-2xl z-30 w-64 py-1.5 overflow-hidden" onMouseLeave={() => setStockReportOpen(false)}>
                    {(() => {
                      const inv = inventory || [];
                      const csvSafe = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
                      const rows = (arr) => arr.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)])));
                      const reports = [
                        {
                          label: 'Stock List',
                          run: () => exportToCSV(rows(inv.map(i => ({ code: i.sku, description: i.name, category: i.category, supplier: i.supplier, on_hand: i.stock, committed: i.committed_qty, available: Math.max(0, (i.stock || 0) - (i.committed_qty || 0)), on_po: i.on_order_qty, cost: i.unitCost, sell: i.unitPrice }))), 'stock-list'),
                        },
                        {
                          label: 'Stock List — with GL Groups',
                          run: () => exportToCSV(rows(inv.map(i => ({ code: i.sku, description: i.name, gl_group: i.gl_group || '', item_type: i.item_type, location: i.location, on_hand: i.stock, cost: i.unitCost, sell: i.unitPrice }))), 'stock-list-gl-groups'),
                        },
                        {
                          label: 'Stock Valuation',
                          run: () => exportToCSV(rows(inv.map(i => ({ code: i.sku, description: i.name, on_hand: i.stock, unit_cost: i.unitCost, value: ((i.stock || 0) * (i.unitCost || 0)).toFixed(2) }))), 'stock-valuation'),
                        },
                        {
                          label: 'Low Stock / Reorder',
                          run: () => exportToCSV(rows(inv.filter(i => (i.stock || 0) <= (i.min_stock ?? i.reorderLevel ?? 0)).map(i => ({ code: i.sku, description: i.name, on_hand: i.stock, min_stock: i.min_stock ?? i.reorderLevel ?? 0, on_po: i.on_order_qty, supplier: i.supplier }))), 'low-stock-reorder'),
                        },
                        {
                          label: 'Stock List — 12 Month Sales',
                          run: () => {
                            const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
                            const sold = {};
                            (jobs || []).forEach(j => {
                              if (['QUOTE', 'CANCEL'].includes(j.status)) return;
                              const d = parseD(j.dateIn); if (!d || d < cutoff) return;
                              (j.items || []).forEach(it => { if (it.stockCode) sold[it.stockCode] = (sold[it.stockCode] || 0) + (it.supply || it.qty || 0); });
                            });
                            exportToCSV(rows(inv.map(i => ({ code: i.sku, description: i.name, sold_12m: sold[i.sku] || 0, on_hand: i.stock, on_po: i.on_order_qty }))), 'stock-12-month-sales');
                          },
                        },
                      ];
                      return reports.map(r => (
                        <button key={r.label} onClick={() => { if (!inv.length) { notify('No stock data loaded yet.', { type: 'error' }); return; } r.run(); setStockReportOpen(false); notify(`Exported ${r.label} (CSV)`, { type: 'success' }); }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-panel-alt flex items-center gap-2">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-faint" />{r.label}
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── ACCOUNTS ribbon ── */}
          {activeModule === 'accounts' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <DollarSign className="w-5 h-5 text-accent-strong" /><span className="text-[9px] text-accent-strong whitespace-nowrap font-semibold">AP Bills</span>
              </button>
              {[['Users','Debtors (AR)'],['BarChart3','GST/BAS']].map(([, lbl]) => (
                <button disabled key={lbl} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                  <DollarSign className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
          </>)}

          {/* ── MANAGEMENT (reports) ribbon ── */}
          {activeModule === 'reports' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => setActiveModule('reports')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <BarChart3 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Reports</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <PieChart className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Business Analysis</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <DollarSign className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Budgets</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <TrendingUp className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Cash Flow</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <TrendingUp className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Commission Rates</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Management</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── DASHBOARD ribbon ── */}
          {activeModule === 'dashboard' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => setActiveModule('dashboard')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <LayoutGrid className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Mgmt Dashboard</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <User className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Security</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <LayoutGrid className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Dashboard Board</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Edit className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Edit</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Trash2 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Delete</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <LayoutGrid className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Select Layout</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Combine Layout</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Add Widget</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Manage Widget</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <LayoutGrid className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Widgets</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── SCHEDULING ribbon ── */}
          {activeModule === 'scheduling' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              {['Schedule','Task','Day','Work Week','Week','Month','Year','Timeline','Current Job','Scheduler View'].map(lbl => (
                <button disabled key={lbl} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                  <Calendar className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Group By</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Search className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Filters</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Users className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Resources</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Manage Views</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Eye className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Views</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
            </div>
          </>)}

          {/* ── EMAIL ribbon ── */}
          {activeModule === 'email' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              {['Create List','Email Rules','Templates','Editor','Archive','Email Security','Send/Receive','Delete','Unread/Read','Move'].map(lbl => (
                <button disabled key={lbl} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                  <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email Other</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Send className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Email Actions</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── eBUSINESS ribbon ── */}
          {activeModule === 'ebusiness' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Package className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Vendor Stock Feeds</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Download className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Import Vendor Prices</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Users className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Customer Feeds</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <ExternalLink className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">eBusiness Trans.</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── DOCUMENTS ribbon ── */}
          {activeModule === 'documents' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              {['Add Document','View/Edit','Create List','Open','Save Properties','Delete','Actions','Checkout','Cancel Checkout','Large Icons','Show Hidden','List Layout'].map(lbl => (
                <button disabled key={lbl} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                  <FileText className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── TOOLS (import) ribbon ── */}
          {activeModule === 'import' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Options</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Setup</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <AlertCircle className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Status</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <AlertCircle className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Watchouts</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <DollarSign className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Currency Rates</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Users className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Groups</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <User className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Security</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Clock className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">History</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <ExternalLink className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Integration Config</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Scripting Engine</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Report Designer</span>
              </button>
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Download className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Import Data</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Tools</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Tools Other</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <CreditCard className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Tools Accounts</span>
              </button>
            </div>
          </>)}

          {/* ── SETTINGS ribbon ── */}
          {activeModule === 'settings' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              {['Company','Bank & Payments','SMTP'].map(lbl => (
                <button key={lbl} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                  <Settings className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
          </>)}

          {/* ── USER MANAGEMENT ribbon ── */}
          {activeModule === 'user-management' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => {}} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Users className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Users</span>
              </button>
            </div>
          </>)}

          {/* ── CUSTOMERS ribbon (hidden tab, accessible via nav) ── */}
          {activeModule === 'customers' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => openModal('customer')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New Customer</span>
              </button>
            </div>
          </>)}

          {/* ── SUPPLIERS ribbon ── */}
          {activeModule === 'suppliers' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => openModal('supplier')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Plus className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">New Supplier</span>
              </button>
            </div>
          </>)}

          {/* ── WAREHOUSE ribbon ── */}
          {activeModule === 'warehouse' && (<>
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-hairline">
              <button onClick={() => setActiveModule('inventory')} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-hairline-soft rounded-md text-header text-[13px] font-medium transition-colors">
                <Package className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Stock Items</span>
              </button>
              <button disabled className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-faint text-[13px] font-medium opacity-40 cursor-default">
                <Warehouse className="w-5 h-5 text-muted" /><span className="whitespace-nowrap">Bin Map</span>
              </button>
            </div>
          </>)}

        </div>
      </div>

      {/* ── Live KPI Bar ── */}
      <div className="shrink-0 bg-white border-b border-hairline-soft flex items-center h-8 select-none overflow-x-auto shadow-sm">
        {[
          { label: 'Overdue',    count: dashboardStats.overdueJobs.length, urgent: dashboardStats.overdueJobs.length > 0, icon: AlertCircle, iconColor: 'text-danger',    bg: 'hover:bg-danger-tint',    text: 'text-danger',    border: 'border-danger',    action: () => { setActiveModule('jobs'); setFilterStatus('all'); setSearchTerm(''); } },
          { label: 'Due Today',  count: dashboardStats.dueToday.length,    urgent: dashboardStats.dueToday.length > 0,    icon: Clock,       iconColor: 'text-accent', bg: 'hover:bg-accent-tint', text: 'text-accent-strong', border: 'border-accent', action: () => { setActiveModule('jobs'); } },
          { label: 'To Invoice', count: dashboardStats.toInvoice,          urgent: dashboardStats.toInvoice > 0,          icon: FileText,    iconColor: 'text-emphasis', bg: 'hover:bg-emphasis-tint', text: 'text-emphasis', border: 'border-emphasis', action: () => { setActiveModule('jobs'); setFilterStatus('FINISH'); } },
          { label: 'Low Stock',  count: dashboardStats.lowStock,           urgent: dashboardStats.lowStock > 0,           icon: Package,     iconColor: 'text-warn',  bg: 'hover:bg-warn-tint',  text: 'text-warn',  border: 'border-warn',  action: () => setActiveModule('inventory') },
          { label: 'In Prod.',   count: dashboardStats.inProduction,       urgent: false,                                 icon: Layers,      iconColor: 'text-accent',   bg: 'hover:bg-accent-tint',   text: 'text-accent-strong',   border: 'border-accent',   action: () => setActiveModule('jobs') },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} onClick={item.action}
              className={`flex items-center gap-1.5 px-3 h-full border-r border-hairline text-[11px] font-medium transition-colors whitespace-nowrap ${item.bg} ${item.urgent ? item.text : 'text-muted'}`}>
              <Icon className={`w-3 h-3 shrink-0 ${item.urgent ? item.iconColor : 'text-faint'}`} />
              <span className={`font-bold tabular-nums ${item.urgent ? '' : 'text-faint'}`}>{item.count}</span>
              <span className={item.urgent ? 'opacity-90' : 'opacity-60'}>{item.label}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        {dashboardStats.overdueJobs.length === 0 && dashboardStats.dueToday.length === 0 && dashboardStats.toInvoice === 0 && (
          <span className="text-[10px] text-ok font-medium px-3 flex items-center gap-1"><CheckSquare className="w-3 h-3" />All caught up</span>
        )}
        <span className="text-[10px] text-faint px-3 border-l border-hairline whitespace-nowrap hidden lg:block">
          {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* ── Content Row ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Main content column ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <main className="flex-1 p-5 overflow-auto bg-[#f8fafc]">
            {loading && (
              <div className="flex items-center justify-center py-20 text-faint text-sm">Loading data...</div>
            )}
            {apiError && (
              <div className="mb-4 flex items-center justify-between bg-danger-tint border border-danger text-danger text-sm px-4 py-3 rounded-lg">
                <span>{apiError}</span>
                <button onClick={() => setApiError('')} className="ml-4 text-danger hover:text-danger">✕</button>
              </div>
            )}
            {adminMode ? (
              <AdminPanel />
            ) : (
              <>
                {!loading && activeModule === 'dashboard'          && renderDashboard()}
                {!loading && (activeModule === 'jobs' || activeModule === 'quotes') && (
                  jobListModal.open ? <JobListPage customers={customers} deleteJobList={deleteJobList} inventory={inventory} jobListModal={jobListModal} jobs={jobs} openModal={openModal} savedJobLists={savedJobLists} setActiveJob={setActiveJob} setActiveJobList={setActiveJobList} setActiveModule={setActiveModule} setJobListModal={setJobListModal} setShowJobDetail={setShowJobDetail} updateListFilter={updateListFilter} />
                  : (dispatchListOpen && activeModule === 'jobs') ? (
                    <DispatchList jobs={jobs ?? []} busy={dispatchListBusy} onDispatch={dispatchBatch} onClose={() => setDispatchListOpen(false)} />
                  )
                  : renderJobs()
                )}
                {!loading && activeModule === 'order-requirements' && <OrderRequirementsModule decorationReqs={decorationReqs} garmentReqs={garmentReqs} jobs={jobs} pinJob={pinJob} refetchDecorationReqs={refetchDecorationReqs} refetchGarmentReqs={refetchGarmentReqs} setActiveModule={setActiveModule} suppliers={suppliers} />}
                {!loading && activeModule === 'inventory' && (stockListModal.open ? <StockListPage deleteJobList={deleteJobList} inventory={inventory} openModal={openModal} savedJobLists={savedJobLists} setActiveModule={setActiveModule} setStockFocusSku={setStockFocusSku} setStockListModal={setStockListModal} stockListModal={stockListModal} updateListFilter={updateListFilter} /> : (
                  <StockModule
                    inventory={inventory}
                    focusSku={stockFocusSku}
                    onNavigateJob={async (jobId) => { setActiveModule('jobs'); let j = jobs.find(jb => String(jb.id) === String(jobId)); if (!j) { try { j = await api.jobs.get(jobId); } catch (e) { setApiError(e.message); } } if (j) pinJob(j); }}
                    onNavigatePO={() => setActiveModule('purchase-orders')}
                  />
                ))}
                {!loading && activeModule === 'customers'          && <CustomersDetail customers={customers} deleteCustomer={deleteCustomer} exportToCSV={exportToCSV} jobs={jobs} openModal={openModal} pinJob={pinJob} searchTerm={searchTerm} setActiveModule={setActiveModule} setFilterCustomer={setFilterCustomer} setSearchTerm={setSearchTerm} />}
                {!loading && activeModule === 'suppliers'          && <SuppliersModule deleteSupplier={deleteSupplier} exportToCSV={exportToCSV} inventory={inventory} openModal={openModal} purchaseOrders={purchaseOrders} searchTerm={searchTerm} setActiveModule={setActiveModule} setSearchTerm={setSearchTerm} suppliers={suppliers} />}
                {!loading && activeModule === 'purchase-orders'    && (poListModal.open ? <POListPage deleteJobList={deleteJobList} openModal={openModal} poListModal={poListModal} purchaseOrders={purchaseOrders} savedJobLists={savedJobLists} setActiveModule={setActiveModule} setPoListModal={setPoListModal} setSelectedPO={setSelectedPO} updateListFilter={updateListFilter} /> : <PurchaseOrdersDetail exportToCSV={exportToCSV} openModal={openModal} poStatusFilter={poStatusFilter} purchaseOrders={purchaseOrders} receivePO={receivePO} receiveQtys={receiveQtys} searchTerm={searchTerm} selectedPO={selectedPO} setPoStatusFilter={setPoStatusFilter} setReceiveQtys={setReceiveQtys} setSearchTerm={setSearchTerm} setSelectedPO={setSelectedPO} updatePOStatus={updatePOStatus} />)}
                {!loading && activeModule === 'reports'            && renderReports()}
                {!loading && activeModule === 'warehouse'          && <WarehouseModule exportToCSV={exportToCSV} inventory={inventory} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />}
                {!loading && activeModule === 'scheduling'         && renderScheduling()}
                {!loading && activeModule === 'card-files'         && renderCardFiles()}
                {activeModule === 'import'                         && <ImportModule />}
                {!loading && activeModule === 'email'              && <EmailModule jobs={jobs} />}
                {!loading && activeModule === 'settings'           && <SettingsModule currentUser={currentUser} />}
                {!loading && activeModule === 'user-management'    && <UserManagement currentUser={currentUser} />}
                {!loading && activeModule === 'styles'             && <StylesModule />}
                {!loading && activeModule === 'accounts' && (
                  <AccountsPayableModule suppliers={suppliers} />
                )}
                {!loading && ['ebusiness','documents','projects','assets'].includes(activeModule) && (
                  <div className="flex flex-col items-center justify-center h-64 text-faint">
                    <div className="w-16 h-16 bg-hairline-soft rounded-full flex items-center justify-center mb-4">
                      <Settings className="w-8 h-8 text-faint" />
                    </div>
                    <p className="text-lg font-medium text-muted capitalize">{activeModule.replace(/-/g,' ')}</p>
                    <p className="text-sm text-faint mt-1">This module is coming soon</p>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="shrink-0 bg-white border-t border-hairline-soft flex items-center px-4 gap-4 text-[11px] text-faint" style={{ height: 24 }}>
        <span className="text-muted font-medium">{currentUser?.full_name || currentUser?.username}</span>
        <span>·</span>
        <span>TIG ERP v1.0</span>
        <div className="flex-1" />
        <span>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>

      {/* ── Nav context menu ── */}
      {navCtxMenu.open && (
        <div
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-hairline py-1 min-w-[180px] text-sm"
          style={{ left: navCtxMenu.x, top: navCtxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {navCtxMenu.itemId === 'jobs' && navCtxMenu.pinnedJobId && (
            <button
              onClick={() => { unpinJob(navCtxMenu.pinnedJobId); setNavCtxMenu(m => ({ ...m, open: false })); }}
              className="w-full text-left px-4 py-2 text-xs text-header hover:bg-panel-alt flex items-center gap-2"
            >
              <X className="w-3.5 h-3.5 text-faint" />
              Close #{navCtxMenu.pinnedJobId}
            </button>
          )}
          {navCtxMenu.itemId === 'jobs' && pinnedJobs.length > 0 && (
            <button
              onClick={() => { setPinnedJobs([]); setActiveJob(null); setShowJobDetail(false); setNavCtxMenu(m => ({ ...m, open: false })); }}
              className="w-full text-left px-4 py-2 text-xs text-header hover:bg-panel-alt flex items-center gap-2"
            >
              <X className="w-3.5 h-3.5 text-faint" />
              Close all nodes
            </button>
          )}
        </div>
      )}

      {/* ── F12 Quick Job Lookup ── */}
      {f12Open && (
        <div className="fixed inset-0 z-[9999]" onClick={() => setF12Open(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div
            ref={f12PopupRef}
            className="absolute bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            style={f12Pos
              ? { left: f12Pos.x, top: f12Pos.y }
              : { left: '50%', top: '18%', transform: 'translateX(-50%)' }
            }
            onClick={e => e.stopPropagation()}
          >
            {/* Header — drag handle */}
            <div
              className="flex items-center justify-between px-5 pt-5 pb-3 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={e => {
                e.preventDefault();
                const rect = f12PopupRef.current.getBoundingClientRect();
                f12DragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                const onMove = (ev) => {
                  setF12Pos({ x: ev.clientX - f12DragOffset.current.x, y: ev.clientY - f12DragOffset.current.y });
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-header">Quick Job Lookup</span>
              </div>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setF12Open(false)} className="p-1 rounded-lg hover:bg-hairline-soft text-faint hover:text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input */}
            <div className="px-5 pb-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-faint" />
                <input
                  ref={f12Ref}
                  type="text"
                  value={f12Input}
                  onChange={e => setF12Input(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const q = f12Input.trim().toLowerCase();
                      if (!q) return;
                      const hit = jobs.find(j =>
                        (j.id || '').toLowerCase() === q ||
                        (j.id || '').toLowerCase().includes(q) ||
                        (j.invoice || '').toLowerCase().includes(q) ||
                        (j.custRef || '').toLowerCase().includes(q)
                      );
                      if (hit) {
                        pinJob(hit);
                        setActiveModule('jobs');
                        setF12Open(false);
                        setF12Input('');
                      }
                    }
                  }}
                  placeholder="Job #, invoice, or ref…"
                  className="w-full pl-9 pr-4 py-2.5 border border-hairline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus focus:border-transparent"
                  autoComplete="off"
                />
              </div>

              {/* Live suggestions */}
              {f12Input.trim().length > 0 && (() => {
                const q = f12Input.trim().toLowerCase();
                const hits = jobs.filter(j =>
                  (j.id || '').toLowerCase().includes(q) ||
                  (j.customer || '').toLowerCase().includes(q) ||
                  (j.invoice || '').toLowerCase().includes(q) ||
                  (j.custRef || '').toLowerCase().includes(q)
                ).slice(0, 6);
                const statusColors = { QUOTE:'bg-hairline-soft text-muted', New:'bg-accent-tint text-accent-strong', ORDER:'bg-accent-tint text-accent-strong', 'In Progress':'bg-warn-tint text-warn', PROOF:'bg-emphasis-tint text-emphasis', PRINT:'bg-accent-tint text-accent-strong', 'Pick/Pack':'bg-accent-tint text-accent-strong', FINISH:'bg-ok-tint text-ok', INVOICE:'bg-accent-tint text-accent-strong', PAID:'bg-ok-tint text-ok', CANCEL:'bg-danger-tint text-danger' };
                return hits.length > 0 ? (
                  <div className="mt-2 rounded-xl border border-hairline-soft overflow-hidden shadow-sm">
                    {hits.map(j => (
                      <button key={j.id}
                        onMouseDown={() => { pinJob(j); setActiveModule('jobs'); setF12Open(false); setF12Input(''); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent-tint text-left border-b border-hairline-soft last:border-0 transition-colors">
                        <span className="font-mono text-xs font-bold text-accent-strong w-24 shrink-0">#{j.id}</span>
                        <span className="flex-1 text-sm text-header truncate">{j.customer}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColors[j.status] || 'bg-hairline-soft text-muted'}`}>{j.status}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-faint text-center">No jobs match "{f12Input}"</p>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-panel-alt border-t border-hairline-soft flex items-center justify-between">
              <span className="text-xs text-faint">Press <kbd className="bg-white border border-hairline rounded px-1.5 py-0.5 text-[10px] font-mono shadow-sm">Enter</kbd> to open · <kbd className="bg-white border border-hairline rounded px-1.5 py-0.5 text-[10px] font-mono shadow-sm">Esc</kbd> to close</span>
              <button
                onMouseDown={() => {
                  const q = f12Input.trim().toLowerCase();
                  if (!q) return;
                  const hit = jobs.find(j => (j.id || '').toLowerCase().includes(q) || (j.customer || '').toLowerCase().includes(q));
                  if (hit) { pinJob(hit); setActiveModule('jobs'); setF12Open(false); setF12Input(''); }
                }}
                className="bg-accent-strong text-white text-xs font-medium px-4 py-1.5 rounded-lg hover:bg-accent-strong transition-colors"
              >
                Open Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {renderModal()}
      <ConfirmModal confirmModal={confirmModal} setConfirmModal={setConfirmModal} />
      <PaymentModal paymentModal={paymentModal} recordPayment={recordPayment} setPaymentModal={setPaymentModal} />
      <StockAdjustModal adjustStock={adjustStock} setStockAdjustModal={setStockAdjustModal} stockAdjustModal={stockAdjustModal} />
      <DispatchModal dispatchModal={dispatchModal} onJobUpdated={updatePinnedJob} setDispatchModal={setDispatchModal} />
      <UnprintModal onJobUpdated={updatePinnedJob} setUnprintModal={setUnprintModal} unprintModal={unprintModal} />
      <SalesRegisterModal salesRegModal={salesRegModal} setSalesRegModal={setSalesRegModal} />
      <TransferModal inventory={inventory} setTransferModal={setTransferModal} transferModal={transferModal} />
      <StocktakeModal setStocktakeModal={setStocktakeModal} stocktakeModal={stocktakeModal} />
      <StockFlowModal setStockFlowModal={setStockFlowModal} stockFlowModal={stockFlowModal} />
      <InvoiceDocument invoiceJob={invoiceJob} invoiceVariant={invoiceVariant} setInvoiceJob={setInvoiceJob} />
      <DocumentPrint documentPrint={documentPrint} inventory={inventory} setDocumentPrint={setDocumentPrint} />
      {emailModalJob && <EmailJobModal job={emailModalJob} customers={customers} onClose={() => setEmailModalJob(null)} />}
      {matrixPopup !== null && (
        <SizeColourMatrixPopup
          current={jobForm.items[matrixPopup.idx]?.sizes || ''}
          onApply={(text, total) => {
            updateJobItem(matrixPopup.idx, 'sizes', text);
            if (total > 0) updateJobItem(matrixPopup.idx, 'order', total);
            setMatrixPopup(null);
          }}
          onClose={() => setMatrixPopup(null)}
        />
      )}
      {renderOpenFreightModal()}
      {<AIAssistantPanel aiClaudeEnabled={aiClaudeEnabled} aiDragOffset={aiDragOffset} aiEndRef={aiEndRef} aiInput={aiInput} aiLoading={aiLoading} aiMessages={aiMessages} aiPanelRef={aiPanelRef} customers={customers} inventory={inventory} jobs={jobs} sendAiMessage={sendAiMessage} setAiInput={setAiInput} setAiLoading={setAiLoading} setAiMessages={setAiMessages} suppliers={suppliers} />}

      {/* User Settings Modal */}
      {showUserSettings && (
        <DraggableModal onClose={() => setShowUserSettings(false)} cardClass="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">User Settings</h2>
              <button onClick={() => setShowUserSettings(false)}><X className="w-5 h-5 text-muted" /></button>
            </div>
            <div className="mb-6 pb-6 border-b">
              <p className="text-sm text-muted mb-1">Logged in as</p>
              <p className="font-semibold">{currentUser?.full_name || currentUser?.username}</p>
              <p className="text-xs text-faint capitalize mt-0.5">{currentUser?.role?.replace('_', ' ')} account</p>
            </div>
            <h3 className="font-semibold mb-4">Change Password</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted mb-1">Current Password</label>
                <input
                  type="password"
                  value={changePasswordForm.current}
                  onChange={e => setChangePasswordForm(f => ({ ...f, current: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">New Password</label>
                <input
                  type="password"
                  value={changePasswordForm.newPass}
                  onChange={e => setChangePasswordForm(f => ({ ...f, newPass: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={changePasswordForm.confirm}
                  onChange={e => setChangePasswordForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-focus"
                  placeholder="Repeat new password"
                />
              </div>
              {changePasswordMsg && (
                <p className={`text-sm ${changePasswordMsg.includes('success') ? 'text-ok' : 'text-danger'}`}>
                  {changePasswordMsg}
                </p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={!changePasswordForm.current || !changePasswordForm.newPass}
                className="w-full bg-accent-strong text-white py-2 rounded-lg hover:bg-accent-strong disabled:opacity-40 text-sm font-medium"
              >
                Change Password
              </button>
            </div>
        </DraggableModal>
      )}


      {/* ── Global Search (Ctrl+K) ── */}
      {globalSearchOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/50" onClick={() => setGlobalSearchOpen(false)}>
          <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <Search className="w-5 h-5 text-faint shrink-0" />
              <input
                ref={globalSearchRef}
                type="text"
                value={globalSearchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
                placeholder="Search jobs, customers, inventory, suppliers…"
                className="flex-1 text-base outline-none text-header placeholder-faint"
              />
              <kbd className="text-xs bg-hairline-soft border border-hairline rounded px-1.5 py-0.5 text-muted font-mono shrink-0">Esc</kbd>
            </div>
            {globalSearchQuery.length > 0 && (() => {
              const q = globalSearchQuery.toLowerCase();
              const jobHits = jobs.filter(j =>
                (j.id||'').toLowerCase().includes(q) || (j.customer||'').toLowerCase().includes(q) ||
                (j.invoice||'').toLowerCase().includes(q) || (j.custRef||'').toLowerCase().includes(q)
              ).slice(0, 5);
              const custHits = customers.filter(c =>
                (c.name||'').toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)
              ).slice(0, 3);
              const invHits = inventory.filter(i =>
                (i.sku||'').toLowerCase().includes(q) || (i.name||'').toLowerCase().includes(q)
              ).slice(0, 3);
              const suppHits = suppliers.filter(s =>
                (s.name||'').toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q)
              ).slice(0, 2);
              const hasResults = jobHits.length || custHits.length || invHits.length || suppHits.length;
              const statusBg = { QUOTE:'bg-hairline-soft text-muted', ORDER:'bg-accent-tint text-accent-strong', 'In Progress':'bg-warn-tint text-warn', FINISH:'bg-ok-tint text-ok', INVOICE:'bg-accent-tint text-accent-strong', PAID:'bg-ok-tint text-ok', CANCEL:'bg-danger-tint text-danger' };
              return (
                <div className="max-h-[60vh] overflow-y-auto divide-y divide-hairline-soft">
                  {jobHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-faint uppercase tracking-widest">Jobs</p>
                      {jobHits.map(j => (
                        <div key={j.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent-tint cursor-pointer"
                          onClick={() => { pinJob(j); setActiveModule('jobs'); setGlobalSearchOpen(false); }}>
                          <FileText className="w-4 h-4 text-accent shrink-0" />
                          <span className="font-mono text-sm font-bold text-accent-strong w-20 shrink-0">#{j.id}</span>
                          <span className="flex-1 text-sm text-header truncate">{j.customer}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBg[j.status] || 'bg-hairline-soft text-muted'}`}>{j.status}</span>
                          <span className="text-sm font-semibold text-muted shrink-0">${(j.total||0).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {custHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-faint uppercase tracking-widest">Customers</p>
                      {custHits.map(c => (
                        <div key={c.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent-tint cursor-pointer"
                          onClick={() => { setActiveModule('customers'); setGlobalSearchOpen(false); }}>
                          <Users className="w-4 h-4 text-ok shrink-0" />
                          <div className="w-7 h-7 rounded-full bg-accent-tint text-accent-strong font-bold text-xs flex items-center justify-center shrink-0">{(c.name||'?').charAt(0)}</div>
                          <span className="flex-1 text-sm text-header truncate">{c.name}</span>
                          <span className="text-xs text-faint font-mono">{c.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {invHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-faint uppercase tracking-widest">Inventory</p>
                      {invHits.map(i => (
                        <div key={i.sku} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent-tint cursor-pointer"
                          onClick={() => { setActiveModule('inventory'); setGlobalSearchOpen(false); }}>
                          <Package className="w-4 h-4 text-emphasis shrink-0" />
                          <span className="font-mono text-xs bg-hairline-soft px-1.5 py-0.5 rounded shrink-0">{i.sku}</span>
                          <span className="flex-1 text-sm text-header truncate">{i.name}</span>
                          <span className={`text-xs font-semibold ${i.stock < i.reorderLevel ? 'text-danger' : 'text-ok'}`}>{i.stock} in stock</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {suppHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-faint uppercase tracking-widest">Suppliers</p>
                      {suppHits.map(s => (
                        <div key={s.code} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent-tint cursor-pointer"
                          onClick={() => { setActiveModule('suppliers'); setGlobalSearchOpen(false); }}>
                          <Truck className="w-4 h-4 text-accent shrink-0" />
                          <span className="flex-1 text-sm text-header truncate">{s.name}</span>
                          <span className="text-xs text-faint font-mono">{s.code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!hasResults && (
                    <div className="px-5 py-10 text-center text-faint">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No results for "{globalSearchQuery}"</p>
                    </div>
                  )}
                </div>
              );
            })()}
            {globalSearchQuery.length === 0 && (
              <div className="px-5 py-6 text-center text-faint">
                <p className="text-sm">Type to search across jobs, customers, inventory, and suppliers</p>
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-faint">
                  <span><kbd className="bg-hairline-soft border border-hairline rounded px-1.5 py-0.5 font-mono">Alt+J</kbd> Jobs</span>
                  <span><kbd className="bg-hairline-soft border border-hairline rounded px-1.5 py-0.5 font-mono">Alt+C</kbd> Customers</span>
                  <span><kbd className="bg-hairline-soft border border-hairline rounded px-1.5 py-0.5 font-mono">Alt+I</kbd> Inventory</span>
                  <span><kbd className="bg-hairline-soft border border-hairline rounded px-1.5 py-0.5 font-mono">F12</kbd> Quick Job</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right-click context menu for line items */}
      {ctxMenu.visible && (
        <div
          className="fixed rounded-lg shadow-2xl z-[99999] py-1 min-w-[200px] text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y, background: T.panel, border: `1px solid ${T.hairline}` }}
          onMouseLeave={closeCtx}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: T.textFaint, borderBottom: `1px solid ${T.hairline}` }}>Row {ctxMenu.rowIdx + 1}</div>
          <button onMouseDown={() => { ctxAddAbove(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-accent-tint flex items-center gap-2" style={{ color: T.text }}>
            <Plus className="w-3.5 h-3.5 text-accent" /> Add Row Above
          </button>
          <button onMouseDown={() => { ctxAddBelow(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-accent-tint flex items-center gap-2" style={{ color: T.text }}>
            <Plus className="w-3.5 h-3.5 text-accent" /> Add Row Below
          </button>
          <button onMouseDown={() => { ctxDuplicate(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-accent-tint flex items-center gap-2" style={{ color: T.text }}>
            <span className="text-accent font-bold text-xs">⧉</span> Duplicate Row
          </button>
          <div className="my-1" style={{ borderTop: `1px solid ${T.hairline}` }} />
          <button onMouseDown={() => { ctxMoveUp(ctxMenu.rowIdx); closeCtx(); }} disabled={ctxMenu.rowIdx === 0}
            className="w-full text-left px-4 py-2 hover:bg-panel-alt flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: T.text }}>
            <span style={{ color: T.textMuted }}>↑</span> Move Up
          </button>
          <button onMouseDown={() => { ctxMoveDown(ctxMenu.rowIdx); closeCtx(); }} disabled={ctxMenu.rowIdx >= jobForm.items.length - 1}
            className="w-full text-left px-4 py-2 hover:bg-panel-alt flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: T.text }}>
            <span style={{ color: T.textMuted }}>↓</span> Move Down
          </button>
          <div className="my-1" style={{ borderTop: `1px solid ${T.hairline}` }} />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.textFaint }}>Row Type</div>
          {[['product','📦 Product Line'],['section','§ Section Header'],['note','¶ Note / Instruction']].map(([t, label]) => (
            <button key={t} onMouseDown={() => { setJobForm(f => { const items = [...f.items]; items[ctxMenu.rowIdx] = { ...items[ctxMenu.rowIdx], displayType: t }; return { ...f, items }; }); closeCtx(); }}
              className={`w-full text-left px-4 py-1.5 hover:bg-accent-tint flex items-center gap-2 text-xs ${jobForm.items[ctxMenu.rowIdx]?.displayType === t ? 'font-bold text-accent-strong' : ''}`}
              style={jobForm.items[ctxMenu.rowIdx]?.displayType === t ? undefined : { color: T.textMuted }}>
              {label} {jobForm.items[ctxMenu.rowIdx]?.displayType === t ? '✓' : ''}
            </button>
          ))}
          <div className="my-1" style={{ borderTop: `1px solid ${T.hairline}` }} />
          <button onMouseDown={() => { ctxClearRow(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-accent-tint flex items-center gap-2 text-accent-strong">
            <span className="text-accent-strong">⊘</span> Clear Row
          </button>
          <button onMouseDown={() => { removeJobItem(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-danger-tint flex items-center gap-2 text-danger">
            <X className="w-3.5 h-3.5" /> Delete Row
          </button>
        </div>
      )}
    </AppShell>
  );
};

export default TotalImageERP;
