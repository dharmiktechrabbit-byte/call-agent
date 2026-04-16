const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createPaymentLink(patientName) {
    const paymentLink = await stripe.paymentLinks.create({
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: `Dental Appointment for ${patientName}`,
                    },
                    unit_amount: 5000, // $50
                },
                quantity: 1,
            },
        ],
    });

    return paymentLink.url;
}

module.exports = { createPaymentLink };