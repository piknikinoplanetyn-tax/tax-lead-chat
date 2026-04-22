import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { message } = req.body;

  try {
    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: message,
      instructions: `
You are a lead qualification assistant for a US tax service.
Ask short, simple questions.
Guide user to leave contact info.
      `,
    });

    res.status(200).json({
      reply: response.output_text,
    });
  } catch (e) {
    res.status(500).json({ reply: "Error" });
  }
}
