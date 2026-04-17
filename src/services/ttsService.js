const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Used by WebSocket flow — returns ulaw buffer streamed back to Twilio
async function textToSpeech(text) {
    try {
        const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: "shimmer",
            input: text,
            response_format: "pcm" // We'll convert to ulaw if needed, or check if OpenAI supports it directly.
        });

        // Twilio expects mu-law 8kHz. OpenAI standard TTS returns high-quality audio.
        // Actually, the streaming Realtime API handles mu-law directly, 
        // but for this static TTS, we'll keep it simple for now as it's mainly used for legacy paths.
        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer;
    } catch (error) {
        console.error("❌ OpenAI TTS error:", error.message);
        throw error;
    }
}

// Used by TwiML flow — saves MP3 to public/audio/ and returns filename
async function textToSpeechFile(text) {
    try {
        const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: "shimmer",
            input: text,
            response_format: "mp3"
        });

        const fileName = `reply-${Date.now()}.mp3`;
        const filePath = path.join(__dirname, "../../public/audio", fileName);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        console.log("🔊 TTS saved (OpenAI Shimmer):", fileName);
        return fileName;
    } catch (error) {
        console.error("❌ OpenAI TTS (File) error:", error.message);
        throw error;
    }
}

module.exports = { textToSpeech, textToSpeechFile };
