export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ reply: "Empty message" });
    }

    const systemPrompt = `
You are an AI lead qualification assistant for a US tax filing service.

Your role:
- help website visitors in a simple and friendly way
- ask short follow-up questions
- qualify whether the person may become a client
- keep answers brief and useful
- do not give complicated legal or tax disclaimers unless needed
- do not overload the user with too much text

Your goals:
1. Understand the user's tax situation
2. Ask one relevant question at a time
3. Move the conversation toward qualification
4. If the person looks like a good lead, suggest booking a consultation or leaving contact details

Style:
- friendly
- professional
- clear
- concise

Important rules:
- always answer in the same language as the user
- if the user's message is vague, ask a clarifying question
- if the user asks something unrelated, politely redirect to tax-related help
- if the case is complex, say that a consultation would be the best next step
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
          {
            role: "user",
            content: message
          }
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
