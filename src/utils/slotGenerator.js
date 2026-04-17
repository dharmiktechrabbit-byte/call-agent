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

    // Detect date number (e.g. "19" in "19 tarikh" or "19 2:00") if no day keyword found
    if (dayOffset === 0) {
        // Match a number NOT immediately followed by ":" (so we don't pick up the time part)
        const dateNumMatch = text.match(/\b(\d{1,2})\b(?!\s*:)/);
        if (dateNumMatch) {
            const dayNum = parseInt(dateNumMatch[1]);
            const todayUTC = now.getUTCDate();
            if (dayNum >= 1 && dayNum <= 31 && dayNum !== todayUTC) {
                // Compute offset — if day is in the past this month, roll to next month
                const candidate = new Date(now);
                candidate.setUTCDate(dayNum);
                if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
                const msPerDay = 24 * 60 * 60 * 1000;
                dayOffset = Math.round((candidate - now) / msPerDay);
            }
        }
    }

    // Extract hour — prefer H:MM colon format, then standalone number with AM/PM marker
    let targetHour = 11; // default 11 AM
    const isPM = text.includes("शाम") || text.includes("sham") || text.includes("pm") || text.includes("evening") || text.includes("afternoon");
    const isAM = text.includes("सुबह") || text.includes("subah") || text.includes("am") || text.includes("morning");

    const colonMatch = text.match(/(\d{1,2}):(\d{2})/);
    const markerMatch = text.match(/(\d{1,2})\s*(?:am|pm|बजे|baje)/);
    const bareMatch = text.match(/\b(\d{1,2})\b(?!\s*:)/);

    if (colonMatch) {
        targetHour = parseInt(colonMatch[1]);
    } else if (markerMatch) {
        targetHour = parseInt(markerMatch[1]);
    } else if (bareMatch) {
        const n = parseInt(bareMatch[1]);
        // Only treat as hour if it's a plausible hour (1–23), not a date we already handled
        if (n >= 1 && n <= 23) targetHour = n;
    }

    if (isPM && targetHour < 12) targetHour += 12;
    if (isAM && targetHour === 12) targetHour = 0;
    // Ambiguous small numbers (1–8) without AM/PM marker → assume PM for clinic hours
    if (!isAM && !isPM && targetHour >= 1 && targetHour <= 8) targetHour += 12;

    // Clamp to clinic hours: 10 AM – 6 PM
    if (targetHour < 10) targetHour = 10;
    if (targetHour > 18) targetHour = 18;

    // targetHour is in IST — convert to UTC (IST = UTC+5:30)
    const IST_OFFSET_MIN = 330;
    const utcTotalMin = targetHour * 60 - IST_OFFSET_MIN;
    const utcHour = Math.floor(utcTotalMin / 60);
    const utcMin = utcTotalMin % 60;

    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset);
    targetDate.setUTCHours(utcHour, utcMin, 0, 0);

    const pad = (n) => String(n).padStart(2, "0");
    const y = targetDate.getUTCFullYear();
    const m = pad(targetDate.getUTCMonth() + 1);
    const d = pad(targetDate.getUTCDate());

    return `${y}-${m}-${d}T${pad(utcHour)}:${pad(utcMin)}:00Z`;
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
