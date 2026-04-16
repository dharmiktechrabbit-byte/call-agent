const express = require("express");
const router = express.Router();

const {
    incomingCall,
    callIndia,
    processSpeech,
    listen,
    noResponse
} = require("../controllers/callController");

router.post("/incoming-call", incomingCall);
router.get("/call-india", callIndia);
router.post("/process-speech", processSpeech);
router.post("/listen", listen);
router.post("/no-response", noResponse);

module.exports = router;