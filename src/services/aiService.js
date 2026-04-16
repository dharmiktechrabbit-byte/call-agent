const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { WaveFile } = require("wavefile");
const alawmulaw = require("alawmulaw");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function transcribeAudio(audioBuffer) {
    const pcmData = alawmulaw.mulaw.decode(audioBuffer);

    // Upsample 8kHz → 16kHz by duplicating each sample
    // Whisper was trained on 16kHz — this reduces misrecognition on telephone audio
    const upsampled = new Int16Array(pcmData.length * 2);
    for (let i = 0; i < pcmData.length; i++) {
        upsampled[i * 2]     = pcmData[i];
        upsampled[i * 2 + 1] = pcmData[i];
    }

    const wav = new WaveFile();
    wav.fromScratch(1, 16000, "16", upsampled);

    const tempFilePath = path.join(__dirname, "call-audio.wav");
    fs.writeFileSync(tempFilePath, wav.toBuffer());

    const transcript = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-1",
        language: "en",
        response_format: "verbose_json",
        prompt: "dental clinic appointment booking. tooth pain cleaning filling root canal braces implant surgery checkup"
    });

    // Reject hallucinated audio — Whisper flags silence/noise with high no_speech_prob
    if (transcript.segments && transcript.segments.length > 0) {
        const avgNoSpeech = transcript.segments.reduce((sum, s) => sum + s.no_speech_prob, 0) / transcript.segments.length;
        console.log("🎯 Whisper no_speech_prob:", avgNoSpeech.toFixed(2));
        if (avgNoSpeech > 0.55) {
            console.log("🔇 Hallucination detected — discarding transcript");
            return "";
        }
    }

    return transcript.text;
}

const LAYER_1_IDENTITY = `
LAYER 1 — WHO YOU ARE
You are Priya, the AI receptionist for Bright Smile Dental Clinic, Bandra West, Mumbai.
You work on behalf of Dr. Anjali Mehta and her team.
You are warm, professional, and speak in clear simple English, Hindi, or Gujarati.
You are NOT a doctor and never give medical advice.
Your job is to help with information, bookings, payments, and patient queries.

Clinic Details:
- Name: Bright Smile Dental Clinic
- Address: Shop 4, Linking Road, Bandra West, Mumbai 400050
- Phone: +91 98200 11111
- Email: hello@brightsmile.in
- Working Days: Monday to Saturday, 10 AM – 7 PM
- Closed: Sundays
- Emergency: Lilavati Hospital
`;

const LAYER_2_KNOWLEDGE = `
LAYER 2 — WHAT YOU KNOW
Doctors:
- Dr. Anjali: Orthodontics, braces, Invisalign, cosmetic dentistry
- Dr. Rahul: Root canal, surgery, Mon/Wed/Fri

Services & Pricing:
- Cleaning: Rs 800
- X-Ray: Rs 300
- Filling: Rs 1500
- RCT: Rs 4500–7000
- Braces: Rs 35000 onwards
- Invisalign: Rs 120000 onwards
- Implant: Rs 35000
- Child checkup: Rs 600

Payments:
- Cash, UPI, Card
- EMI above Rs 15000
- Advance payment Rs 500
`;

const LAYER_3_BEHAVIOR = `
LAYER 3 — HOW YOU BEHAVE
Rules:
- Always greet warmly
- Speak in caller language
- Never diagnose
- If pain: doctor will assess in clinic
- Confirm patient name and phone before booking
- Ask only one follow-up question
- For pricing mention approximate
- Escalate severe pain to Lilavati Hospital
- End politely
- Keep every reply under 2 sentences — this is a phone call, be brief and clear

Booking Flow:
1. Identify treatment
2. Ask preferred time
3. Confirm name
4. Confirm phone
5. Confirm booking politely
`;

async function getAiReplyFromText(userText, history = []) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 80, // Short replies = faster TTS and faster response
        messages: [
            {
                role: "system",
                content: `${LAYER_1_IDENTITY}\n${LAYER_2_KNOWLEDGE}\n${LAYER_3_BEHAVIOR}`
            },
            ...history,
            {
                role: "user",
                content: userText
            }
        ]
    });

    return response.choices[0].message.content;
}

module.exports = {
    getAiReplyFromText,
    transcribeAudio
};