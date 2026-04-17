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

        let body = `🦷 *Bright Smile Dental Clinic*\n\n`;
        body += `${displayName}, aapki appointment ${displayTreatment} ke liye ${displayTime} confirm hui. Dhanyavaad!`;

        if (paymentLink) {
            body += `\n\n💳 *Advance Payment (Rs 500):*\n${paymentLink}`;
        }

        body += `\n\n📍 Shop 4, Linking Road, Bandra West, Mumbai\n📞 +91 98200 11111\n\nThank you for choosing Bright Smile! 🙏`;

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