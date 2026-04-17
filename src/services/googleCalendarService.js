const calendar = require("../config/googleCalendarConfig");

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

function toISTString(utcISO) {
    const IST_OFFSET_MS = 330 * 60 * 1000;
    const dt = new Date(new Date(utcISO).getTime() + IST_OFFSET_MS);
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00+05:30`;
}

const checkSlotAvailability = async (startTime, endTime) => {
    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin: startTime,
            timeMax: endTime,
            items: [{ id: CALENDAR_ID }],
        },
    });

    const busy =
        response.data.calendars[CALENDAR_ID]?.busy || [];

    return busy.length === 0;
};

const createAppointmentEvent = async ({
    patientName,
    phone,
    treatment,
    startTime,
    endTime,
}) => {
    const response = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
            summary: `Appointment - ${patientName}`,
            description: `
Phone: ${phone}
Treatment: ${treatment}
Booked via AI Receptionist
      `,
            start: {
                dateTime: toISTString(startTime),
                timeZone: "Asia/Kolkata",
            },
            end: {
                dateTime: toISTString(endTime),
                timeZone: "Asia/Kolkata",
            },
        },
    });

    return response.data;
};

module.exports = {
    checkSlotAvailability,
    createAppointmentEvent,
};