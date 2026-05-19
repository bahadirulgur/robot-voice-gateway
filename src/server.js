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

wss.on("connection", (client) => {
  console.log("[ESP] connected");

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
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
        modalities: ["text", "audio"],
        instructions: "Her zaman Türkçe cevap ver. Çok kısa konuş. Maksimum 5 kelime.",
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: true
        }
      }
    }));

    client.send(JSON.stringify({
      type: "gateway.ready"
    }));
  });

  client.on("message", (data) => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(data);
    }
  });

  openaiWs.on("message", (msg) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg.toString());
    }
  });

  client.on("close", () => {
    console.log("[ESP] disconnected");
    try { openaiWs.close(); } catch {}
  });

  openaiWs.on("close", () => {
    console.log("[OpenAI] disconnected");
    try { client.close(); } catch {}
  });

  openaiWs.on("error", (err) => {
    console.error("[OpenAI] error", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});