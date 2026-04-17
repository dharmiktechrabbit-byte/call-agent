const { checkSlotAvailability, createAppointmentEvent } = require("./googleCalendarService");
const { generateSlotTimes, formatSlotForSpeech } = require("../utils/slotGenerator");

// Try the requested slot first, then up to 4 next hourly slots same day
async function findAvailableSlot(startISO) {
    const { startTime, endTime } = generateSlotTimes(startISO);
    const available = await checkSlotAvailability(startTime, endTime);

    if (available) {
        return { startTime, endTime };
    }

    return null; // Slot busy, do not auto-advance
}

async function bookAppointment({ patientName, phone, treatment, selectedTime }) {
    const slot = await findAvailableSlot(selectedTime);

    if (!slot) {
        return {
            success: false,
            error: "busy",
            message: "Sorry, this slot is already booked. Please try another time."
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
