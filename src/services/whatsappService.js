const twilio = require("twilio");

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const sendWhatsAppMessage = async ({ phone, name, treatment, time, summary }) => {
    try {
        console.log("📲 WhatsApp send requested");
        console.log("📞 Raw phone:", phone);
        console.log("👤 Name:", name);
        console.log("🦷 Treatment:", treatment);
        console.log("🕒 Time:", time);

        // Phone from Twilio is already E.164 (+919054535541) — don't add +91 again
        const cleanPhone = phone.startsWith("+") ? phone : `+91${phone}`;
        const toNumber = `whatsapp:${cleanPhone}`;
        console.log("📤 Sending TO:", toNumber);
        console.log("📥 Sending FROM:", process.env.TWILIO_WHATSAPP_NUMBER);

        // Use summary (AI confirmation reply) as fallback when fields are missing
        const displayName      = name      || "Patient";
        const displayTreatment = treatment || "dental treatment";
        const displayTime      = time      || "your scheduled time";

        const body = summary
            ? `🦷 *Bright Smile Dental Clinic*\n\nनमस्ते ${displayName} जी,\n\n${summary}\n\nThank you for booking with us! 🙏`
            : `🦷 *Bright Smile Dental Clinic*\n\nनमस्ते ${displayName} जी,\nआपकी ${displayTreatment} की अपॉइंटमेंट ${displayTime} पर बुक हो गई है।\nधन्यवाद 🙏`;

        console.log("📝 Message body:", body);

        const message = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: toNumber,
            body
        });

        console.log("✅ WhatsApp sent successfully");
        console.log("🆔 Message SID:", message.sid);
        console.log("📦 Full Twilio response:", message);

        return message;
    } catch (error) {
        console.error("❌ WhatsApp send failed");
        console.error("❌ Error message:", error.message);
        console.error("❌ Error code:", error.code);
        console.error("❌ More info:", error.moreInfo);
        console.error("❌ Status:", error.status);

        throw error;
    }
};

module.exports = { sendWhatsAppMessage };