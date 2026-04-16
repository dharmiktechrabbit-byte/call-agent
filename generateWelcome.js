require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { textToSpeech } = require("./src/services/ttsService");

(async () => {
    try {
        const fileName = await textToSpeech(
            "Hello, welcome to Bright Smile Dental Clinic. How may I help you?"
        );

        const oldPath = path.join(__dirname, "public/audio", fileName);
        const newPath = path.join(__dirname, "public/audio", "welcome.mp3");

        fs.renameSync(oldPath, newPath);

        console.log("✅ welcome.mp3 created successfully");
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
})();