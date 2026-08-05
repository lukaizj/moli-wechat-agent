import OpenAI from "openai";

export function deepSeekClientOptions(config) {
  return {
    apiKey: config.deepseekApiKey,
    baseURL: config.deepseekBaseUrl || "https://api.deepseek.com",
  };
}

export function deepSeekRequestBody({ prompt, schema, config }) {
  return {
    model: config.deepseekModel || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: "你是严谨的中文内容编辑。只输出一个符合 JSON Schema 的 JSON 对象，不使用 Markdown 代码块。",
      },
      {
        role: "user",
        content: `${prompt}\n\nJSON Schema：\n${JSON.stringify(schema)}`,
      },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    max_tokens: config.deepseekMaxTokens || 8192,
  };
}

export function parseDeepSeekJson(content) {
  if (!content?.trim()) throw new Error("DeepSeek 返回了空内容");
  return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

export async function runDeepSeekStructured({ prompt, schema, config }) {
  const client = new OpenAI(deepSeekClientOptions(config));
  try {
    const response = await client.chat.completions.create(deepSeekRequestBody({ prompt, schema, config }));
    return parseDeepSeekJson(response.choices[0]?.message?.content);
  } catch (error) {
    const detail = error?.error?.message || error?.message || String(error);
    throw new Error(`DeepSeek 内容引擎运行失败：${detail}`);
  }
}
