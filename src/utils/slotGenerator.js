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

    // Current time
    const now = new Date();

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
        "बुધવાર": 3, "wednesday": 3,
        "ગુરુવાર": 4, "thursday": 4,
        "શુક્રવાર": 5, "friday": 5,
        "શનિવાર": 6, "saturday": 6,
    };
    const currentDay = now.getUTCDay();
    for (const [name, target] of Object.entries(dayMap)) {
        if (text.includes(name)) {
            let diff = target - currentDay;
            if (diff <= 0) diff += 7;
            dayOffset = diff;
            break;
        }
    }

    // Extract hour from text (e.g. "5:00", "11", "3 बजे")
    let targetHour = 11; // default 11 AM
    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?/);
    if (timeMatch) {
        targetHour = parseInt(timeMatch[1]);
        const isPM = text.includes("शाम") || text.includes("sham") || text.includes("pm") || text.includes("evening") || text.includes("afternoon");
        const isAM = text.includes("सुबह") || text.includes("subah") || text.includes("am") || text.includes("morning");
        if (isPM && targetHour < 12) targetHour += 12;
        if (isAM && targetHour === 12) targetHour = 0;
        // Ambiguous small numbers (1-8) without AM/PM marker → assume PM for clinic hours
        if (!isAM && !isPM && targetHour >= 1 && targetHour <= 8) targetHour += 12;
    }

    // Clamp to clinic hours: 10 AM – 6 PM
    if (targetHour < 10) targetHour = 10;
    if (targetHour > 18) targetHour = 18;

    // Build target date (in UTC) and return as ISO string
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset);
    targetDate.setUTCHours(targetHour, 0, 0, 0);

    const pad = (n) => String(n).padStart(2, "0");
    const y = targetDate.getUTCFullYear();
    const m = pad(targetDate.getUTCMonth() + 1);
    const d = pad(targetDate.getUTCDate());
    const h = pad(targetHour);

    return `${y}-${m}-${d}T${h}:00:00Z`;
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
