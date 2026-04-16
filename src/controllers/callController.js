const VoiceResponse = require("twilio").twiml.VoiceResponse;
const { makeIndiaCall } = require("../services/twilioService");
const { getAiReplyFromText } = require("../services/aiService");
const { textToSpeechFile } = require("../services/ttsService");
const { sendWhatsAppMessage } = require("../services/whatsappService");

// In-memory chat history per call (keyed by CallSid)
const chatHistories = new Map();

exports.incomingCall = async (req, res) => {
    console.log("📞 incomingCall webhook hit");

    const callSid    = req.body.CallSid;
    const from       = req.body.From || "";
    const to         = req.body.To   || "";
    const twilioNum  = process.env.TWILIO_PHONE_NUMBER || "";

    // For inbound calls: From = user, To = Twilio
    // For outbound calls: From = Twilio, To = user
    const callerPhone = from === twilioNum ? to : from;

    chatHistories.set(callSid, { messages: [], booking: { phone: callerPhone } });
    console.log("📱 Caller number:", callerPhone);

    const twiml = new VoiceResponse();

    try {
        const welcomeText = "Hello, welcome to Bright Smile Dental Clinic. How may I help you today?";
        const fileName = await textToSpeechFile(welcomeText);
        twiml.play(`${process.env.NGROK_URL}/audio/${fileName}`);
        console.log("👋 Welcome audio sent");
    } catch (err) {
        console.error("❌ Welcome TTS error:", err.message);
        twiml.say("Welcome to Bright Smile Dental Clinic. How may I help you?");
    }

    twiml.redirect(`${process.env.NGROK_URL}/listen`);
    res.type("text/xml").send(twiml.toString());
};

exports.listen = (req, res) => {
    const twiml = new VoiceResponse();

    twiml.gather({
        input: "speech",
        action: `${process.env.NGROK_URL}/process-speech`,
        speechTimeout: "auto",
        timeout: 8,
        language: "hi-IN",
        hints: "अपॉइंटमेंट, दाँत, दर्द, सफाई, भरना, जड़ का इलाज, ब्रेसेज़, इन्विज़लाइन, इम्प्लांट, एक्सरे, बच्चों की जाँच, डॉक्टर अंजलि, डॉक्टर राहुल, सोमवार, मंगलवार, बुधवार, गुरुवार, शुक्रवार, शनिवार, સફાઈ, દાંત, દર્દ, ડૉક્ટર, અપોઇન્ટમેન્ટ, appointment, cleaning, filling, root canal, braces, implant, surgery, checkup"
    });

    // User silent for 8 seconds — ask if they need help
    twiml.redirect(`${process.env.NGROK_URL}/no-response`);
    res.type("text/xml").send(twiml.toString());
};

exports.noResponse = async (req, res) => {
    console.log("⏰ User silent — prompting");
    const twiml = new VoiceResponse();

    try {
        const promptText = "Are you still there? Do you have any questions? I'm here to help.";
        const fileName = await textToSpeechFile(promptText);
        twiml.play(`${process.env.NGROK_URL}/audio/${fileName}`);
    } catch (err) {
        twiml.say("Are you still there? Do you have any questions?");
    }

    twiml.redirect(`${process.env.NGROK_URL}/listen`);
    res.type("text/xml").send(twiml.toString());
};

// ✅ ADD HERE
function extractPhone(text, booking) {
    const digits = text.match(/\d+/g);

    if (!digits) return;

    const merged = digits.join("");

    // save only if exactly 10 digits
    if (!booking.phone && merged.length === 10) {
        booking.phone = merged;
    }
}

