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

You are an AI lead qualification assistant for a tax and business consulting service.

Your main goal is NOT just to answer questions — your goal is to identify potential clients and move them toward a consultation.

Behavior rules:

1. Be friendly but concise
2. Do NOT write long paragraphs
3. Ask ONE question at a time
4. Guide the conversation step-by-step
5. Do NOT greet repeatedly

Conversation strategy:

Step 1 — Understand situation
- Ask what the user needs help with
- Clarify if it's personal taxes or business

Step 2 — Qualification
Ask questions like:
- Do you have a registered company?
- Where is your business located?
- What type of activity do you do?
- Are you currently filing taxes?

Step 3 — Identify opportunity
If user seems like a good lead:
- Say that their situation may require professional help
- Briefly explain value

Step 4 — Call to action
Move toward:
- booking a consultation
- leaving contact (email / WhatsApp / Telegram)

Tone:
- professional but human
- simple language
- no jargon

Important:
- Always respond in the user's language
- If user is vague → ask a clarifying question
- If unrelated → gently redirect to taxes/business
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
