const VoiceResponse = require("twilio").twiml.VoiceResponse;
const { makeIndiaCall } = require("../services/twilioService");
const { getAiReplyFromText } = require("../services/aiService");
const { textToSpeechFile } = require("../services/ttsService");
const { sendWhatsAppMessage } = require("../services/whatsappService");
const { createPaymentLink } = require("../services/stripeService");
const { bookAppointment } = require("../services/appointmentService");
const { parseBookingTime } = require("../utils/slotGenerator");
// In-memory chat history per call (keyed by CallSid)
const chatHistories = new Map();

exports.incomingCall = async (req, res) => {
    console.log("📞 incomingCall webhook hit");

    const callSid = req.body.CallSid;
    const from = req.body.From || "";
    const to = req.body.To || "";
    const twilioNum = process.env.TWILIO_PHONE_NUMBER || "";

    // For inbound calls: From = user, To = Twilio
    // For outbound calls: From = Twilio, To = user
    const callerPhone = from === twilioNum ? to : from;

    chatHistories.set(callSid, { messages: [], booking: { phone: callerPhone } });
    console.log("📱 Caller number:", callerPhone);

    const twiml = new VoiceResponse();

    try {
        const welcomeText = "Hello, welcome to Bright Smile Dental Clinic. You can speak in English, Hindi, or Gujarati. How may I help you?";
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
        language: "en-IN",
        hints: "kal, aaj, parso, subah, sham, baje, appointment, अपॉइंटमेंट, दाँत, दर्द, सफाई, भरना, जड़ का इलाज, ब्रेसेज़, इम्प्लांट, एक्सरे, डॉक्टर अंजलि, डॉक्टर राहुल, सोमवार, मंगलवार, बुधवार, गुरुवार, शुक्रवार, शनिवार, સફાઈ, દાંત, ડૉક્ટર, cleaning, filling, root canal, braces, implant, surgery, checkup, monday, tuesday, wednesday, thursday, friday, saturday"
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
        if (text.includes("सफाई") || text.includes("cleaning")) booking.treatment = "सफाई (Cleaning)";
        else if (text.includes("भरना") || text.includes("filling")) booking.treatment = "भरना (Filling)";
        else if (text.includes("जड़") || text.includes("root canal") || text.includes("RCT")) booking.treatment = "जड़ का इलाज (RCT)";
        else if (text.includes("ब्रेसेज़") || text.includes("braces")) booking.treatment = "ब्रेसेज़ (Braces)";
        else if (text.includes("इम्प्लांट") || text.includes("implant")) booking.treatment = "इम्प्लांट (Implant)";
        else if (text.includes("सर्जरी") || text.includes("surgery")) booking.treatment = "सर्जरी (Surgery)";
        else if (text.includes("एक्सरे") || text.includes("x-ray") || text.includes("xray")) booking.treatment = "एक्सरे (X-Ray)";
        else if (text.includes("दर्द") || text.includes("pain")) booking.treatment = "दर्द जाँच (Pain checkup)";
        else if (text.includes("बच्चे") || text.includes("child")) booking.treatment = "बच्चों की जाँच (Child checkup)";
    }

    // time/date — capture any turn that mentions a time or day
    const hasTimeWord =
        text.includes("कल") || text.includes("आज") ||
        text.includes("शाम") || text.includes("सुबह") ||
        text.includes("tomorrow") || text.includes("today") ||
        text.includes("morning") || text.includes("evening") ||
        text.includes("monday") || text.includes("tuesday") ||
        text.includes("wednesday") || text.includes("thursday") ||
        text.includes("friday") || text.includes("saturday") ||
        text.includes("सोमवार") || text.includes("मंगलवार") ||
        text.includes("बुधवार") || text.includes("गुरुवार") ||
        text.includes("शुक्रवार") || text.includes("शनिवार") ||
        text.includes("am") || text.includes("pm") ||
        text.includes("बजे") || /\d{1,2}:\d{2}/.test(text) ||
        /\b\d{1,2}\s*(?:am|pm|बजे)/.test(text);

    if (hasTimeWord) {
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

        const replyLower = aiReply.toLowerCase();
        const bookingConfirmed =
            aiReply.includes("बुक कर दिया गया") ||
            aiReply.includes("बुक कर दी गई") ||
            aiReply.includes("बुक हो गई") ||
            aiReply.includes("कन्फर्म की गई") ||
            aiReply.includes("कंफर्म की गई") ||
            replyLower.includes("appointment confirmed") ||
            replyLower.includes("appointment booked") ||
            replyLower.includes("appointment is confirmed") ||
            replyLower.includes("appointment has been booked") ||
            replyLower.includes("book ho gaya hai") ||
            replyLower.includes("confirm kiya gaya hai") ||
            replyLower.includes("confirm kiya gaya") ||
            replyLower.includes("confirm hui") ||
            replyLower.includes("book kar di gai hai");


        if (!booking.name) {
            const aiNameMatch = aiReply.match(/(?:धन्यवाद[,،]?\s*|नमस्ते[,،]?\s*|dhanyavaad[,\s]+|thank you[,\s]+)([^\s।!,،]+)\s*(?:जी|ji)?/i);
            if (aiNameMatch) booking.name = aiNameMatch[1];
        }

        // Phone is always available from caller ID — that's enough to send WhatsApp
        const bookingComplete = !!booking.phone && !!booking.time;
        if (bookingConfirmed && bookingComplete) {
            const selectedTime = parseBookingTime(booking.time);
            console.log("📅 Parsed booking time:", selectedTime, "from:", booking.time);

            const bookingResult = await bookAppointment({
                patientName: booking.name || "Patient",
                phone: booking.phone,
                treatment: booking.treatment || "Dental Checkup",
                selectedTime
            });

            if (!bookingResult.success) {
                console.log("❌ Booking failed:", bookingResult.error);
                
                // Tell AI the slot is busy so it can apologize in the correct language
                const retryPrompt = `[SYSTEM: The booking for ${booking.time} failed because that slot is already taken. Please apologize to the patient and ask them to choose another time. Reply ONLY in the language they were just speaking (Hindi/Gujarati/English).]`;
                
                const apologyResponse = await getAiReplyFromText(retryPrompt, history);
                const apologyText = apologyResponse; // In the original code, it returns string
                
                history.push({ role: "assistant", content: apologyText });
                console.log("🤖 AI (Apology):", apologyText);

                const fileName = await textToSpeechFile(apologyText);
                twiml.play(`${process.env.NGROK_URL}/audio/${fileName}`);
                twiml.redirect(`${process.env.NGROK_URL}/listen`);
                return res.type("text/xml").send(twiml.toString());
            }

            // If system moved to a different slot, inform caller
            if (bookingResult.slotChanged) {
                const altMsg = `The ${bookingResult.requestedLabel} slot was already booked. I have scheduled your appointment for ${bookingResult.bookedLabel} instead. Is that okay?`;
                console.log("⏰ Slot changed:", altMsg);
                const altFile = await textToSpeechFile(altMsg);
                twiml.play(`${process.env.NGROK_URL}/audio/${altFile}`);
            }

            const paymentLink = await createPaymentLink({
                name: booking.name,
                treatment: booking.treatment
            });

            await sendWhatsAppMessage({
                ...booking,
                time: bookingResult.bookedLabel,
                summary: aiReply,
                paymentLink
            });

            console.log("📅 Google Calendar event created:", bookingResult.bookedLabel);
            console.log("💳 Stripe link:", paymentLink);
            console.log("✅ WhatsApp sent:", booking);

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
