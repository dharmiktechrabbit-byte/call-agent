const WebSocket = require("ws");
const {
    getAiReplyFromText,
    transcribeAudio
} = require("../services/aiService");
const {
    textToSpeech
} = require("../services/ttsService");

function initMediaStream(server) {
    const wss = new WebSocket.Server({
        server
    });

    console.log("🚀 Media Stream WebSocket Server ready");

    wss.on("connection", (ws) => {
        console.log("🤝 Twilio Media Stream connected");

        let streamSid = "";
        let audioBuffer = Buffer.alloc(0);
        let chatHistory = [];
        let isProcessing = false;

        // VAD-like simple logic
        let silenceFrames = 0;
        const SILENCE_THRESHOLD = 20; // ~400ms of silence at 20ms chunks

        ws.on("message", async (message) => {
            const data = JSON.parse(message);

            switch (data.event) {
                case "start":
                    console.log("🎙️ Stream started");
                    streamSid = data.start.streamSid;
                    break;

                case "media":
                    if (isProcessing) return;

                    const payload = Buffer.from(data.media.payload, "base64");
                    audioBuffer = Buffer.concat([audioBuffer, payload]);

                    // Very simple VAD: if payload is mostly zero or very small, it's silence
                    // Twilio mu-law 0x7f/0xff are silence equivalents
                    const isSilence = payload.every(byte => byte === 0xff || byte === 0x7f || byte < 0x05);

                    if (isSilence) {
                        silenceFrames++;
                    } else {
                        silenceFrames = 0;
                    }

                    // If we have enough audio and then a pause, process it
                    if (silenceFrames > SILENCE_THRESHOLD && audioBuffer.length > 3200) {
                        isProcessing = true;
                        silenceFrames = 0;

                        const cleanAudio = audioBuffer;
                        audioBuffer = Buffer.alloc(0);

                        console.log("🧠 Processing user speech...");
                        const transcript = await transcribeAudio(cleanAudio);

                        if (!transcript || transcript.trim().length === 0) {
                            console.log("🔇 No transcript — skipping AI");
                            isProcessing = false;
                            return;
                        }

                        console.log("📝 User:", transcript);

                        const aiReply = await getAiReplyFromText(transcript, chatHistory);

                        chatHistory.push(
                            { role: "user", content: transcript },
                            { role: "assistant", content: aiReply }
                        );

                        const speechBuffer = await textToSpeech(aiReply);

                        ws.send(JSON.stringify({
                            event: "media",
                            streamSid,
                            media: { payload: speechBuffer.toString("base64") }
                        }));

                        console.log("🤖 AI:", aiReply);
                        isProcessing = false;
                    }
                    break;

                case "stop":
                    console.log("🛑 Stream stopped");
                    break;
            }
        });

        ws.on("close", () => {
            console.log("👋 Stream connection closed");
        });
    });
}

module.exports = initMediaStream;
