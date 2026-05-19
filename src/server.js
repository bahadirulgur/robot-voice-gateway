require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const app = express();

app.get("/", (_, res) => {
  res.json({ ok: true, service: "robot-voice-gateway" });
});

app.get("/health", (_, res) => {
  res.json({ ok: true, service: "robot-voice-gateway" });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

wss.on("connection", (espWs) => {
  console.log("[ESP] connected");

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    }
  );

  openaiWs.on("open", () => {
    console.log("[OpenAI] connected");

    openaiWs.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        model: "gpt-realtime",
        instructions: "Her zaman Türkçe cevap ver. Çok kısa konuş. Maksimum 5 kelime.",
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 700,
              create_response: true,
              interrupt_response: true
            }
          },
          output: {
            format: {
              type: "audio/pcm",
              rate: 24000
            },
            voice: "alloy"
          }
        }
      }
    }));

    if (espWs.readyState === WebSocket.OPEN) {
      espWs.send(JSON.stringify({ type: "gateway.ready" }));
    }
  });

  espWs.on("message", (data) => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(data.toString());
    }
  });

  openaiWs.on("message", (msg) => {
    const text = msg.toString();

    try {
      const evt = JSON.parse(text);

      if (evt.type === "error") {
        console.error("[OpenAI EVENT ERROR]", JSON.stringify(evt));
      } else {
        console.log("[OpenAI EVENT]", evt.type);
      }
    } catch {
      console.log("[OpenAI RAW]", text.substring(0, 100));
    }

    if (espWs.readyState === WebSocket.OPEN) {
      espWs.send(text);
    }
  });

  espWs.on("close", () => {
    console.log("[ESP] disconnected");
    try { openaiWs.close(); } catch {}
  });

  openaiWs.on("close", () => {
    console.log("[OpenAI] disconnected");
    try { espWs.close(); } catch {}
  });

  espWs.on("error", (err) => {
    console.error("[ESP] error:", err.message);
  });

  openaiWs.on("error", (err) => {
    console.error("[OpenAI] error:", err.message);

    if (espWs.readyState === WebSocket.OPEN) {
      espWs.send(JSON.stringify({
        type: "gateway.error",
        message: err.message
      }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});