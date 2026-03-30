"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Mode = "search" | "intake";

type Teacher = {
  name: string;
  folder_id: string;
  content: string;
  file_count: number;
};

const PLACEHOLDER = {
  search: "例如：找一个能给银行中高层讲数字化转型的讲师，最好有大厂背景，在华东地区…",
  intake: "请描述新讲师信息，或直接粘贴简历文本，AI将自动提取并整理成标准档案…",
};

const WELCOME = {
  search: "你好！我是讲师库AI助手。\n\n请告诉我你的需求，比如课题方向、行业背景、授课城市、价格区间等，我会从 **491位讲师** 中为你精准推荐。",
  intake: "你好！请把新讲师的简历文本粘贴进来，或描述讲师的基本信息。\n\nAI将自动提取：姓名、背景、擅长课题、代表客户、报价等关键字段，生成标准化档案。",
};

function searchTeachers(query: string, teachers: Teacher[]): Teacher[] {
  const words: string[] = [];
  for (let len = 2; len <= 6; len++) {
    for (let i = 0; i <= query.length - len; i++) {
      words.push(query.slice(i, i + len));
    }
  }
  const keywords = [...new Set([...query.split(""), ...words])].filter(
    (k) => k.trim().length > 0
  );

  const scored = teachers.map((t) => {
    const text = t.name + t.content;
    const score = keywords.reduce(
      (acc, kw) => acc + (text.includes(kw) ? kw.length : 0),
      0
    );
    return { teacher: t, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.teacher);
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("search");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 页面加载时从public目录获取讲师数据
  useEffect(() => {
    fetch("/teachers_index.json")
      .then((r) => r.json())
      .then((data: Teacher[]) => setTeachers(data))
      .catch(() => console.error("讲师数据加载失败"));
  }, []);

  useEffect(() => {
    setMessages([{ role: "assistant", content: WELCOME[mode] }]);
    setInput("");
  }, [mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // 在前端做搜索，把匹配结果传给API
      let context = "";
      if (mode === "search" && teachers.length > 0) {
        const matched = searchTeachers(text, teachers);
        if (matched.length > 0) {
          context = matched
            .map((t) => `---\n讲师姓名：${t.name}\n${t.content.slice(0, 1500)}`)
            .join("\n");
        }
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, context }),
      });

      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: aiText };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，请求出现错误，请稍后重试。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function formatContent(text: string) {
    return text.split("\n").map((line, i, arr) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: bold }} />
          {i < arr.length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col" style={{ fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black font-bold text-sm">
            师
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide">讲师库 AI 助手</h1>
            <p className="text-xs text-white/40">
              {teachers.length > 0 ? `${teachers.length}位讲师 · 智能检索与管理` : "数据加载中…"}
            </p>
          </div>
        </div>
        <div className="flex bg-white/5 rounded-lg p-1 gap-1">
          <button
            onClick={() => setMode("search")}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === "search" ? "bg-amber-400 text-black" : "text-white/50 hover:text-white/80"
            }`}
          >
            检索讲师
          </button>
          <button
            onClick={() => setMode("intake")}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === "intake" ? "bg-amber-400 text-black" : "text-white/50 hover:text-white/80"
            }`}
          >
            录入讲师
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        <div className="flex flex-col gap-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
                  msg.role === "user"
                    ? "bg-white/10 text-white/60"
                    : "bg-gradient-to-br from-amber-400 to-orange-500 text-black"
                }`}
              >
                {msg.role === "user" ? "我" : "AI"}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                  msg.role === "user"
                    ? "bg-white/10 text-white/90 rounded-tr-sm"
                    : "bg-white/5 text-white/85 rounded-tl-sm"
                }`}
              >
                {msg.content ? (
                  formatContent(msg.content)
                ) : (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-amber-400/50 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={PLACEHOLDER[mode]}
              rows={1}
              className="w-full bg-transparent text-sm text-white/90 placeholder-white/25 resize-none outline-none leading-6 max-h-32"
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 128) + "px";
              }}
            />
          </div>
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L8 14M8 2L3 7M8 2L13 7" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="text-center text-white/20 text-xs mt-3">按 Enter 发送 · Shift+Enter 换行</p>
      </div>
    </div>
  );
}