function extractBookingInfo(text, booking) {
    // phone
    extractPhone(text, booking);

    // treatment — map Hindi keywords to treatment names
    if (!booking.treatment) {
        if (text.includes("सफाई") || text.includes("cleaning"))           booking.treatment = "सफाई (Cleaning)";
        else if (text.includes("भरना") || text.includes("filling"))       booking.treatment = "भरना (Filling)";
        else if (text.includes("जड़") || text.includes("root canal") || text.includes("RCT")) booking.treatment = "जड़ का इलाज (RCT)";
        else if (text.includes("ब्रेसेज़") || text.includes("braces"))   booking.treatment = "ब्रेसेज़ (Braces)";
        else if (text.includes("इम्प्लांट") || text.includes("implant")) booking.treatment = "इम्प्लांट (Implant)";
        else if (text.includes("सर्जरी") || text.includes("surgery"))    booking.treatment = "सर्जरी (Surgery)";
        else if (text.includes("एक्सरे") || text.includes("x-ray") || text.includes("xray")) booking.treatment = "एक्सरे (X-Ray)";
        else if (text.includes("दर्द") || text.includes("pain"))         booking.treatment = "दर्द जाँच (Pain checkup)";
        else if (text.includes("बच्चे") || text.includes("child"))       booking.treatment = "बच्चों की जाँच (Child checkup)";
    }

    // time/date
    if (
        text.includes("कल") ||
        text.includes("आज") ||
        text.includes("शाम") ||
        text.includes("सुबह")
    ) {
        booking.time = text;
    }

    // name
    const nameMatch = text.match(/मेरा नाम\s+([^\s]+)/);
    if (nameMatch && !booking.name) {
        booking.name = nameMatch[1];
    }

    return booking;
}

exports.processSpeech = async (req, res) => {
    const userText = req.body.SpeechResult;
    const callSid = req.body.CallSid;
    const twiml = new VoiceResponse();

    if (!userText) {
        console.log("🤫 No speech detected — looping");
        twiml.redirect(`${process.env.NGROK_URL}/listen`);
        return res.type("text/xml").send(twiml.toString());
    }

    console.log("📝 User:", userText);

    if (!chatHistories.has(callSid)) {
        chatHistories.set(callSid, {
            messages: [],
            booking: {}
        });
    }

    const session = chatHistories.get(callSid);
    const history = session.messages;
    const booking = session.booking;

    try {
        extractBookingInfo(userText, booking);
        const aiReply = await getAiReplyFromText(userText, history);
        history.push(
            { role: "user", content: userText },
            { role: "assistant", content: aiReply }
        );

        const bookingConfirmed =
            aiReply.includes("बुक कर दिया गया") ||
            aiReply.includes("बुक कर दी गई") ||
            aiReply.includes("बुकिंग") ||
            aiReply.includes("हो गई है") ||
            aiReply.includes("बुक हो गई") ||
            aiReply.includes("कंफर्म") ||   // anusvara variant
            aiReply.includes("कन्फर्म") ||  // half-न variant
            aiReply.includes("confirmed") ||
            aiReply.includes("appointment booked") ||
            aiReply.includes("booked");

        // Extract name from AI reply if booking.name still missing
        // e.g. AI says "धन्यवाद, धार्मिक!" or "धार्मिक, आपकी..."
        if (!booking.name) {
            const aiNameMatch = aiReply.match(/(?:धन्यवाद[,،]?\s*|नमस्ते[,،]?\s*)([^\s।!,،]+)\s*(?:जी|ji)?/i);
            if (aiNameMatch) booking.name = aiNameMatch[1];
        }

        // Phone is always available from caller ID — that's enough to send WhatsApp
        const bookingComplete = !!booking.phone;

        if (bookingConfirmed && bookingComplete) {
            await sendWhatsAppMessage({ ...booking, summary: aiReply });

            console.log("✅ WhatsApp sent:", booking);

            // optional cleanup after booking complete
            chatHistories.delete(callSid);
        }

        console.log("🤖 AI:", aiReply);

        const fileName = await textToSpeechFile(aiReply);
        twiml.play(`${process.env.NGROK_URL}/audio/${fileName}`);
    } catch (err) {
        console.error("❌ AI/TTS error:", err.message);
        twiml.say("Sorry, I had a problem. Please try again.");
    }

    twiml.redirect(`${process.env.NGROK_URL}/listen`);
    res.type("text/xml").send(twiml.toString());
};

exports.callIndia = async (req, res) => {
    try {
        const call = await makeIndiaCall();
        res.send(`Call started: ${call.sid}`);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
};
