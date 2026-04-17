const SLOT_DURATION = 60; // 1 hour fixed

function generateSlotTimes(startISO) {
    const start = new Date(startISO);
    const end = new Date(start.getTime() + SLOT_DURATION * 60 * 1000);
    return {
        startTime: start.toISOString(),
        endTime: end.toISOString()
    };
}

// Parse natural language booking time (Hindi/English) → ISO string with IST offset
function parseBookingTime(timeText) {
    const text = (timeText || "").toLowerCase();

    // Current time in IST
    const IST_OFFSET_MS = 330 * 60 * 1000; // +5:30 in ms
    const nowIST = new Date(Date.now() + IST_OFFSET_MS);

    // Determine day offset — Devanagari + Roman script Hindi
    let dayOffset = 0;
    if (text.includes("कल") || text.includes("tomorrow") || text.includes("kal")) {
        dayOffset = 1;
    } else if (text.includes("परसों") || text.includes("day after tomorrow") || text.includes("parso")) {
        dayOffset = 2;
    }

    // Day-of-week detection (use next occurrence)
    const dayMap = {
        "सोमवार": 1, "monday": 1,
        "मंगलवार": 2, "tuesday": 2,
        "बुधवार": 3, "wednesday": 3,
        "गुरुवार": 4, "thursday": 4,
        "शुक्रवार": 5, "friday": 5,
        "शनिवार": 6, "saturday": 6,
    };
    const currentDay = nowIST.getUTCDay();
    for (const [name, target] of Object.entries(dayMap)) {
        if (text.includes(name)) {
            let diff = target - currentDay;
            if (diff <= 0) diff += 7;
            dayOffset = diff;
            break;
        }
    }

    // Extract hour from text (e.g. "5:00", "11", "3 बजे")
    let istHour = 11; // default 11 AM
    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?/);
    if (timeMatch) {
        istHour = parseInt(timeMatch[1]);
        const isPM = text.includes("शाम") || text.includes("sham") || text.includes("pm") || text.includes("evening") || text.includes("afternoon");
        const isAM = text.includes("सुबह") || text.includes("subah") || text.includes("am") || text.includes("morning");
        if (isPM && istHour < 12) istHour += 12;
        if (isAM && istHour === 12) istHour = 0;
        // Ambiguous small numbers (1-8) without AM/PM marker → assume PM for clinic hours
        if (!isAM && !isPM && istHour >= 1 && istHour <= 8) istHour += 12;
    }

    // Clamp to clinic hours: 10 AM – 6 PM (last slot starts at 18:00)
    if (istHour < 10) istHour = 10;
    if (istHour > 18) istHour = 18;

    // Build target date (in IST) and return as ISO string with +05:30
    const targetIST = new Date(nowIST);
    targetIST.setUTCDate(targetIST.getUTCDate() + dayOffset);
    targetIST.setUTCHours(istHour, 0, 0, 0);

    const pad = (n) => String(n).padStart(2, "0");
    const y = targetIST.getUTCFullYear();
    const m = pad(targetIST.getUTCMonth() + 1);
    const d = pad(targetIST.getUTCDate());
    const h = pad(istHour);

    return `${y}-${m}-${d}T${h}:00:00+05:30`;
}

// Format ISO datetime → readable Hindi/English string for TTS
function formatSlotForSpeech(isoString) {
    const IST_OFFSET_MS = 330 * 60 * 1000;
    const dt = new Date(new Date(isoString).getTime() + IST_OFFSET_MS);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const day = days[dt.getUTCDay()];
    let hour = dt.getUTCHours();
    const ampm = hour >= 12 ? "PM" : "AM";
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return `${day} at ${hour}:00 ${ampm}`;
}

module.exports = { SLOT_DURATION, generateSlotTimes, parseBookingTime, formatSlotForSpeech };
