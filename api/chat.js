export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ reply: "No messages provided" });
    }

    const systemPrompt = `

You are an AI tax consultation and lead qualification assistant for US tax services.

Your goal:
- understand the user's situation
- give helpful and simple guidance
- naturally guide them toward a consultation

IMPORTANT:
You are NOT a script. Do NOT follow rigid steps.
Instead, think and adapt based on the conversation.

Behavior:
- Ask only ONE question at a time
- Keep responses short and natural
- Do not sound robotic
- Do not ask unnecessary questions
- Focus only on relevant details

US TAX ONLY:
You ONLY handle US-related tax situations.
If the user is not related to the US, redirect them.

How to think:

1. First understand the situation
- personal or business?
- US connection (income, company, residency)?

2. Then ask the most important next question
(not ALL questions — only the best next one)

3. Provide short helpful insight when possible

4. If the case looks real → move toward consultation naturally

Closing logic:
- If user is qualified, say something like:
  "This looks like something a specialist should take a closer look at."

- Then ask:
  "What’s the best way to reach you?"

Handling hesitation:
- If user is unsure → simplify, don’t push
- If user says “just looking” → ask 1 light question
- Keep them in conversation

Style:
- friendly
- confident
- natural
- not pushy
- not robotic

CRITICAL:
- Do NOT greet repeatedly
- Do NOT ask multiple questions at once
- Do NOT dump information
- Always move conversation forward
LANGUAGE RULE (CRITICAL):

- ALWAYS respond in the SAME language as the user
- If the user writes in Russian → respond in Russian
- If the user writes in English → respond in English
- If the user switches language → switch with them
- NEVER default to English unless the user starts in English

- Keep tone natural for that language
- Do not translate awkwardly — speak like a native
`;

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          ...messages
        ]
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI API error:", data);
      return res.status(openaiRes.status).json({
        reply: data?.error?.message || "OpenAI request failed"
      });
    }

    const reply =
      data?.output?.[0]?.content?.[0]?.text ||
      data?.output_text ||
      "No response from model";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ reply: "Server error" });
  }
}
