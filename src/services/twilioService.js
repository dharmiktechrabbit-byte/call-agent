const client = require("../config/twilioConfig");

exports.makeIndiaCall = async () => {
    return await client.calls.create({
        to: "+919054535541",
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.NGROK_URL}/incoming-call`
    });
};

exports.playAudioOnCall = async (callSid, fileName) => {
    const twiml = `
        <Response>
            <Play>${process.env.NGROK_URL}/audio/${fileName}</Play>
            <Pause length="1"/>
            <Connect>
               <Stream url="wss://${process.env.NGROK_DOMAIN}/media-stream" />
            </Connect>
        </Response>
    `;

    return await client.calls(callSid).update({
        twiml
    });
};