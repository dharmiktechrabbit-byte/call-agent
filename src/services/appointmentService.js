const { checkSlotAvailability, createAppointmentEvent } = require("./googleCalendarService");
const { generateSlotTimes, formatSlotForSpeech } = require("../utils/slotGenerator");

// Try the requested slot first, then up to 4 next hourly slots same day
async function findAvailableSlot(startISO) {
    const IST_OFFSET_MS = 330 * 60 * 1000;
    let current = new Date(startISO);

    for (let attempt = 0; attempt < 5; attempt++) {
        const { startTime, endTime } = generateSlotTimes(current.toISOString());
        const available = await checkSlotAvailability(startTime, endTime);

        if (available) {
            return { startTime, endTime };
        }

        // Advance 1 hour
        current = new Date(current.getTime() + 60 * 60 * 1000);

        // Stop if past 7 PM IST
        const istHour = new Date(current.getTime() + IST_OFFSET_MS).getUTCHours();
        if (istHour >= 19) break;
    }

    return null; // No slots available today
}

async function bookAppointment({ patientName, phone, treatment, selectedTime }) {
    const slot = await findAvailableSlot(selectedTime);

    if (!slot) {
        return {
            success: false,
            message: "Sorry, no slots are available today. Please try another day."
        };
    }

    // If the slot differs from what user requested, note it
    const requestedLabel = formatSlotForSpeech(selectedTime);
    const bookedLabel    = formatSlotForSpeech(slot.startTime);
    const slotChanged    = requestedLabel !== bookedLabel;

    const event = await createAppointmentEvent({
        patientName,
        phone,
        treatment,
        startTime: slot.startTime,
        endTime:   slot.endTime
    });

    return {
        success:      true,
        event,
        startTime:    slot.startTime,
        endTime:      slot.endTime,
        bookedLabel,
        slotChanged,
        requestedLabel
    };
}

module.exports = { bookAppointment };
