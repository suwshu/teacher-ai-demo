import { NextRequest } from "next/server";
import OpenAI from "openai";
import teachersData from "../../../public/teachers_index.json";

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

const teachersCache: Teacher[] = teachersData as Teacher[];

function loadTeachers(): Teacher[] {
  return teachersCache;
}

function searchTeachers(query: string, teachers: Teacher[]): Teacher[] {
  // 中文分词：按字拆分 + 按词拆分（2-4字的子串）
  const chars = query.split("");
  const words: string[] = [];
  for (let len = 2; len <= 6; len++) {
    for (let i = 0; i <= query.length - len; i++) {
      words.push(query.slice(i, i + len));
    }
  }
  const keywords = [...new Set([...chars, ...words])].filter((k) => k.trim().length > 0);

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

const SYSTEM_PROMPT = `你是一个专业的讲师库AI助手，帮助企业培训运营人员快速找到合适的讲师。

【重要规则】
- 如果上下文中提供了讲师资料，你必须直接基于这些资料推荐讲师，不得说"没有数据"或"需要技术对接"
- 直接推荐，不要反复追问细节，用户可以在看到推荐后再追问
- 每位讲师单独列出：姓名、核心背景、擅长课题、推荐理由
- 语言简洁专业，用中文回答
- 如果没有找到相关讲师资料，才可以说暂无匹配，并请用户换个关键词`;

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
