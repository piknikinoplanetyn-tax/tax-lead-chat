import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>AI Lead Chat</title>
        <style>
          body { font-family: Arial; max-width: 700px; margin: 40px auto; }
          #chat { border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: auto; }
        </style>
      </head>
      <body>
        <h2>AI Tax Assistant</h2>
        <div id="chat"></div>
        <input id="msg" placeholder="Type..." />
        <button onclick="send()">Send</button>

        <script>
          async function send() {
            const input = document.getElementById("msg");
            const text = input.value;
            input.value = "";

            document.getElementById("chat").innerHTML += "<p><b>You:</b> " + text + "</p>";

            const res = await fetch("/chat", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({ message: text })
            });

            const data = await res.json();

            document.getElementById("chat").innerHTML += "<p><b>Bot:</b> " + data.reply + "</p>";
          }
        </script>
      </body>
    </html>
  `);
});

app.post("/chat", async (req, res) => {
  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: req.body.message,
    instructions: "You are a lead qualification assistant. Ask short questions."
  });

  res.json({ reply: response.output_text });
});

app.listen(3000, () => {
  console.log("Server running");
});
