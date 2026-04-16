const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

// Used by WebSocket flow — returns ulaw buffer streamed back to Twilio
async function textToSpeech(text) {
    try {
        const response = await axios({
            method: "POST",
            url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}?output_format=ulaw_8000`,
            headers: {
                "xi-api-key": process.env.ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            data: {
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.4, similarity_boost: 0.8 }
            },
            responseType: "arraybuffer",
            timeout: 8000
        });

        return Buffer.from(response.data);
    } catch (error) {
        const status = error.response?.status;
        const detail = error.response?.data ? Buffer.from(error.response.data).toString() : error.message;
        console.error(`❌ ElevenLabs error [${status}]:`, detail);
        throw error;
    }
}

// Used by TwiML flow — saves MP3 to public/audio/ and returns filename
async function textToSpeechFile(text) {
    try {
        const response = await axios({
            method: "POST",
            url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
            headers: {
                "xi-api-key": process.env.ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            },
            data: {
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.4, similarity_boost: 0.8 }
            },
            responseType: "arraybuffer",
            timeout: 8000
        });

        const fileName = `reply-${Date.now()}.mp3`;
        const filePath = path.join(__dirname, "../../public/audio", fileName);
        fs.writeFileSync(filePath, Buffer.from(response.data));
        console.log("🔊 TTS saved:", fileName);
        return fileName;
    } catch (error) {
        const status = error.response?.status;
        const detail = error.response?.data ? Buffer.from(error.response.data).toString() : error.message;
        console.error(`❌ ElevenLabs error [${status}]:`, detail);
        throw error;
    }
}

module.exports = { textToSpeech, textToSpeechFile };
