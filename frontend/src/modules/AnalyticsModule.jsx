import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, BarChart3, Clock, AlertTriangle, Users,
  Package, DollarSign, RefreshCw, LayoutGrid, HelpCircle,
  Calendar, Percent, ArrowUpRight, ArrowDownRight, ShieldAlert,
  ChevronRight, Activity
} from 'lucide-react';
import * as api from '../api';
import { notify } from '../lib/notify';
import { T } from '../ui/tokens';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart as RechartsPie, Pie, Cell
} from 'recharts';

const PIE_COLORS = ['#10b981', '#3b82f6', '#ef4444'];
const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const fmt$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;

export default function AnalyticsModule() {
  const [activeTab, setActiveTab] = useState('overview');
  const [queryError, setQueryError] = useState('');

  // TanStack Queries for each endpoint
  const overviewQuery = useQuery({ queryKey: ['analytics/overview'], queryFn: api.analytics.getOverview, staleTime: 30000, onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const forecastQuery = useQuery({ queryKey: ['analytics/forecast'], queryFn: api.analytics.getForecast, staleTime: 30000, enabled: activeTab === 'forecast' || activeTab === 'overview', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const dsoQuery = useQuery({ queryKey: ['analytics/dso'], queryFn: api.analytics.getDso, staleTime: 30000, enabled: activeTab === 'dso' || activeTab === 'overview', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const abcQuery = useQuery({ queryKey: ['analytics/abc'], queryFn: api.analytics.getAbc, staleTime: 30000, enabled: activeTab === 'abc', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const churnQuery = useQuery({ queryKey: ['analytics/churn'], queryFn: api.analytics.getChurn, staleTime: 30000, enabled: activeTab === 'churn' || activeTab === 'overview', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const marginsQuery = useQuery({ queryKey: ['analytics/margins'], queryFn: api.analytics.getMargins, staleTime: 30000, enabled: activeTab === 'margins', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const turnaroundQuery = useQuery({ queryKey: ['analytics/turnaround'], queryFn: api.analytics.getTurnaround, staleTime: 30000, enabled: activeTab === 'turnaround', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const seasonalityQuery = useQuery({ queryKey: ['analytics/seasonality'], queryFn: api.analytics.getSeasonality, staleTime: 30000, enabled: activeTab === 'seasonality', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });
  const anomaliesQuery = useQuery({ queryKey: ['analytics/anomalies'], queryFn: api.analytics.getAnomalies, staleTime: 30000, enabled: activeTab === 'anomalies' || activeTab === 'overview', onError: (e) => { const m = e?.message || String(e); setQueryError(m); notify(m, { type: 'error' }); } });

  const refetchAll = () => {
    overviewQuery.refetch();
    forecastQuery.refetch();
    dsoQuery.refetch();
    abcQuery.refetch();
    churnQuery.refetch();
    marginsQuery.refetch();
    turnaroundQuery.refetch();
    seasonalityQuery.refetch();
    anomaliesQuery.refetch();
  };

  const isAnyLoading = overviewQuery.isLoading || 
    (activeTab === 'forecast' && forecastQuery.isLoading) ||
    (activeTab === 'dso' && dsoQuery.isLoading) ||
    (activeTab === 'abc' && abcQuery.isLoading) ||
    (activeTab === 'churn' && churnQuery.isLoading) ||
    (activeTab === 'margins' && marginsQuery.isLoading) ||
    (activeTab === 'turnaround' && turnaroundQuery.isLoading) ||
    (activeTab === 'seasonality' && seasonalityQuery.isLoading) ||
    (activeTab === 'anomalies' && anomaliesQuery.isLoading);

  return (
    <div className="space-y-5">
      {/* ── Title and Refresh ── */}
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.hairline }}>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: T.text }}>
            <Activity className="w-5 h-5" style={{ color: T.accentStrong }} />
            Operations &amp; Predictive Analytics
          </h2>
          <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Advanced forecasting models and operational efficiency audits</p>
        </div>
        <button
          onClick={refetchAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
          style={{ border: `1px solid ${T.hairline}`, background: T.panel, color: T.textMuted }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isAnyLoading ? 'animate-spin' : ''}`} />
          Refresh Models
        </button>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex overflow-x-auto scrollbar-none gap-1 p-1 rounded-lg" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        {[
          { id: 'overview',     label: 'Overview',         icon: LayoutGrid },
          { id: 'forecast',     label: 'Revenue Forecast',  icon: TrendingUp },
          { id: 'dso',          label: 'DSO & Collections', icon: DollarSign },
          { id: 'turnaround',   label: 'Turnaround Time',   icon: Clock },
          { id: 'abc',          label: 'ABC Inventory',     icon: Package },
          { id: 'churn',        label: 'Retention & Churn', icon: Users },
          { id: 'margins',      label: 'Pricing & Margins', icon: Percent },
          { id: 'anomalies',    label: 'Anomaly Reports',   icon: ShieldAlert }
        ].map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md whitespace-nowrap transition-all"
              style={isActive
                ? { background: T.accentStrong, color: '#fff' }
                : { color: T.textMuted }}
            >
              <TabIcon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content Panel ── */}
      <div className="min-h-[480px]">
        {activeTab === 'overview'     && renderOverviewTab({ overviewQuery, forecastQuery, dsoQuery, churnQuery, anomaliesQuery, setActiveTab })}
        {activeTab === 'forecast'     && renderForecastTab({ forecastQuery, seasonalityQuery })}
        {activeTab === 'dso'          && renderDsoTab({ dsoQuery })}
        {activeTab === 'turnaround'    && renderTurnaroundTab({ turnaroundQuery })}
        {activeTab === 'abc'          && renderAbcTab({ abcQuery })}
        {activeTab === 'churn'        && renderChurnTab({ churnQuery })}
        {activeTab === 'margins'      && renderMarginsTab({ marginsQuery })}
        {activeTab === 'anomalies'    && renderAnomaliesTab({ anomaliesQuery })}
      </div>
    </div>
  );
}

// ── 1. Overview Tab ─────────────────────────────────────────────────────────
function renderOverviewTab({ overviewQuery, forecastQuery, dsoQuery, churnQuery, anomaliesQuery, setActiveTab }) {
  if (overviewQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Loading overview...</div>;
  if (overviewQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error: {overviewQuery.error.message}</div>;

  const data = overviewQuery.data;
  const forecast = forecastQuery.data;
  const dso = dsoQuery.data;
  const churn = churnQuery.data;
  const anomalies = anomaliesQuery.data;

  // Generate action items dynamically
  const actionItems = [];
  if (dso && dso.dso_days > 35) {
    actionItems.push({
      type: 'warning',
      tab: 'dso',
      msg: `Days Sales Outstanding (DSO) is high at ${dso.dso_days} days. Target is <35 days. Credit control follow-up recommended.`
    });
  }
  if (data.overdue_jobs_count > 0) {
    actionItems.push({
      type: 'critical',
      tab: 'overview',
      msg: `There are ${data.overdue_jobs_count} overdue jobs in active pipeline. Operations throughput check suggested.`
    });
  }
  if (churn && churn.summary?.high_risk_count > 0) {
    actionItems.push({
      type: 'info',
      tab: 'churn',
      msg: `${churn.summary.high_risk_count} active customers have not ordered in >120 days. High churn risk.`
    });
  }
  if (data.low_stock_count > 0) {
    actionItems.push({
      type: 'warning',
      tab: 'overview',
      msg: `${data.low_stock_count} active inventory SKUs are below reorder thresholds. Restock required.`
    });
  }
  if (anomalies && anomalies.stock_consumption_anomalies?.length > 0) {
    actionItems.push({
      type: 'critical',
      tab: 'anomalies',
      msg: `Z-Score model detected ${anomalies.stock_consumption_anomalies.length} inventory consumption spikes.`
    });
  }
  if (data.stagnant_jobs_count > 0) {
    actionItems.push({
      type: 'warning',
      tab: 'anomalies',
      msg: `${data.stagnant_jobs_count} active jobs have been stuck in the pipeline for over 30 days.`
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Key Cards Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outstanding Receivables */}
        <div className="rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <div className="flex items-center justify-between" style={{ color: T.textMuted }}>
              <span className="text-xs font-semibold uppercase tracking-wider">Outstanding A/R</span>
              <DollarSign className="w-4 h-4 text-ok" />
            </div>
            <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>{fmt$(data.outstanding_receivables)}</p>
          </div>
          <div className="pt-2 mt-4 flex justify-between items-center text-[11px]" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <span style={{ color: T.textMuted }}>
              {dso ? `Collection DSO: ${dso.dso_days} days` : 'Calculating DSO...'}
            </span>
            {dso && (
              <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                dso.dso_days < 20 ? 'bg-ok-tint text-ok' : dso.dso_days < 35 ? 'bg-warn-tint text-warn' : 'bg-danger-tint text-danger'
              }`}>
                {dso.collection_health_rating}
              </span>
            )}
          </div>
        </div>

        {/* Forecasted Sales */}
        <div className="rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <div className="flex items-center justify-between" style={{ color: T.textMuted }}>
              <span className="text-xs font-semibold uppercase tracking-wider">Next Month Forecast</span>
              <TrendingUp className="w-4 h-4" style={{ color: T.accentStrong }} />
            </div>
            <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>
              {forecast ? fmt$(forecast.ensemble_forecast) : 'Calculating...'}
            </p>
          </div>
          <div className="pt-2 mt-4 flex justify-between items-center text-[11px]" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <span style={{ color: T.textMuted }}>
              {forecast ? `Month: ${forecast.forecast_month}` : 'Forecast month...'}
            </span>
            {forecast && (
              <span className="flex items-center gap-0.5 font-bold" style={{ color: T.ok }}>
                <ArrowUpRight className="w-3.5 h-3.5" />
                {forecast.confidence} Fit
              </span>
            )}
          </div>
        </div>

        {/* Active Backlog */}
        <div className="rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <div className="flex items-center justify-between" style={{ color: T.textMuted }}>
              <span className="text-xs font-semibold uppercase tracking-wider">Active Backlog</span>
              <Clock className="w-4 h-4 text-accent-strong" />
            </div>
            <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>{data.active_jobs_count} Jobs</p>
          </div>
          <div className="pt-2 mt-4 flex justify-between items-center text-[11px]" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <span style={{ color: T.textMuted }}>
              {data.stagnant_jobs_count} stagnant (&gt;30d)
            </span>
            {data.overdue_jobs_count > 0 ? (
              <span className="px-1.5 py-0.5 bg-danger-tint text-danger font-bold rounded-full">
                {data.overdue_jobs_count} Overdue
              </span>
            ) : (
              <span className="px-1.5 py-0.5 bg-ok-tint text-ok font-bold rounded-full">
                All Current
              </span>
            )}
          </div>
        </div>

        {/* Customer Churn Risk */}
        <div className="rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <div className="flex items-center justify-between" style={{ color: T.textMuted }}>
              <span className="text-xs font-semibold uppercase tracking-wider">Churn Risk Accounts</span>
              <Users className="w-4 h-4 text-emphasis" />
            </div>
            <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>{data.high_risk_churn_count} Clients</p>
          </div>
          <div className="pt-2 mt-4 flex justify-between items-center text-[11px]" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <span style={{ color: T.textMuted }}>Inactive &gt;120 days</span>
            <span className="px-1.5 py-0.5 bg-emphasis-tint text-emphasis font-bold rounded-full">
              Follow-up Needed
            </span>
          </div>
        </div>
      </div>

      {/* ── Action Items & Mini Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Action Items List */}
        <div className="rounded-xl p-5 shadow-sm lg:col-span-2 space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <h3 className="font-bold text-sm" style={{ color: T.text }}>Automated Operational Audits</h3>
            <p className="text-[11px]" style={{ color: T.textMuted }}>Rule-based triggers identifying anomalies and bottlenecks</p>
          </div>
          <div className="max-h-80 overflow-y-auto pr-1" style={{ borderTop: `1px solid ${T.hairline}` }}>
            {actionItems.length === 0 ? (
              <p className="text-xs py-10 text-center" style={{ color: T.textFaint }}>No compliance issues or bottlenecks flagged in this cycle.</p>
            ) : (
              actionItems.map((item, idx) => (
                <div key={idx} className="py-3.5 flex items-start justify-between gap-3 text-xs" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                  <div className="flex gap-2.5 items-start">
                    {item.type === 'critical' ? (
                      <AlertTriangle className="w-4.5 h-4.5 text-danger shrink-0 mt-0.5" />
                    ) : item.type === 'warning' ? (
                      <AlertTriangle className="w-4.5 h-4.5 text-warn shrink-0 mt-0.5" />
                    ) : (
                      <HelpCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" style={{ color: T.accentStrong }} />
                    )}
                    <span className="leading-relaxed" style={{ color: T.textMuted }}>{item.msg}</span>
                  </div>
                  <button
                    onClick={() => setActiveTab(item.tab)}
                    className="flex items-center gap-0.5 font-bold hover:underline shrink-0"
                    style={{ color: T.accentStrong }}
                  >
                    Resolve <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Small Receivables Aging chart */}
        <div className="rounded-xl p-5 shadow-sm flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <h3 className="font-bold text-sm" style={{ color: T.text }}>Receivables Aging</h3>
            <p className="text-[11px] mb-3" style={{ color: T.textMuted }}>Accounts Receivable Buckets</p>
          </div>
          {dso && dso.total_outstanding > 0 ? (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: '0-30d', value: dso.total_outstanding - dso.top_receivables.reduce((s, r) => s + r.balance_due, 0) }, // proxy
                  ...dso.top_receivables.slice(0, 3).map(r => ({ name: r.customer_name.substring(0, 8), value: r.balance_due }))
                ]}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                  <Tooltip formatter={v => fmtShort$(v)} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs py-10 text-center" style={{ color: T.textFaint }}>No outstanding debts.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 2. Revenue Forecast Tab ──────────────────────────────────────────────────
function renderForecastTab({ forecastQuery, seasonalityQuery }) {
  if (forecastQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Running smoothing &amp; OLS regressions...</div>;
  if (forecastQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error loading forecast: {forecastQuery.error.message}</div>;

  const data = forecastQuery.data;
  const seasonality = seasonalityQuery.data;
  const months = data.recent_months || [];

  return (
    <div className="space-y-6">
      {/* Historical + Predict Chart */}
      <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div>
          <h3 className="font-bold text-sm" style={{ color: T.text }}>Ensemble Revenue Projection</h3>
          <p className="text-[11px]" style={{ color: T.textMuted }}>Holt's Double Exponential Smoothing (EWMA) &amp; OLS Linear Regression</p>
        </div>
        {months.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                ...months,
                { month_label: `${data.forecast_month} (Proj)`, revenue: null, ewma: null, forecast: data.ensemble_forecast }
              ]}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month_label" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={v => `$${v/1000}k`} />
                <Tooltip formatter={v => fmt$(v)} />
                <Legend verticalAlign="top" height={36} />
                <Area type="monotone" name="Historical Revenue" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                <Line type="monotone" name="EWMA Level + Trend" dataKey="ewma" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" name="Ensemble Forecast" dataKey="forecast" stroke="#f59e0b" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 6, fill: '#f59e0b' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs py-20 text-center" style={{ color: T.textFaint }}>Insufficient months to compute chart.</p>
        )}
      </div>

      {/* Stats and Seasonality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Model Metrics */}
        <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h4 className="font-bold text-xs uppercase tracking-wider" style={{ color: T.text }}>Regression Coefficients</h4>
          <div className="space-y-3.5">
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: T.textMuted }}>Holt Level Prediction</span>
              <span className="font-semibold" style={{ color: T.text }}>{fmt$(data.holt_prediction)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: T.textMuted }}>Linear OLS Slope Prediction</span>
              <span className="font-semibold" style={{ color: T.text }}>{fmt$(data.ols_prediction)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: T.textMuted }}>Blended Ensemble Forecast</span>
              <span className="font-bold text-accent-strong">{fmt$(data.ensemble_forecast)}</span>
            </div>
            <div className="pt-3" style={{ borderTop: `1px solid ${T.hairline}` }}>
              <div className="flex justify-between items-center text-xs">
                <span style={{ color: T.textMuted }}>Monthly Trend Slope</span>
                <span className={`font-semibold ${data.trend_slope >= 0 ? 'text-ok' : 'text-danger'}`}>
                  {data.trend_slope >= 0 ? '+' : ''}{fmt$(data.trend_slope)} / mo
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: T.textMuted }}>Model Fit (R² Coefficient)</span>
              <span className="font-semibold" style={{ color: T.text }}>{Math.round(data.model_fit_r2 * 100)}%</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: T.textMuted }}>Confidence Interval</span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                data.confidence === 'High' ? 'bg-ok-tint text-ok' : data.confidence === 'Moderate' ? 'bg-warn-tint text-warn' : 'bg-danger-tint text-danger'
              }`}>{data.confidence}</span>
            </div>
          </div>
        </div>

        {/* Seasonality Chart */}
        <div className="rounded-xl p-5 shadow-sm lg:col-span-2 space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider" style={{ color: T.text }}>Seasonal Index Coefficients</h4>
            <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>Deviation factor from average baseline (1.0 = average monthly sales)</p>
          </div>
          {seasonalityQuery.isLoading ? (
            <div className="text-center py-10 text-xs" style={{ color: T.textFaint }}>Loading seasonality indexes...</div>
          ) : seasonalityQuery.isError ? (
            <div className="text-xs" style={{ color: T.danger }}>Error: {seasonalityQuery.error.message}</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonalityQuery.data.monthly_patterns}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month_name" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 'auto']} />
                  <Tooltip formatter={v => `${v} (Index)`} />
                  <Bar dataKey="seasonal_index" fill="#8b5cf6" radius={[2, 2, 0, 0]}>
                    {seasonalityQuery.data.monthly_patterns.map((entry, index) => (
                      <Cell key={index} fill={entry.seasonal_index > 1.1 ? '#10b981' : entry.seasonal_index < 0.9 ? '#ef4444' : '#8b5cf6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 3. DSO & Collections Tab ─────────────────────────────────────────────────
function renderDsoTab({ dsoQuery }) {
  if (dsoQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Calculating aged balances...</div>;
  if (dsoQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error loading DSO: {dsoQuery.error.message}</div>;

  const data = dsoQuery.data;

  // Let's create visual aged buckets
  // Since reports/aged-receivables returns the complete table, we display the summary DSO here
  return (
    <div className="space-y-6">
      {/* DSO Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-5 rounded-xl border flex flex-col justify-between ${
          data.dso_days < 20 ? 'bg-ok-tint border-ok text-ok' : data.dso_days < 35 ? 'bg-warn-tint border-warn text-warn' : 'bg-danger-tint border-danger text-danger'
        }`}>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold opacity-75">Days Sales Outstanding (DSO)</span>
            <p className="text-3xl font-extrabold mt-2">{data.dso_days} Days</p>
          </div>
          <p className="text-[10px] opacity-75 mt-4">Industry target is &lt;30 days. Collection health is {data.collection_health_rating}.</p>
        </div>

        <div className="rounded-xl p-5 shadow-sm flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.textMuted }}>Total Outstanding A/R</span>
            <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>{fmt$(data.total_outstanding)}</p>
          </div>
          <p className="text-[10px] mt-4" style={{ color: T.textFaint }}>90-day billed volume: {fmt$(data.revenue_last_90_days)}</p>
        </div>

        <div className="rounded-xl p-5 shadow-sm flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.textMuted }}>Accounts Status</span>
            <div className="grid grid-cols-3 gap-1 mt-3 text-center">
              <div className="bg-ok-tint p-1.5 rounded">
                <p className="text-[10px] text-ok font-bold">Paid</p>
                <p className="text-sm font-semibold text-ok">{data.paid_jobs_count}</p>
              </div>
              <div className="bg-accent-tint p-1.5 rounded">
                <p className="text-[10px] text-accent-strong font-bold">Partial</p>
                <p className="text-sm font-semibold text-accent-strong">{data.partially_paid_jobs_count}</p>
              </div>
              <div className="bg-danger-tint p-1.5 rounded">
                <p className="text-[10px] text-danger font-bold">Unpaid</p>
                <p className="text-sm font-semibold text-danger">{data.unpaid_invoices_count}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Receivables Customers */}
      <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div>
          <h3 className="font-bold text-sm" style={{ color: T.text }}>Largest Outstanding Balances</h3>
          <p className="text-[11px]" style={{ color: T.textMuted }}>Top customer accounts with unpaid invoices</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="font-semibold uppercase tracking-wider text-[10px]" style={{ background: T.hairlineSoft, color: T.textMuted }}>
              <tr>
                <th className="px-4 py-2.5">Customer ID</th>
                <th className="px-4 py-2.5">Company Name</th>
                <th className="px-4 py-2.5 text-right">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.top_receivables.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-6" style={{ color: T.textFaint }}>No active accounts receivable.</td>
                </tr>
              ) : (
                data.top_receivables.map((r, idx) => (
                  <tr key={idx} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: T.accentStrong }}>{r.customer_id}</td>
                    <td className="px-4 py-2.5 font-medium" style={{ color: T.text }}>{r.customer_name}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-danger">{fmt$(r.balance_due)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 4. Turnaround Time Tab ───────────────────────────────────────────────────
function renderTurnaroundTab({ turnaroundQuery }) {
  if (turnaroundQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Analyzing job completion logs...</div>;
  if (turnaroundQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error: {turnaroundQuery.error.message}</div>;

  const data = turnaroundQuery.data;

  return (
    <div className="space-y-6">
      {/* Turnaround Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Average Turnaround</span>
          <p className="text-3xl font-extrabold mt-2" style={{ color: T.accentStrong }}>{data.average_turnaround_days} Days</p>
          <span className="text-[9px] block mt-1" style={{ color: T.textFaint }}>Creation to completion</span>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Median Turnaround</span>
          <p className="text-3xl font-extrabold mt-2" style={{ color: T.text }}>{data.median_turnaround_days} Days</p>
          <span className="text-[9px] block mt-1" style={{ color: T.textFaint }}>50th percentile</span>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>90th Percentile</span>
          <p className="text-3xl font-extrabold mt-2" style={{ color: T.text }}>{data.p90_turnaround_days} Days</p>
          <span className="text-[9px] block mt-1" style={{ color: T.textFaint }}>SLA failure threshold</span>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Throughput Class</span>
          <p className={`text-2xl font-extrabold mt-2 ${
            data.throughput_rating === 'Fast' ? 'text-ok' : data.throughput_rating === 'Moderate' ? 'text-warn' : 'text-danger'
          }`}>{data.throughput_rating}</p>
          <span className="text-[9px] block mt-1" style={{ color: T.textFaint }}>Relative performance index</span>
        </div>
      </div>

      {/* Visual Charts and Backlog */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Speed Breakdown Pie */}
        <div className="rounded-xl p-5 shadow-sm flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <h3 className="font-bold text-sm" style={{ color: T.text }}>Delivery Speeds</h3>
            <p className="text-[11px] mb-3" style={{ color: T.textMuted }}>Completed jobs breakdown</p>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={data.speed_breakdown}
                  dataKey="count"
                  nameKey="category"
                  cx="50%" cy="50%"
                  outerRadius={65}
                  label={({ category, percent }) => `${category.split(' ')[0]}: ${(percent * 100).toFixed(0)}%`}
                >
                  {data.speed_breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Backlog age and at risk */}
        <div className="rounded-xl p-5 shadow-sm lg:col-span-2 space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm" style={{ color: T.text }}>Stagnant Backlog Alert Log</h3>
              <p className="text-[11px]" style={{ color: T.textMuted }}>Active jobs exceeding 1.5x average turnaround ({Math.round(data.average_turnaround_days * 1.5)} days)</p>
            </div>
            <div className="bg-danger-tint text-danger px-2 py-1 rounded text-xs font-bold">
              {data.backlog.at_risk_count} At-Risk
            </div>
          </div>

          <div className="overflow-x-auto max-h-52 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="font-semibold uppercase tracking-wider text-[10px]" style={{ background: T.hairlineSoft, color: T.textMuted }}>
                <tr>
                  <th className="px-3 py-2">Job ID</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Days Open</th>
                </tr>
              </thead>
              <tbody>
                {data.backlog.at_risk_jobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6" style={{ color: T.textFaint }}>All active jobs are within standard SLA.</td>
                  </tr>
                ) : (
                  data.backlog.at_risk_jobs.map((j) => (
                    <tr key={j.job_id} style={{ borderTop: `1px solid ${T.hairline}` }}>
                      <td className="px-3 py-2 font-mono font-bold" style={{ color: T.accentStrong }}>#{j.job_id}</td>
                      <td className="px-3 py-2 font-medium truncate max-w-[150px]" title={j.customer_name} style={{ color: T.text }}>{j.customer_name}</td>
                      <td className="px-3 py-2">
                        <span className="bg-accent-tint text-accent-strong px-1.5 py-0.5 rounded text-[10px] font-semibold">{j.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-danger">{j.days_open} days</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 5. ABC Inventory Tab ─────────────────────────────────────────────────────
function renderAbcTab({ abcQuery }) {
  if (abcQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Running Pareto capitalization analysis...</div>;
  if (abcQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error: {abcQuery.error.message}</div>;

  const data = abcQuery.data;
  const sum = data.summary;

  return (
    <div className="space-y-6">
      {/* Pareto summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Category A Card */}
        <div className="rounded-xl p-5 shadow-sm" style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderLeftWidth: 4, borderLeftColor: '#3b82f6' }}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-bold text-accent-strong uppercase tracking-wider">A Items (Top 80% Capital)</span>
              <p className="text-2xl font-extrabold mt-2" style={{ color: T.text }}>{fmt$(sum.a_value)}</p>
            </div>
            <span className="text-xs bg-accent-tint text-accent-strong px-2 py-0.5 rounded font-bold">{sum.a_skus_percentage}% of SKUs</span>
          </div>
          <p className="text-[10px] mt-4" style={{ color: T.textFaint }}>{sum.a_skus_count} SKUs. Represent 80% of total cash valuation.</p>
        </div>

        {/* Category B Card */}
        <div className="rounded-xl p-5 shadow-sm" style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderLeftWidth: 4, borderLeftColor: '#22c55e' }}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-bold text-ok uppercase tracking-wider">B Items (Next 15% Capital)</span>
              <p className="text-2xl font-extrabold mt-2" style={{ color: T.text }}>{fmt$(sum.b_value)}</p>
            </div>
            <span className="text-xs bg-ok-tint text-ok px-2 py-0.5 rounded font-bold">{sum.b_skus_percentage}% of SKUs</span>
          </div>
          <p className="text-[10px] mt-4" style={{ color: T.textFaint }}>{sum.b_skus_count} SKUs. Mid-priority stock buffers.</p>
        </div>

        {/* Category C Card */}
        <div className="rounded-xl p-5 shadow-sm" style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-bold text-accent-strong uppercase tracking-wider">C Items (Bottom 5% Capital)</span>
              <p className="text-2xl font-extrabold mt-2" style={{ color: T.text }}>{fmt$(sum.c_value)}</p>
            </div>
            <span className="text-xs bg-accent-tint text-accent-strong px-2 py-0.5 rounded font-bold">{sum.c_skus_percentage}% of SKUs</span>
          </div>
          <p className="text-[10px] mt-4" style={{ color: T.textFaint }}>{sum.c_skus_count} SKUs. Low-priority stock units.</p>
        </div>
      </div>

      {/* Top Value SKUs Table */}
      <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div>
          <h3 className="font-bold text-sm" style={{ color: T.text }}>Category A SKUs (Capital Concentrations)</h3>
          <p className="text-[11px]" style={{ color: T.textMuted }}>Highly capitalized items requiring precise inventory counts and prompt reorders</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="font-semibold uppercase tracking-wider text-[10px]" style={{ background: T.hairlineSoft, color: T.textMuted }}>
              <tr>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Item Name</th>
                <th className="px-4 py-2.5 text-center">Stock Level</th>
                <th className="px-4 py-2.5 text-right">Unit Cost</th>
                <th className="px-4 py-2.5 text-right">Total Valuation</th>
              </tr>
            </thead>
            <tbody>
              {data.top_a_items.map((item) => (
                <tr key={item.sku} style={{ borderTop: `1px solid ${T.hairline}` }}>
                  <td className="px-4 py-2.5 font-mono font-bold" style={{ color: T.accentStrong }}>{item.sku}</td>
                  <td className="px-4 py-2.5 font-medium truncate max-w-xs" style={{ color: T.text }}>{item.name}</td>
                  <td className="px-4 py-2.5 text-center font-semibold" style={{ color: T.textMuted }}>{item.stock}</td>
                  <td className="px-4 py-2.5 text-right" style={{ color: T.textMuted }}>{fmt$(item.unit_cost)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-accent-strong">{fmt$(item.stock_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 6. Customer Churn Tab ────────────────────────────────────────────────────
function renderChurnTab({ churnQuery }) {
  if (churnQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Loading churn logs...</div>;
  if (churnQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error: {churnQuery.error.message}</div>;

  const data = churnQuery.data;
  const sum = data.summary;

  return (
    <div className="space-y-6">
      {/* Customer retention metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Analysed Accounts</span>
          <p className="text-3xl font-extrabold mt-2" style={{ color: T.text }}>{sum.total_active_customers}</p>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
          <span className="text-[10px] text-danger font-bold uppercase tracking-wider">High Risk Churn (&gt;120d)</span>
          <p className="text-3xl font-extrabold text-danger mt-2">{sum.high_risk_count}</p>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
          <span className="text-[10px] text-warn font-bold uppercase tracking-wider">At Risk Inactive (60-120d)</span>
          <p className="text-3xl font-extrabold text-warn mt-2">{sum.at_risk_count}</p>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Never Ordered</span>
          <p className="text-3xl font-extrabold mt-2" style={{ color: T.textMuted }}>{sum.never_ordered_count}</p>
        </div>
      </div>

      {/* Customer Risk Details */}
      <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div>
          <h3 className="font-bold text-sm" style={{ color: T.text }}>High Risk Accounts (Requires Immediate Follow-up)</h3>
          <p className="text-[11px]" style={{ color: T.textMuted }}>Active accounts exceeding 120 days since last order date</p>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs text-left">
            <thead className="font-semibold uppercase tracking-wider text-[10px]" style={{ background: T.hairlineSoft, color: T.textMuted }}>
              <tr>
                <th className="px-4 py-2.5">Client ID</th>
                <th className="px-4 py-2.5">Client Name</th>
                <th className="px-4 py-2.5 text-center">Last Order Date</th>
                <th className="px-4 py-2.5 text-center">Days Inactive</th>
                <th className="px-4 py-2.5 text-right">LTV Sales</th>
              </tr>
            </thead>
            <tbody>
              {data.high_risk_customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6" style={{ color: T.textFaint }}>All active clients have ordered recently.</td>
                </tr>
              ) : (
                data.high_risk_customers.map((c) => (
                  <tr key={c.customer_id} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-4 py-2.5 font-mono font-bold" style={{ color: T.accentStrong }}>{c.customer_id}</td>
                    <td className="px-4 py-2.5 font-medium" style={{ color: T.text }}>{c.customer_name}</td>
                    <td className="px-4 py-2.5 text-center" style={{ color: T.textMuted }}>{c.last_order_date || '—'}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-danger">{c.days_inactive} days</td>
                    <td className="px-4 py-2.5 text-right font-bold" style={{ color: T.text }}>{fmt$(c.ltv_spend)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 7. Pricing & Margins Tab ─────────────────────────────────────────────────
function renderMarginsTab({ marginsQuery }) {
  if (marginsQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Loading margin analyses...</div>;
  if (marginsQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error: {marginsQuery.error.message}</div>;

  const data = marginsQuery.data;
  const sum = data.summary;

  return (
    <div className="space-y-6">
      {/* Summary figures */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Billed Revenue ex GST</span>
          <p className="text-2xl font-bold mt-2" style={{ color: T.accentStrong }}>{fmt$(sum.total_ex_gst)}</p>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Median Order Value</span>
          <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>{fmt$(sum.median_job_value)}</p>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Average Order Value</span>
          <p className="text-2xl font-bold mt-2" style={{ color: T.text }}>{fmt$(sum.avg_job_value)}</p>
        </div>

        <div className="rounded-xl p-4 shadow-sm text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Max Order Billed</span>
          <p className="text-2xl font-bold mt-2" style={{ color: T.ok }}>{fmt$(sum.max_job_value)}</p>
        </div>
      </div>

      {/* Grid of charts and tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Price Distribution Bracket chart */}
        <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h3 className="font-bold text-sm" style={{ color: T.text }}>Order Value Distribution Bins</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.price_distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bracket" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Revenue Concentration */}
        <div className="rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div>
            <h3 className="font-bold text-sm" style={{ color: T.text }}>Top Customer Billed Concentration</h3>
            <p className="text-[11px]" style={{ color: T.textMuted }}>Revenue contribution percentage by account manager/client</p>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={data.top_customers.slice(0, 5)}
                  dataKey="revenue"
                  nameKey="customer_name"
                  cx="50%" cy="50%"
                  outerRadius={70}
                  label={({ customer_name, revenue_share_percentage }) => `${customer_name.substring(0, 10)}: ${revenue_share_percentage}%`}
                >
                  {data.top_customers.slice(0, 5).map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmt$(v)} />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 8. Anomaly Reports Tab ───────────────────────────────────────────────────
function renderAnomaliesTab({ anomaliesQuery }) {
  if (anomaliesQuery.isLoading) return <div className="text-center py-20 text-sm" style={{ color: T.textFaint }}>Processing stock movement and revenue histories...</div>;
  if (anomaliesQuery.isError) return <div className="p-4 rounded-lg" style={{ background: T.dangerTint, color: T.danger }}>Error: {anomaliesQuery.error.message}</div>;

  const data = anomaliesQuery.data;
  const stock = data.stock_consumption_anomalies || [];
  const revenue = data.revenue_anomalies || [];
  const stagnant = data.stagnant_jobs || [];

  return (
    <div className="space-y-6">
      {/* Stock Anomalies */}
      <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-sm" style={{ color: T.text }}>Stock Consumption Spikes (Z-Score &gt; 2.0σ)</h3>
            <p className="text-[11px]" style={{ color: T.textMuted }}>Consumption outflows that deviate significantly from historical standard deviation levels</p>
          </div>
          <span className="bg-danger-tint text-danger px-2 py-0.5 rounded text-xs font-bold font-mono">
            {stock.length} Spikes
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="font-semibold uppercase tracking-wider text-[10px]" style={{ background: T.hairlineSoft, color: T.textMuted }}>
              <tr>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Item Name</th>
                <th className="px-4 py-2.5 text-center">Recent Outflow</th>
                <th className="px-4 py-2.5 text-center">Avg Outflow</th>
                <th className="px-4 py-2.5 text-right">Z-Score Deviation</th>
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6" style={{ color: T.textFaint }}>No stock anomalies detected.</td>
                </tr>
              ) : (
                stock.map((item) => (
                  <tr key={item.sku} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-4 py-2.5 font-mono font-bold" style={{ color: T.accentStrong }}>{item.sku}</td>
                    <td className="px-4 py-2.5 font-medium truncate max-w-xs" style={{ color: T.text }}>{item.name}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-danger">{item.recent_outflow} pcs</td>
                    <td className="px-4 py-2.5 text-center" style={{ color: T.textMuted }}>{item.avg_outflow} pcs</td>
                    <td className="px-4 py-2.5 text-right font-extrabold text-danger">+{item.z_score} σ</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue Anomalies */}
      <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-sm" style={{ color: T.text }}>Monthly Revenue Outliers (Z-Score &gt; 2.0σ)</h3>
            <p className="text-[11px]" style={{ color: T.textMuted }}>Monthly invoice aggregates that deviate significantly from baseline standard deviation</p>
          </div>
          <span className="bg-danger-tint text-danger px-2 py-0.5 rounded text-xs font-bold font-mono">
            {revenue.length} Outliers
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="font-semibold uppercase tracking-wider text-[10px]" style={{ background: T.hairlineSoft, color: T.textMuted }}>
              <tr>
                <th className="px-4 py-2.5">Month</th>
                <th className="px-4 py-2.5">Aggregate Revenue</th>
                <th className="px-4 py-2.5 text-center">Type</th>
                <th className="px-4 py-2.5 text-right">Z-Score Deviation</th>
              </tr>
            </thead>
            <tbody>
              {revenue.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-6" style={{ color: T.textFaint }}>All historical monthly revenues are within normal variance.</td>
                </tr>
              ) : (
                revenue.map((item, idx) => (
                  <tr key={idx} style={{ borderTop: `1px solid ${T.hairline}` }}>
                    <td className="px-4 py-2.5 font-bold" style={{ color: T.text }}>{item.month}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: T.text }}>{fmt$(item.revenue)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        item.type === 'spike' ? 'bg-ok-tint text-ok' : 'bg-danger-tint text-danger'
                      }`}>{item.type.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-extrabold text-danger">{item.z_score} σ</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
