const calendar = require("../config/googleCalendarConfig");

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

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
                dateTime: startTime,
                timeZone: "UTC",
            },
            end: {
                dateTime: endTime,
                timeZone: "UTC",
            },
        },
    });

    return response.data;
};

module.exports = {
    checkSlotAvailability,
    createAppointmentEvent,
};