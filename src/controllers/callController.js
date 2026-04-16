const VoiceResponse = require("twilio").twiml.VoiceResponse;
const { makeIndiaCall } = require("../services/twilioService");
const { getAiReplyFromText } = require("../services/aiService");
const { textToSpeechFile } = require("../services/ttsService");

// In-memory chat history per call (keyed by CallSid)
const chatHistories = new Map();

exports.incomingCall = async (req, res) => {
    console.log("📞 incomingCall webhook hit");

    const callSid = req.body.CallSid;
    chatHistories.set(callSid, []);

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
        language: "hi-IN",
        hints: "अपॉइंटमेंट, दाँत, दर्द, सफाई, भरना, जड़ का इलाज, ब्रेसेज़, इन्विज़लाइन, इम्प्लांट, एक्सरे, बच्चों की जाँच, डॉक्टर अंजलि, डॉक्टर राहुल, सोमवार, मंगलवार, बुधवार, गुरुवार, शुक्रवार, शनिवार, સફાઈ, દાંત, દર્દ, ડૉક્ટર, અપોઇન્ટમેન્ટ, appointment, cleaning, filling, root canal, braces, implant, surgery, checkup"
    });

    // If user says nothing, loop back and listen again
    twiml.redirect(`${process.env.NGROK_URL}/listen`);
    res.type("text/xml").send(twiml.toString());
};

exports.processSpeech = async (req, res) => {
    const userText = req.body.SpeechResult;
    const callSid  = req.body.CallSid;
    const twiml    = new VoiceResponse();

    if (!userText) {
        console.log("🤫 No speech detected — looping");
        twiml.redirect(`${process.env.NGROK_URL}/listen`);
        return res.type("text/xml").send(twiml.toString());
    }

    console.log("📝 User:", userText);

    if (!chatHistories.has(callSid)) {
        chatHistories.set(callSid, []);
    }
    const history = chatHistories.get(callSid);

    try {
        const aiReply = await getAiReplyFromText(userText, history);
        history.push(
            { role: "user", content: userText },
            { role: "assistant", content: aiReply }
        );

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
