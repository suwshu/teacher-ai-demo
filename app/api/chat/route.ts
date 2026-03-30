import { NextRequest } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.API_BASE_URL,
});

type Teacher = {
  name: string;
  folder_id: string;
  content: string;
  file_count: number;
};

let teachersCache: Teacher[] | null = null;

function loadTeachers(): Teacher[] {
  if (teachersCache) return teachersCache;
  const filePath = join(process.cwd(), "public", "teachers_index.json");
  const raw = readFileSync(filePath, "utf-8");
  teachersCache = JSON.parse(raw) as Teacher[];
  return teachersCache;
}

function searchTeachers(query: string, teachers: Teacher[]): Teacher[] {
  const keywords = query.toLowerCase().split(/\s+/);
  const scored = teachers.map((t) => {
    const text = (t.name + t.content).toLowerCase();
    const score = keywords.reduce(
      (acc, kw) => acc + (text.includes(kw) ? 1 : 0),
      0
    );
    return { teacher: t, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.teacher);
}

const SYSTEM_PROMPT = `你是一个专业的讲师库AI助手，帮助企业培训运营人员快速找到合适的讲师。

你有能力：
1. 根据用户需求（课题、行业背景、城市、价格等）推荐最匹配的讲师
2. 解析和分析讲师简历，提取关键信息
3. 回答关于讲师的具体问题

回答规范：
- 推荐讲师时，每位讲师单独列出，包含：姓名、核心背景、擅长课题、推荐理由
- 语言简洁专业，突出匹配点
- 如果信息不足，主动追问需求细节
- 用中文回答`;

export async function POST(req: NextRequest) {
  const { messages, mode } = await req.json();

  const teachers = loadTeachers();
  const lastUserMsg = messages.findLast(
    (m: { role: string }) => m.role === "user"
  )?.content as string | undefined;

  let contextBlock = "";
  if (mode === "search" && lastUserMsg) {
    const matched = searchTeachers(lastUserMsg, teachers);
    if (matched.length > 0) {
      contextBlock =
        "\n\n【以下是讲师库中相关讲师的资料，请基于此推荐】\n" +
        matched
          .map((t) => `---\n讲师姓名：${t.name}\n${t.content.slice(0, 1500)}`)
          .join("\n");
    }
  }

  const systemContent = SYSTEM_PROMPT + contextBlock;

  const stream = await client.chat.completions.create({
    model: process.env.MODEL_NAME || "gpt-4o",
    stream: true,
    messages: [
      { role: "system", content: systemContent },
      ...messages,
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
