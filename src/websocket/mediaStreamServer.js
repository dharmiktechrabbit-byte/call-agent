const WebSocket = require("ws");
const { SYSTEM_PROMPT } = require("../services/aiService");
const { bookAppointment } = require("../services/appointmentService");
const { parseBookingTime } = require("../utils/slotGenerator");
const { createPaymentLink } = require("../services/stripeService");
const { sendWhatsAppMessage } = require("../services/whatsappService");

// OpenAI Realtime API URL
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

function initMediaStream(server) {
    const wss = new WebSocket.Server({ server, path: "/media-stream" });

    console.log("🚀 Media Stream WebSocket Server ready at /media-stream");

    wss.on("connection", (twilioWs) => {
        console.log("🤝 Twilio Media Stream connected");

        let streamSid = "";
        let openAiWs = null;
        let isResponseActive = false; // ✅ Track if AI is currently generating/speaking

        // Connect to OpenAI Realtime API
        openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1"
            }
        });

        const setupOpenAiSession = () => {
            const sessionUpdate = {
                type: "session.update",
                session: {
                    modalities: ["text", "audio"],
                    instructions: SYSTEM_PROMPT,
                    temperature: 0.6,
                    voice: "shimmer",
                    input_audio_format: "g711_ulaw",
                    output_audio_format: "g711_ulaw",
                    input_audio_transcription: { model: "whisper-1" },
                    turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 1000
                    },
                    tools: [
                        {
                            type: "function",
                            name: "book_appointment",
                            description: "Books a dental appointment. ONLY call this AFTER the user has explicitly confirmed 'YES' to your summary of Name, Treatment, and Time. DO NOT call this if any info is missing or unconfirmed.",
                            parameters: {
                                type: "object",
                                properties: {
                                    patientName: { type: "string", description: "Full name provided by user" },
                                    treatment: { type: "string", description: "Treatment type explicitly selected by user" },
                                    appointmentTime: { type: "string", description: "Time explicitly selected by user" }
                                },
                                required: ["patientName", "treatment", "appointmentTime"]
                            }
                        }
                    ],
                    tool_choice: "auto"
                }
            };
            openAiWs.send(JSON.stringify(sessionUpdate));
        };

        openAiWs.on("open", () => {
            console.log("🌐 Connected to OpenAI Realtime API");
            setupOpenAiSession();
        });

        openAiWs.on("message", async (data) => {
            try {
                const response = JSON.parse(data);

                // ✅ Handle Barge-in (User starts speaking while AI is talking)
                if (response.type === "input_audio_buffer.speech_started") {
                    if (isResponseActive) {
                        console.log("🎤 Speech started — Interrupting AI");

                        twilioWs.send(JSON.stringify({
                            event: "clear",
                            streamSid
                        }));

                        openAiWs.send(JSON.stringify({
                            type: "response.cancel"
                        }));
                        isResponseActive = false;
                    }
                }

                // Tracking response state
                if (response.type === "response.created") isResponseActive = true;
                if (response.type === "response.done") isResponseActive = false;

                // Handle audio from OpenAI -> Twilio
                if (response.type === "response.audio.delta" && response.delta) {
                    twilioWs.send(JSON.stringify({
                        event: "media",
                        streamSid,
                        media: { payload: response.delta }
                    }));
                }

                // Handle transcription (User Speech -> Partial Text)
                if (response.type === "conversation.item.input_audio_transcription.completed") {
                    console.log("📝 User:", response.transcript);
                }

                // Handle AI Transcript (The text AI spoke)
                if (response.type === "response.audio_transcript.done") {
                    console.log("🤖 AI:", response.transcript);
                }

                // Handle Tool Calls
                if (response.type === "response.done") {
                    const output = response.response.output;
                    for (const item of output) {
                        if (item.type === "function_call") {
                            const { name, arguments: args, call_id } = item;
                            if (name === "book_appointment") {
                                const params = JSON.parse(args);
                                console.log("📅 Tool Call: book_appointment", params);

                                try {
                                    const selectedTime = parseBookingTime(params.appointmentTime);
                                    const bookingResult = await bookAppointment({
                                        patientName: params.patientName,
                                        phone: twilioWs.phoneNumber || "Unknown",
                                        treatment: params.treatment,
                                        selectedTime
                                    });

                                    let resultOutput = "";
                                    if (bookingResult.success) {
                                        resultOutput = `SUCCESS: Appointment booked for ${bookingResult.bookedLabel}.`;
                                        console.log(`📅 Google Calendar: Event created for ${bookingResult.bookedLabel}`);

                                        // Trigger post-booking logic
                                        const paymentLink = await createPaymentLink({
                                            name: params.patientName,
                                            treatment: params.treatment
                                        });

                                        await sendWhatsAppMessage({
                                            name: params.patientName,
                                            phone: twilioWs.phoneNumber || "Unknown",
                                            treatment: params.treatment,
                                            time: bookingResult.bookedLabel,
                                            summary: `Appointment confirmed for ${bookingResult.bookedLabel}`,
                                            paymentLink
                                        });
                                        console.log(`📲 WhatsApp: Message sent to ${twilioWs.phoneNumber || "Unknown"}`);
                                    } else {
                                        resultOutput = `ERROR: ${bookingResult.message || "Slot busy"}`;
                                    }

                                    // Send function output back to OpenAI
                                    openAiWs.send(JSON.stringify({
                                        type: "conversation.item.create",
                                        item: {
                                            type: "function_call_output",
                                            call_id,
                                            output: resultOutput
                                        }
                                    }));

                                    // Ask OpenAI to respond based on the tool result
                                    openAiWs.send(JSON.stringify({ type: "response.create" }));

                                } catch (err) {
                                    console.error("❌ Tool handling error:", err.message);
                                }
                            }
                        }
                    }
                }

                // Log error events from OpenAI
                if (response.type === "error") {
                    // Suppress "response_cancel_not_active" noise
                    if (response.error?.code === "response_cancel_not_active") {
                        return;
                    }
                    console.error("❌ OpenAI Realtime Event Error:", response.error);
                }

            } catch (err) {
                console.error("❌ Error processing OpenAI message:", err.message);
            }
        });

        twilioWs.on("message", (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.event) {
                    case "start":
                        streamSid = data.start.streamSid;
                        twilioWs.phoneNumber = data.start.customParameters?.phoneNumber || "";
                        console.log(`🎙️ Twilio Stream started: ${streamSid} for ${twilioWs.phoneNumber}`);
                        break;

                    case "media":
                        if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                            openAiWs.send(JSON.stringify({
                                type: "input_audio_buffer.append",
                                audio: data.media.payload
                            }));
                        }
                        break;

                    case "stop":
                        console.log("🛑 Twilio Stream stopped");
                        if (openAiWs) openAiWs.close();
                        break;
                }
            } catch (err) {
                console.error("❌ Error processing Twilio message:", err.message);
            }
        });

        twilioWs.on("close", () => {
            console.log("👋 Twilio connection closed");
            if (openAiWs) openAiWs.close();
        });

        openAiWs.on("error", (err) => {
            console.error("❌ OpenAI WebSocket error:", err.message);
        });

        openAiWs.on("close", () => {
            console.log("📡 OpenAI Realtime connection closed");
        });
    });
}

module.exports = initMediaStream;
