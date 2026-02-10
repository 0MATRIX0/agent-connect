'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, User, Bot, ChevronDown, ChevronRight, ClipboardCopy, ArrowDown } from 'lucide-react';
import IconButton from '../ui/IconButton';
import StatusDot from '../ui/StatusDot';
import type { Session } from '../../hooks/useSessionMonitor';

interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; input?: string; result?: string }[];
  timestamp?: string;
}

function parseTranscript(raw: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  const lines = raw.split('\n').filter(l => l.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Skip non-message entries
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;
      if (!entry.message) continue;

      const role = entry.message.role as 'user' | 'assistant';
      if (role !== 'user' && role !== 'assistant') continue;

      const content = entry.message.content;
      let textContent = '';
      const toolCalls: TranscriptMessage['toolCalls'] = [];

      if (typeof content === 'string') {
        textContent = content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            textContent += (textContent ? '\n' : '') + block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              name: block.name,
              input: typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input, null, 2),
            });
          } else if (block.type === 'tool_result') {
            // Attach result to last tool call if possible
            const resultText = Array.isArray(block.content)
              ? block.content.map((c: any) => c.text || '').join('\n')
              : typeof block.content === 'string' ? block.content : '';
            if (toolCalls.length > 0) {
              toolCalls[toolCalls.length - 1].result = resultText;
            }
          }
        }
      }

      // Skip empty messages
      if (!textContent && toolCalls.length === 0) continue;

      messages.push({
        role,
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: entry.timestamp,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

function ToolCallBlock({ tool }: { tool: NonNullable<TranscriptMessage['toolCalls']>[number] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
        }
        <span className="text-[11px] font-mono text-sky-400/80">{tool.name}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-2 border-t border-white/5">
          {tool.input && (
            <div>
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Input</span>
              <pre className="text-[11px] text-gray-400 font-mono mt-0.5 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {tool.input.length > 2000 ? tool.input.slice(0, 2000) + '\n...(truncated)' : tool.input}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Result</span>
              <pre className="text-[11px] text-gray-400 font-mono mt-0.5 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {tool.result.length > 2000 ? tool.result.slice(0, 2000) + '\n...(truncated)' : tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: TranscriptMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-sky-500/10' : 'bg-purple-500/10'
      }`}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-sky-400" />
          : <Bot className="w-3.5 h-3.5 text-purple-400" />
        }
      </div>

      {/* Content */}
      <div className={`max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-xl px-3.5 py-2.5 ${
          isUser
            ? 'bg-sky-500/10 border border-sky-500/20'
            : 'bg-white/5 border border-white/10'
        }`}>
          {message.content && (
            <div className="text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </div>
          )}
          {message.toolCalls?.map((tool, i) => (
            <ToolCallBlock key={i} tool={tool} />
          ))}
        </div>
        {message.timestamp && (
          <span className={`text-[10px] text-gray-600 mt-1 block ${isUser ? 'text-right' : 'text-left'}`}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

interface ConversationPaneProps {
  session: Session;
}

export default function ConversationPane({ session }: ConversationPaneProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchTranscript() {
      try {
        const res = await fetch(`/api/sessions/${session.id}/transcript`);
        if (!res.ok) {
          setError('Failed to load transcript');
          return;
        }
        const data = await res.json();
        const parsed = parseTranscript(data.transcript || '');
        setMessages(parsed);
      } catch {
        setError('Failed to load transcript');
      } finally {
        setLoading(false);
      }
    }
    fetchTranscript();
  }, [session.id]);

  function handleCopy() {
    const text = messages.map(m => {
      const prefix = m.role === 'user' ? 'User' : 'Assistant';
      return `${prefix}: ${m.content}`;
    }).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 200);
  }

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }

  return (
    <div className="flex flex-col h-full bg-obsidian relative">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 h-10 bg-void/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <MessageSquare className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <span className="text-sm font-medium text-white truncate">{session.projectName}</span>
          <span className="text-[10px] text-gray-600 font-mono truncate hidden sm:inline">{session.projectPath}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            icon={ClipboardCopy}
            label={copySuccess ? 'Copied!' : 'Copy conversation'}
            variant={copySuccess ? 'success' : 'default'}
            onClick={handleCopy}
            size="sm"
          />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ minHeight: 0 }}
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-sm">Loading conversation...</div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-rose-400 text-sm">{error}</div>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-sm">No messages in this conversation</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-12 right-4 p-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 hover:bg-white/15 transition-colors"
        >
          <ArrowDown className="w-4 h-4 text-gray-300" />
        </button>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 h-7 bg-void/60 backdrop-blur-xl border-t border-white/5 flex-shrink-0">
        <span className="text-[10px] text-gray-600 font-mono">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-gray-600 font-mono">
          {session.startedAt ? new Date(session.startedAt).toLocaleString() : ''}
        </span>
      </div>
    </div>
  );
}
