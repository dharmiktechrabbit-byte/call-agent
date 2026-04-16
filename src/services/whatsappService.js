const twilio = require("twilio");

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const sendWhatsAppMessage = async ({
    phone,
    name,
    treatment,
    time,
    summary,
    paymentLink
}) => {
    try {
        console.log("📲 WhatsApp send requested");
        console.log("📞 Raw phone:", phone);

        const cleanPhone = phone.startsWith("+") ? phone : `+91${phone}`;
        const toNumber = `whatsapp:${cleanPhone}`;

        const displayName = name || "Patient";
        const displayTreatment = treatment || "dental treatment";
        const displayTime = time || "your scheduled time";

        let body = "";

        if (summary) {
            body = `🦷 *Bright Smile Dental Clinic*

नमस्ते ${displayName} जी,

${summary}`;
        } else {
            body = `🦷 *Bright Smile Dental Clinic*

नमस्ते ${displayName} जी,
आपकी ${displayTreatment} की अपॉइंटमेंट ${displayTime} पर बुक हो गई है।`;
        }

        // ✅ Add Stripe payment link
        if (paymentLink) {
            body += `

💳 कृपया payment यहाँ complete करें:
${paymentLink}`;
        }

        body += `

Thank you for booking with us! 🙏`;

        const message = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: toNumber,
            body
        });

        console.log("✅ WhatsApp sent successfully");
        return message;

    } catch (error) {
        console.error("❌ WhatsApp send failed", error.message);
        throw error;
    }
};

module.exports = { sendWhatsAppMessage };