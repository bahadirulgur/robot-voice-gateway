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
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  }
);

openaiWs.on("message", (msg) => {
  const text = msg.toString();

  let evt;
  try {
    evt = JSON.parse(text);
  } catch {
    return;
  }

  if (evt.type === "error") {
    console.error("[OpenAI EVENT ERROR]", JSON.stringify(evt));
    if (espWs.readyState === WebSocket.OPEN) {
      espWs.send(JSON.stringify(evt));
    }
    return;
  }

  console.log("[OpenAI EVENT]", evt.type);

  // Ses cevabı: base64 decode edip ESP'ye binary gönder
  if (evt.type === "response.output_audio.delta" && evt.delta) {
    if (espWs.readyState === WebSocket.OPEN) {
      const pcmBuffer = Buffer.from(evt.delta, "base64");
      espWs.send(pcmBuffer, { binary: true });
    }
    return;
  }

  // Ses bitti bilgisini küçük JSON olarak gönder
  if (evt.type === "response.output_audio.done") {
    if (espWs.readyState === WebSocket.OPEN) {
      espWs.send(JSON.stringify({ type: "audio.done" }));
    }
    return;
  }

  // Diğer eventleri istersen küçük JSON olarak geçir
  if (
    evt.type === "session.created" ||
    evt.type === "session.updated" ||
    evt.type === "input_audio_buffer.speech_started" ||
    evt.type === "input_audio_buffer.speech_stopped" ||
    evt.type === "response.done"
  ) {
    if (espWs.readyState === WebSocket.OPEN) {
      espWs.send(JSON.stringify({ type: evt.type }));
    }
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