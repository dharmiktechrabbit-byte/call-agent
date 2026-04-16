const WebSocket = require("ws");
const alawmulaw = require("alawmulaw");
const {
    getAiReplyFromText,
    transcribeAudio
} = require("../services/aiService");
const { textToSpeech } = require("../services/ttsService");

const SILENCE_THRESHOLD    = 40;   // consecutive silent frames before transcribing (~800ms)
const MAX_CHUNKS           = 350;  // hard cap ~7 seconds, then force-process
const MIN_SPEECH_CHUNKS    = 10;   // require ~200ms of real speech before transcribing
const ENERGY_SILENCE_LEVEL = 800;  // PCM RMS² below this = silence frame

function getChunkEnergy(muLawBuffer) {
    const pcm = alawmulaw.mulaw.decode(muLawBuffer);
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) {
        sum += pcm[i] * pcm[i];
    }
    return sum / pcm.length;
}

function initMediaStream(server) {
    const wss = new WebSocket.Server({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
        if (request.url === "/media-stream") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit("connection", ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on("connection", (ws) => {
        console.log("🔌 Twilio Media Stream connected");

        let audioChunks = [];
        let streamSid = "";
        let isSpeaking = false;
        let chatHistory = [];
        let silenceFrames = 0;

        ws.on("message", async (message) => {
            const data = JSON.parse(message);

            switch (data.event) {
                case "start":
                    console.log("🎙️ Stream started");
                    streamSid = data.start.streamSid;
                    audioChunks = [];
                    chatHistory = [];
                    silenceFrames = 0;

                    try {
                        isSpeaking = true;

                        const welcomeText =
                            "Hello, welcome to Bright Smile Dental Clinic. How may I help you?";

                        const speechBuffer = await textToSpeech(welcomeText);

                        ws.send(
                            JSON.stringify({
                                event: "media",
                                streamSid,
                                media: {
                                    payload: speechBuffer.toString("base64")
                                }
                            })
                        );

                        console.log("👋 Welcome audio sent");
                    } catch (error) {
                        console.error("❌ Welcome TTS Error:", error.message);
                    } finally {
                        setTimeout(() => {
                            isSpeaking = false;
                        }, 4000);
                    }
                    break;

                case "media":
                    if (isSpeaking) return;

                    const chunk = Buffer.from(data.media.payload, "base64");
                    const energy = getChunkEnergy(chunk);

                    if (energy < ENERGY_SILENCE_LEVEL) {
                        silenceFrames++;
                    } else {
                        silenceFrames = 0;
                        audioChunks.push(chunk);
                    }

                    const hitSilence = silenceFrames >= SILENCE_THRESHOLD && audioChunks.length >= MIN_SPEECH_CHUNKS;
                    const hitMax     = audioChunks.length >= MAX_CHUNKS;

                    if (!hitSilence && !hitMax) break;

                    isSpeaking = true;
                    silenceFrames = 0;

                    const chunksToProcess = [...audioChunks];
                    audioChunks = [];

                    try {
                        const fullAudioBuffer = Buffer.concat(chunksToProcess);
                        const transcript = await transcribeAudio(fullAudioBuffer);
                        const cleanTranscript = transcript?.trim();

                        if (!cleanTranscript || cleanTranscript.length < 2) {
                            console.log("🤫 Empty transcript — resuming listen");
                            isSpeaking = false;
                            break;
                        }

                        const normalized = cleanTranscript.toLowerCase().trim();

                        // Block Whisper hallucination patterns — URLs, disclaimer phrases
                        const isHallucination =
                            normalized.includes("www.") ||
                            normalized.includes(".com") ||
                            normalized.includes(".gov") ||
                            normalized.includes(".org") ||
                            normalized.includes("http") ||
                            normalized.includes("for more information") ||
                            normalized.includes("please see") ||
                            normalized.includes("disclaimer") ||
                            normalized.includes("visit our website");

                        if (isHallucination) {
                            console.log("🚫 Hallucination pattern blocked:", cleanTranscript);
                            isSpeaking = false;
                            break;
                        }

                        const fillerPhrases = [
                            "thank you", "thanks", "bye", "bye bye", "goodbye",
                            "okay", "ok", "you", "hmm", "uh", "um", "ah"
                        ];
                        if (fillerPhrases.includes(normalized)) {
                            console.log("🤫 Filler ignored:", cleanTranscript);
                            isSpeaking = false;
                            break;
                        }

                        console.log("📝 User:", cleanTranscript);

                        const aiReply = await getAiReplyFromText(cleanTranscript, chatHistory);

                        chatHistory.push(
                            { role: "user", content: cleanTranscript },
                            { role: "assistant", content: aiReply }
                        );

                        const speechBuffer = await textToSpeech(aiReply);

                        ws.send(JSON.stringify({
                            event: "media",
                            streamSid,
                            media: { payload: speechBuffer.toString("base64") }
                        }));

                        console.log("🤖 AI:", aiReply);

                        // Dynamic timeout: ~500ms per word, minimum 3 seconds
                        const wordCount = aiReply.split(" ").length;
                        const estimatedMs = Math.max(3000, wordCount * 500);

                        setTimeout(() => {
                            isSpeaking = false;
                            audioChunks = [];
                            silenceFrames = 0;
                        }, estimatedMs);

                    } catch (error) {
                        console.error("❌ AI error:", error.message);
                        isSpeaking = false;
                        audioChunks = [];
                        silenceFrames = 0;
                    }
                    break;

                case "stop":
                    console.log("🛑 Stream stopped");
                    audioChunks = [];
                    chatHistory = [];
                    silenceFrames = 0;
                    break;
            }
        });

        ws.on("close", () => {
            console.log("❌ WebSocket closed");
        });
    });
}

module.exports = initMediaStream;
