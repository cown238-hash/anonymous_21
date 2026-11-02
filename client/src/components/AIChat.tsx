import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Minimize2, Maximize2, Bot, X } from 'lucide-react';
import { askAI, type AIMessage, formatAITime } from '../lib/ai';

/**
 * AIChat — ผู้ช่วยแชทแบบลอยตัวมุมขวาล่าง
 * เปิด/ปิดด้วยปุ่มหัวลูกศร คุยกับ AI เกี่ยวกับการใช้เว็บไซต์ WKSL
 */
export function AIChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      role: 'assistant',
      content: 'สวัสดีครับ! ฉันคือผู้ช่วย AI ของ WKSL ถามอะไรก็ได้เกี่ยวกับเว็บไซต์ครับ',
      createdAt: new Date(),
    },
  ]);
  const [typing, setTyping] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const addMessage = useCallback((role: AIMessage['role'], content: string) => {
    const msg: AIMessage = { role, content, createdAt: new Date() };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    const userMsg = addMessage('user', text);
    setTyping(true);

    try {
      const reply = await askAI([...messages, userMsg]);
      setTyping(false);
      addMessage('assistant', reply);
    } catch {
      setTyping(false);
      addMessage('assistant', 'ขออภัยครับ ระบบ AI ขัดข้องชั่วคราว ลองใหม่อีกครั้งนะครับ');
    }
  }, [input, messages, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* ---------- ปุ่มเปิด/ปิด ---------- */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex items-center justify-center rounded-full bg-brand-500 p-3 text-black shadow-lg hover:bg-brand-400 transition"
          aria-label="เปิดผู้ช่วย AI"
        >
          <Bot size={20} />
          <span
            className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-black"
          >
            AI
          </span>
        </button>
      )}

      {/* ---------- แชทบอร์ด ---------- */}
      {open && (
        <div className="w-80 h-[500px] flex flex-col rounded-2xl border border-ink-500/20 bg-surface-1 shadow-2xl flex-shrink-0">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-xl border-b border-ink-500/12 bg-surface-1 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Bot size={18} className="text-brand-400" />
              <div>
                <div className="text-sm font-semibold text-ink-900">ผู้ช่วย AI</div>
                <div className="text-[11px] text-ink-500">พร้อมตอบคำถาม</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMinimized((v) => !v)}
                className="p-1.5 rounded hover:bg-surface-2 transition"
                aria-label={minimized ? 'ขยาย' : 'ย่อ'}
                title={minimized ? 'ขยายแชท' : 'ย่อแชท'}
              >
                {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-surface-2 transition text-ink-500"
                aria-label="ปิดแชท AI"
                title="ปิด"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className={`flex-1 overflow-y-auto p-4 space-y-4 ${minimized ? 'hidden' : ''}`}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={clsx(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed break-words shadow-sm',
                    msg.role === 'user'
                      ? 'bg-brand-500 text-black rounded-tr-none'
                      : 'bg-surface-2 text-ink-900 border border-ink-500/15 rounded-tl-none',
                  )}
                >
                  {msg.content}
                  <div className="mt-1 text-[10px] text-ink-400 text-right">
                    {formatAITime(msg.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-surface-2 border border-ink-500/15 rounded-xl px-3 py-2 text-sm text-ink-500 max-w-[70%]">
                  กำลังพิมพ์<span className="animate-pulse inline-block">…</span>
                </div>
              </div>
            )}
            <div ref={msgsEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-ink-500/12 bg-surface-1 p-3 ${minimized ? 'hidden' : ''}">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ถามอะไรก็ได้เกี่ยวกับ WKSL…"
                className="w-full rounded-xl border border-ink-500/18 bg-surface-2 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/15 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={typing}
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-brand-500 px-2.5 py-1.5 text-black text-sm font-medium hover:bg-brand-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="ส่งข้อความ"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function clsx(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}
