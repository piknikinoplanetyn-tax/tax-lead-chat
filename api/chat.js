async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("Telegram env vars are missing");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const telegramRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  const telegramData = await telegramRes.json();

  if (!telegramRes.ok) {
    console.error("Telegram API error:", telegramData);
  }
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch (error) {
    console.error("JSON parse error:", error);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed" });
  }

  try {
    const { messages, leadData = {}, leadSent = false } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ reply: "No messages provided" });
    }

    const systemPrompt = `
You are an AI tax consultation and lead qualification assistant for US tax services.
IDENTITY (VERY IMPORTANT):

You are not just an assistant.

You are a client-facing manager from the company "SmartBooks&Tax".

You represent the company in conversations.

Act as:
- a knowledgeable tax consultant
- a helpful account manager
- a first point of contact for clients

You should:
- speak as part of the company ("we", not "they")
- reflect professionalism and trust
- make the user feel they are already interacting with the company

Examples:
- "In SmartBooks&Tax, we usually help clients in similar situations by..."
- "We can take a closer look at your case and guide you properly"
- "Our team can help you structure this correctly"
TRUST BUILDING:

- Occasionally reinforce credibility:
  "We work with clients in similar situations regularly"
  "This is a common case we handle"
  "We've helped many clients with this"

But do not overuse it.

Your goal:
- understand the user's situation
- provide clear, helpful guidance
- naturally guide the user toward a consultation
- identify and capture potential leads

IMPORTANT:
You are NOT a script. Do NOT follow rigid steps.
Think like a human consultant. Adapt based on context.

--------------------------------
CORE BEHAVIOR
--------------------------------

- Ask only ONE question at a time
- Keep responses concise and natural
- Do not sound robotic
- Do not ask unnecessary or obvious questions
- Focus only on relevant details

--------------------------------
US TAX ONLY
--------------------------------

You ONLY handle US-related tax situations.

If the user is not clearly related to the US:
→ politely redirect:

"I specialize in US tax matters. Is your situation connected to US income, business, or residency?"

Do NOT give advice for other countries.

--------------------------------
THINKING MODEL
--------------------------------

Before responding:

1. Understand what the user already said
2. Identify missing critical information
3. Ask the MOST relevant next question
4. Provide short useful insight when possible

DO NOT:
- ask checklist questions
- repeat generic patterns
- ignore context

--------------------------------
CONVERSATION FLOW (FLEXIBLE, NOT RIGID)
--------------------------------

You should NATURALLY explore:

- personal vs business
- US connection (income, company, residency)
- tax status (filing / not filing)
- type of income or business
- urgency

BUT:
- never ask all at once
- only ask what is relevant now

--------------------------------
FIRST MESSAGE LOGIC (CRITICAL)
--------------------------------

The first response MUST be contextual.

DO:
- acknowledge what the user said
- ask ONE relevant clarifying question

DO NOT:
- start with "Привет! Расскажи..."
- ask generic broad questions
- ignore user input

Examples:

User: "I have a business"
→ "Понял. Этот бизнес зарегистрирован в США или связан с доходом из США?"

User: "I have income"
→ "Понял. Этот доход получен в США или за пределами США?"

User: vague question
→ "Давайте уточним, чтобы ответ был точнее..."

--------------------------------
TONE & LANGUAGE
--------------------------------

- Always respond in the SAME language as the user
- Never default to English unless user uses English
- Switch language if user switches

Tone:
- professional
- friendly
- natural
- confident
- not pushy

Avoid:
- slang
- overly casual tone
- "ты" (use neutral/polite tone)

--------------------------------
ANTI-ROBOT RULES
--------------------------------

- Vary phrasing naturally
- Do not repeat the same sentence structures
- Do not sound like a questionnaire
- Do not greet repeatedly

--------------------------------
HANDLING HESITATION
--------------------------------

If user says:
"just looking" / "not sure"

→ respond lightly and continue:

"Понял. Тогда давайте просто уточним пару деталей, чтобы понять, есть ли у вас обязательства."

Goal:
- keep conversation going
- reduce friction

--------------------------------
CONSULTATION & CLOSING LOGIC
--------------------------------

When the situation looks real:

Say something like:
"This looks like something a tax specialist should review more closely."

Then move to contact:

"What’s the best way to reach you?"

--------------------------------
LEAD CAPTURE (IMPORTANT)
--------------------------------

When user is engaged or qualified:

Collect:
- name
- preferred contact (phone / WhatsApp / Telegram / email)

Do it naturally, not aggressively.

Example:
"Чтобы передать ваш кейс специалисту, подскажите, как с вами лучше связаться?"

--------------------------------
FINAL GOAL
--------------------------------

- Help the user
- Understand their situation
- Qualify them
- Move them toward a consultation
- Capture contact details
`;

    const extractionPrompt = `
You are a lead extraction system.

Based on the conversation, extract structured lead data.

Return ONLY valid JSON in this exact format:

{
  "lead_data": {
    "name": "",
    "preferred_contact": "",
    "phone": "",
    "whatsapp": "",
    "telegram": "",
    "email": "",
    "country": "",
    "us_connection": "",
    "tax_type": "",
    "business_type": "",
    "urgency": "",
    "main_issue": ""
  },
  "summary": "short summary for specialist",
  "qualified": false,
  "should_create_lead": false
}

Rules:
- Merge with already known data
- Do not invent facts
- Leave unknown values as empty strings
- should_create_lead = true ONLY if:
  1. the lead is qualified
  2. at least one real contact method is present (phone, whatsapp, telegram, or email)
  3. there is enough information for a specialist to follow up
- if contact details are missing, should_create_lead must be false
- do not set should_create_lead to true just because the case looks promising
`;

    const assistantRes = await fetch("https://api.openai.com/v1/responses", {
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

    const assistantData = await assistantRes.json();

    if (!assistantRes.ok) {
      console.error("OpenAI assistant error:", assistantData);
      return res.status(assistantRes.status).json({
        reply: assistantData?.error?.message || "OpenAI request failed"
      });
    }

    const reply =
      assistantData?.output?.[0]?.content?.[0]?.text ||
      assistantData?.output_text ||
      "No response from model";

    const extractionRes = await fetch("https://api.openai.com/v1/responses", {
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
            content: extractionPrompt
          },
          {
            role: "system",
            content: `Existing lead data: ${JSON.stringify(leadData)}`
          },
          ...messages,
          {
            role: "assistant",
            content: reply
          }
        ]
      })
    });

    const extractionData = await extractionRes.json();

    if (!extractionRes.ok) {
      console.error("OpenAI extraction error:", extractionData);
      return res.status(200).json({
        reply,
        leadData,
        summary: "",
        qualified: false,
        shouldCreateLead: false
      });
    }

    const rawExtraction =
      extractionData?.output?.[0]?.content?.[0]?.text ||
      extractionData?.output_text ||
      "";

    const parsed = extractJson(rawExtraction);

    if (!parsed) {
      console.error("Could not parse extraction JSON:", rawExtraction);
      return res.status(200).json({
        reply,
        leadData,
        summary: "",
        qualified: false,
        shouldCreateLead: false
      });
    }

    const mergedLeadData = {
      name: parsed.lead_data?.name || leadData.name || "",
      preferred_contact: parsed.lead_data?.preferred_contact || leadData.preferred_contact || "",
      phone: parsed.lead_data?.phone || leadData.phone || "",
      whatsapp: parsed.lead_data?.whatsapp || leadData.whatsapp || "",
      telegram: parsed.lead_data?.telegram || leadData.telegram || "",
      email: parsed.lead_data?.email || leadData.email || "",
      country: parsed.lead_data?.country || leadData.country || "",
      us_connection: parsed.lead_data?.us_connection || leadData.us_connection || "",
      tax_type: parsed.lead_data?.tax_type || leadData.tax_type || "",
      business_type: parsed.lead_data?.business_type || leadData.business_type || "",
      urgency: parsed.lead_data?.urgency || leadData.urgency || "",
      main_issue: parsed.lead_data?.main_issue || leadData.main_issue || ""
    };

    const hasContact =
      Boolean(mergedLeadData.phone) ||
      Boolean(mergedLeadData.whatsapp) ||
      Boolean(mergedLeadData.telegram) ||
      Boolean(mergedLeadData.email);

    const hasUsefulSummary =
      Boolean(parsed.summary && parsed.summary.trim().length > 20);

    const isQualified = Boolean(parsed.qualified);

    const shouldCreateLead =
      !leadSent &&
      Boolean(parsed.should_create_lead) &&
      isQualified &&
      hasContact &&
      hasUsefulSummary;

    if (shouldCreateLead) {
      const telegramMessage = `
🔥 Новый лид — SmartBooks&Tax

Имя: ${mergedLeadData.name || "-"}
Предпочтительный контакт: ${mergedLeadData.preferred_contact || "-"}
Телефон: ${mergedLeadData.phone || "-"}
WhatsApp: ${mergedLeadData.whatsapp || "-"}
Telegram: ${mergedLeadData.telegram || "-"}
Email: ${mergedLeadData.email || "-"}
Страна: ${mergedLeadData.country || "-"}
Связь с США: ${mergedLeadData.us_connection || "-"}
Тип налогового вопроса: ${mergedLeadData.tax_type || "-"}
Тип бизнеса: ${mergedLeadData.business_type || "-"}
Срочность: ${mergedLeadData.urgency || "-"}
Основной запрос: ${mergedLeadData.main_issue || "-"}

Summary:
${parsed.summary || "-"}
      `.trim();

      await sendToTelegram(telegramMessage);
    }

    return res.status(200).json({
      reply,
      leadData: mergedLeadData,
      summary: parsed.summary || "",
      qualified: isQualified,
      shouldCreateLead
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ reply: "Server error" });
  }
}
