import { useState } from 'react';
import { Bot, Copy, RefreshCw, Send, User, X } from 'lucide-react';
import * as api from '../../api';

export default function AIAssistantPanel({ aiClaudeEnabled, aiDragOffset, aiEndRef, aiInput, aiLoading, aiMessages, aiPanelRef, customers, inventory, jobs, sendAiMessage, setAiInput, setAiLoading, setAiMessages, suppliers }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPos, setAiPos] = useState(null);

  const parseMarkdown = (text) => {
    const lines = (text || '').split('\n');
    return lines.map((line, i) => {
      const renderInline = (str) => {
        const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
        return parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
          if (p.startsWith('*') && p.endsWith('*')) return <em key={j}>{p.slice(1, -1)}</em>;
          return p;
        });
      };
      if (!line.trim()) return <div key={i} className="h-1.5" />;
      const bulletMatch = line.match(/^(\s*)[•-]\s(.+)/);
      if (bulletMatch) {
        const indent = bulletMatch[1].length;
        return (
          <div key={i} className="flex text-xs leading-relaxed" style={{ paddingLeft: indent * 6 }}>
            <span className="mr-1.5 text-accent flex-shrink-0">•</span>
            <span>{renderInline(bulletMatch[2])}</span>
          </div>
        );
      }
      if (line.startsWith('→')) {
        return <div key={i} className="text-xs text-accent-strong mt-1 font-medium">{renderInline(line)}</div>;
      }
      return <div key={i} className="text-xs leading-relaxed">{renderInline(line)}</div>;
    });
  };

  const quickChips = [
    { label: '📋 Daily briefing', msg: 'daily briefing' },
    { label: '📈 Revenue forecast', msg: 'forecast next month revenue' },
    { label: '⚠ Overdue jobs', msg: 'show overdue jobs' },
    { label: '📦 Low stock', msg: 'low stock alert' },
    { label: '🔍 Anomalies', msg: 'show anomalies unusual activity' },
    { label: '👥 Churn risk', msg: 'customer churn risk analysis' },
    { label: '📊 ABC analysis', msg: 'abc pareto analysis' },
    { label: '💰 Margin analysis', msg: 'margin profit analysis' },
    { label: '📅 DSO', msg: 'days sales outstanding receivables' },
    { label: '⏱ Turnaround', msg: 'job turnaround time' },
    { label: '📆 Seasonality', msg: 'seasonality trends' },
  ];

  const sendChip = async (msg) => {
    if (aiLoading) return;
    setAiMessages(prev => [...prev, { role: 'user', text: msg, ts: new Date() }]);
    setAiLoading(true);
    try {
      const ctx = `Jobs:${jobs.length},LowStock:${inventory.filter(i=>i.stock<=i.reorderLevel).length},Customers:${customers.length},Suppliers:${suppliers.length}`;
      const res = await api.ai.chat(msg, ctx);
      setAiMessages(prev => [...prev, { role: 'assistant', text: res.response, ts: new Date() }]);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}`, ts: new Date() }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const onHeaderMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    const panel = aiPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    aiDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const onMove = (mv) => setAiPos({ x: mv.clientX - aiDragOffset.current.x, y: mv.clientY - aiDragOffset.current.y });
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const panelStyle = aiPos
    ? { position: 'fixed', left: aiPos.x, top: aiPos.y, bottom: 'auto', right: 'auto', zIndex: 50, width: 440, height: 560 }
    : { position: 'fixed', bottom: 96, right: 24, zIndex: 50, width: 440, height: 560 };

  return (
    <>
      <button
        onClick={() => setAiOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-accent-strong hover:bg-accent-strong text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
        title="AI Assistant"
      >
        <Bot className="w-6 h-6" />
        {!aiOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-ok rounded-full text-[9px] flex items-center justify-center font-bold">ML</span>
        )}
      </button>
      {aiOpen && (
        <div ref={aiPanelRef} style={panelStyle} className="bg-white rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
          {/* Header */}
          <div
            onMouseDown={onHeaderMouseDown}
            className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-accent-strong to-accent-strong text-white rounded-t-2xl select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-sm leading-none flex items-center gap-1.5">
                  TIG AI Assistant
                  {aiClaudeEnabled && (
                    <span className="text-[9px] bg-accent-strong text-accent-strong px-1.5 py-0.5 rounded-full font-bold leading-none">Claude</span>
                  )}
                </div>
                <div className="text-[10px] text-accent mt-0.5">
                  {aiClaudeEnabled ? 'Powered by Claude · ML analytics' : 'Live data · ML analytics'}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setAiMessages([{ role: 'assistant', text: 'Conversation cleared. How can I help?', ts: new Date() }])}
                className="w-6 h-6 rounded hover:bg-white/20 flex items-center justify-center text-accent hover:text-white"
                title="Clear chat"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setAiOpen(false)} className="w-6 h-6 rounded hover:bg-white/20 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick chips */}
          <div className="px-3 py-2 border-b bg-panel-alt flex flex-wrap gap-1">
            {quickChips.map(chip => (
              <button
                key={chip.label}
                onClick={() => sendChip(chip.msg)}
                disabled={aiLoading}
                className="text-[10px] px-2 py-1 rounded-full bg-accent-tint text-accent-strong border border-accent hover:bg-accent-tint disabled:opacity-40 transition-colors font-medium"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-accent-tint flex items-center justify-center flex-shrink-0 mb-0.5">
                    <Bot className="w-3.5 h-3.5 text-accent-strong" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5" style={{ maxWidth: '82%' }}>
                  <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-accent-strong text-white rounded-br-sm'
                        : 'bg-hairline-soft text-fg rounded-bl-sm'
                    }`}>
                    {msg.role === 'assistant' ? parseMarkdown(msg.text) : msg.text}
                  </div>
                  <div className={`flex items-center gap-1.5 px-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.ts && <span className="text-[9px] text-faint">{fmtTime(msg.ts)}</span>}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => copyToClipboard(msg.text)}
                        className="text-[9px] text-faint hover:text-muted flex items-center gap-0.5 transition-colors"
                        title="Copy"
                      >
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-accent-strong flex items-center justify-center flex-shrink-0 mb-0.5">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-end gap-1.5">
                <div className="w-6 h-6 rounded-full bg-accent-tint flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-accent-strong" />
                </div>
                <div className="bg-hairline-soft px-3 py-2.5 rounded-2xl rounded-bl-sm">
                  <div className="flex space-x-1">
                    <span className="w-1.5 h-1.5 bg-accent-strong rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-accent-strong rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-accent-strong rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={aiEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t bg-white">
            <div className="flex space-x-2 items-center">
              <input
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendAiMessage()}
                placeholder="Ask about jobs, revenue, stock, forecasts…"
                className="flex-1 border border-hairline rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent-focus bg-panel-alt"
              />
              <button
                onClick={sendAiMessage}
                disabled={aiLoading || !aiInput.trim()}
                className="w-8 h-8 flex-shrink-0 bg-accent-strong text-white rounded-xl flex items-center justify-center hover:bg-accent-strong disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
