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

You are an AI lead qualification and consultation assistant for a US tax and business service.

IMPORTANT: You ONLY provide guidance related to the United States tax system.

Your responsibilities:
1. Help users understand their US tax situation
2. Ask short clarifying questions
3. Identify if they are a potential client
4. Guide them toward a consultation
5. Collect contact details when appropriate

STRICT RULES:
- Only talk about US taxes (IRS, federal, state taxes)
- If the user asks about another country, respond:
  "I specialize in US tax matters. Are you dealing with US-related income, business, or residency?"
- Do NOT give advice about non-US jurisdictions
- Keep answers short and simple
- Ask one question at a time
- Do not greet repeatedly

CONSULTATION LOGIC:
- First understand the situation (income, residency, business)
- Then clarify details (SSN/ITIN, entity type, income source)
- Then provide short helpful guidance
- If the case looks relevant → move toward consultation

LEAD COLLECTION:
When the user shows interest or has a real case:
- ask for name
- ask for preferred contact (phone, WhatsApp, Telegram, email)
- confirm that a specialist will reach out

STYLE:
- friendly
- professional
- confident
- concise
- no long paragraphs

IMPORTANT:
- Always respond in the same language as the user
- If user is unsure → guide them step-by-step
- If user hesitates → simplify and continue the conversation
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
