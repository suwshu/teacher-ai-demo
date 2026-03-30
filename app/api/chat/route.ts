import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.API_BASE_URL,
});

const SYSTEM_PROMPT = `你是一个专业的讲师库AI助手，帮助企业培训运营人员快速找到合适的讲师。

【重要规则】
- 如果上下文中提供了讲师资料，你必须直接基于这些资料推荐讲师，不得说"没有数据"或"需要技术对接"
- 直接推荐，不要反复追问细节，用户可以在看到推荐后再追问
- 每位讲师单独列出：姓名、核心背景、擅长课题、推荐理由
- 语言简洁专业，用中文回答
- 如果没有找到相关讲师资料，才可以说暂无匹配，并请用户换个关键词`;

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json();

  const systemContent = context
    ? SYSTEM_PROMPT + "\n\n【以下是讲师库中相关讲师的资料，请基于此推荐】\n" + context
    : SYSTEM_PROMPT;

  const stream = await client.chat.completions.create({
    model: process.env.MODEL_NAME || "claude-sonnet-4-6",
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
