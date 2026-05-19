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

  let sessionUpdated = false;

  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-realtime",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  openaiWs.on("open", () => {
    console.log("[OpenAI] connected");
  });

  openaiWs.on("message", (msg) => {
    let evt;

    try {
      evt = JSON.parse(msg.toString());
    } catch {
      return;
    }

    console.log("[OpenAI EVENT]", evt.type);

    if (evt.type === "error") {
      console.error("[OpenAI ERROR]", JSON.stringify(evt));
      if (espWs.readyState === WebSocket.OPEN) {
        espWs.send(JSON.stringify(evt));
      }
      return;
    }

    if (evt.type === "session.created" && !sessionUpdated) {
      sessionUpdated = true;

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

      return;
    }

    if (evt.type === "session.updated") {
      if (espWs.readyState === WebSocket.OPEN) {
        espWs.send(JSON.stringify({ type: "gateway.ready" }));
      }
      return;
    }

    if (evt.type === "response.output_audio.delta" && evt.delta) {
      if (espWs.readyState === WebSocket.OPEN) {
        const pcmBuffer = Buffer.from(evt.delta, "base64");
        espWs.send(pcmBuffer, { binary: true });
      }
      return;
    }

    if (evt.type === "response.output_audio.done") {
      if (espWs.readyState === WebSocket.OPEN) {
        espWs.send(JSON.stringify({ type: "audio.done" }));
      }
      return;
    }

    if (
      evt.type === "input_audio_buffer.speech_started" ||
      evt.type === "input_audio_buffer.speech_stopped" ||
      evt.type === "response.done"
    ) {
      if (espWs.readyState === WebSocket.OPEN) {
        espWs.send(JSON.stringify({ type: evt.type }));
      }
    }
  });

  espWs.on("message", (data, isBinary) => {
    if (openaiWs.readyState !== WebSocket.OPEN) {
      return;
    }

    if (isBinary) {
      return;
    }

    openaiWs.send(data.toString());
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