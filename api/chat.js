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

function formatDateRu() {
  return new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function hasAnyContact(lead) {
  return Boolean(
    lead.phone ||
      lead.whatsapp ||
      lead.telegram ||
      lead.email
  );
}

function detectLeadTemperature({ qualified, leadData, summary }) {
  const hasContactInfo = hasAnyContact(leadData);
  const hasBusinessContext = Boolean(
    leadData.business_type ||
      leadData.industry ||
      leadData.us_connection ||
      leadData.tax_type ||
      leadData.main_issue ||
      leadData.employees_count ||
      leadData.payroll_status ||
      leadData.state_registration ||
      leadData.ein_status ||
      leadData.filing_status ||
      leadData.back_taxes
  );
  const hasStrongSummary = Boolean(summary && summary.trim().length > 40);

  if (qualified && hasContactInfo && hasBusinessContext && hasStrongSummary) {
    return "горячий";
  }

  if (qualified && (hasContactInfo || hasBusinessContext)) {
    return "тёплый";
  }

  return "холодный";
}

function detectPriority(temperature, leadData) {
  const hasBackTaxes =
    leadData.back_taxes &&
    leadData.back_taxes !== "нет" &&
    leadData.back_taxes !== "неизвестно";

  if (temperature === "горячий" || hasBackTaxes) return "высокий";
  if (temperature === "тёплый") return "средний";
  return "низкий";
}

function detectNextAction(temperature, leadData) {
  const preferred = leadData.preferred_contact || "контакт клиента";
  const hasBackTaxes =
    leadData.back_taxes &&
    leadData.back_taxes !== "нет" &&
    leadData.back_taxes !== "неизвестно";

  if (hasBackTaxes) {
    return `Связаться как можно скорее через: ${preferred}. Уточнить просрочки и статус обязательств`;
  }

  if (temperature === "горячий") {
    return `Связаться как можно скорее через: ${preferred}`;
  }

  if (temperature === "тёплый") {
    return `Связаться в рабочее время и уточнить детали кейса через: ${preferred}`;
  }

  return "Проверить кейс и при необходимости сделать мягкий follow-up";
}

function humanLanguageLabel(code) {
  if (code === "ru") return "русский";
  if (code === "en") return "английский";
  return code || "-";
}

function languageFlag(code) {
  if (code === "ru") return "🇷🇺";
  if (code === "en") return "🇺🇸";
  return "🌍";
}

function compactField(label, value) {
  if (!value) return "";
  return `${label}: ${value}`;
}

function buildTelegramMessage({ leadData, summary, qualified }) {
  const languageLabel = humanLanguageLabel(leadData.language);
  const flag = languageFlag(leadData.language);
  const temperature = detectLeadTemperature({
    qualified,
    leadData,
    summary
  });
  const priority = detectPriority(temperature, leadData);
  const nextAction = detectNextAction(temperature, leadData);

  const contactLines = [
    compactField("Имя", leadData.name),
    compactField("Предпочтительный контакт", leadData.preferred_contact),
    compactField("Телефон", leadData.phone),
    compactField("WhatsApp", leadData.whatsapp),
    compactField("Telegram", leadData.telegram),
    compactField("Email", leadData.email)
  ].filter(Boolean);

  const caseLines = [
    compactField("Страна", leadData.country),
    compactField("Связь с США", leadData.us_connection),
    compactField("Тип налогового вопроса", leadData.tax_type),
    compactField("Тип бизнеса", leadData.business_type),
    compactField("Сфера деятельности", leadData.industry),
    compactField("Штат регистрации", leadData.state_registration),
    compactField("Статус EIN", leadData.ein_status),
    compactField("Статус подачи деклараций", leadData.filing_status),
    compactField("Просрочки / back taxes", leadData.back_taxes),
    compactField("Стадия бизнеса", leadData.business_stage),
    compactField("Количество сотрудников", leadData.employees_count),
    compactField("Owner-operator", leadData.owner_operator),
    compactField("Payroll", leadData.payroll_status),
    compactField("Срочность", leadData.urgency),
    compactField("Основной запрос", leadData.main_issue)
  ].filter(Boolean);

  const statusBlock = [
    `Статус лида: ${temperature}`,
    `Приоритет: ${priority}`,
    `${flag} Язык клиента: ${languageLabel}`,
    `Рекомендуемый язык общения: ${languageLabel}`,
    `Следующее действие: ${nextAction}`
  ];

  const blocks = [
    `🔥 Новый лид — SmartBooks&Tax`,
    `Дата: ${formatDateRu()}`,
    "",
    "Контакт:",
    ...(contactLines.length ? contactLines : ["Контактные данные пока не собраны"]),
    "",
    "Кейс:",
    ...(caseLines.length ? caseLines : ["Недостаточно данных по кейсу"]),
    "",
    "Статус:",
    ...statusBlock,
    "",
    "Summary:",
    summary || "Нет summary"
  ];

  return blocks.join("\n").trim();
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
- When relevant, clarify the user's industry / business sphere
- When relevant, clarify the size and structure of the business
- When relevant, clarify:
  - state of registration
  - EIN status
  - whether tax returns have already been filed
  - whether there are any overdue filings or back taxes

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
- industry / business sphere
- business size / stage
- state of registration
- EIN status
- filing history
- overdue filings / back taxes
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

Based on the conversation, extract structured lead data for an internal manager.

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
    "language": "",
    "us_connection": "",
    "tax_type": "",
    "business_type": "",
    "industry": "",
    "state_registration": "",
    "ein_status": "",
    "filing_status": "",
    "back_taxes": "",
    "business_stage": "",
    "employees_count": "",
    "owner_operator": "",
    "payroll_status": "",
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

LANGUAGE RULES (IMPORTANT):
- ALL extracted fields MUST be in Russian language for CRM readability
- Even if the user speaks English, translate extracted values into Russian where possible
- DO NOT mix Russian and English in the extracted fields unless a brand, legal form, nickname, handle, or exact term must stay original
- Add a separate field "language" with the user's chat language code:
  - "ru" for Russian
  - "en" for English
  - otherwise use another short language code if clear

NORMALIZATION RULES:
- Normalize country names to Russian (USA → США, Russia → Россия, etc.)
- Normalize contact preference to Russian (phone → телефон, email → email, telegram → telegram, whatsapp → WhatsApp)
- Normalize phone numbers to international format if possible
- Determine and extract the industry / business sphere in Russian where possible
  Examples:
  - trucking / logistics → грузоперевозки / логистика
  - e-commerce → электронная коммерция
  - IT services → ИТ-услуги
  - consulting → консалтинг
  - construction → строительство
  - restaurant → ресторанный бизнес

BUSINESS SIZE RULES:
- Extract business_stage in Russian when possible:
  - new / just started → новый бизнес
  - operating / active → действующий бизнес
  - growing / scaling → растущий бизнес
- Extract employees_count as a short Russian value when possible:
  - "1 сотрудник"
  - "5 сотрудников"
  - "без сотрудников"
- Extract owner_operator in Russian:
  - "да"
  - "нет"
- Extract payroll_status in Russian:
  - "есть payroll"
  - "нет payroll"
  - "неизвестно"

REGISTRATION & COMPLIANCE RULES:
- Extract state_registration in Russian if possible:
  - Colorado → Колорадо
  - Delaware → Делавэр
  - Wyoming → Вайоминг
- Extract ein_status in Russian:
  - "EIN получен"
  - "EIN не получен"
  - "неизвестно"
- Extract filing_status in Russian:
  - "декларации уже подавались"
  - "декларации ещё не подавались"
  - "неизвестно"
- Extract back_taxes in Russian:
  - "есть просрочки"
  - "нет просрочек"
  - "неизвестно"

LEAD RULES:
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
      language: parsed.lead_data?.language || leadData.language || "",
      us_connection: parsed.lead_data?.us_connection || leadData.us_connection || "",
      tax_type: parsed.lead_data?.tax_type || leadData.tax_type || "",
      business_type: parsed.lead_data?.business_type || leadData.business_type || "",
      industry: parsed.lead_data?.industry || leadData.industry || "",
      state_registration: parsed.lead_data?.state_registration || leadData.state_registration || "",
      ein_status: parsed.lead_data?.ein_status || leadData.ein_status || "",
      filing_status: parsed.lead_data?.filing_status || leadData.filing_status || "",
      back_taxes: parsed.lead_data?.back_taxes || leadData.back_taxes || "",
      business_stage: parsed.lead_data?.business_stage || leadData.business_stage || "",
      employees_count: parsed.lead_data?.employees_count || leadData.employees_count || "",
      owner_operator: parsed.lead_data?.owner_operator || leadData.owner_operator || "",
      payroll_status: parsed.lead_data?.payroll_status || leadData.payroll_status || "",
      urgency: parsed.lead_data?.urgency || leadData.urgency || "",
      main_issue: parsed.lead_data?.main_issue || leadData.main_issue || ""
    };

    const hasContact = hasAnyContact(mergedLeadData);
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
      const telegramMessage = buildTelegramMessage({
        leadData: mergedLeadData,
        summary: parsed.summary || "",
        qualified: isQualified
      });

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
