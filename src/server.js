require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const app = express();

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "robot-voice-gateway"
    });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server,
    path: "/ws"
});

wss.on("connection", (client) => {

    console.log("ESP connected");

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

        console.log("OpenAI connected");

        openaiWs.send(JSON.stringify({
            type: "session.update",
            session: {
                voice: "alloy",
                instructions:
                    "Sen Türkçe konuşan kısa cevap veren robot asistansın.",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: {
                    type: "server_vad"
                }
            }
        }));
    });

    client.on("message", (data) => {

        if (openaiWs.readyState !== WebSocket.OPEN)
            return;

        openaiWs.send(data);
    });

    openaiWs.on("message", (msg) => {

        if (client.readyState === WebSocket.OPEN)
            client.send(msg);
    });

    client.on("close", () => {
        openaiWs.close();
    });

    openaiWs.on("close", () => {
        client.close();
    });
});

server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});