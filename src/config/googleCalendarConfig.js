const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({
    version: "v3",
    auth,
});

module.exports = calendar;