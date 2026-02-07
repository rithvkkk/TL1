const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONFIGURATION (We will set these in Render Dashboard later) ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

// --- DATABASE MODEL ---
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB Connected'));

const BookingSchema = new mongoose.Schema({
    name: String,
    phone: String,
    vehicle: String,
    pickup: String,
    drop: String,
    status: { type: String, default: 'Pending' }, // Pending, Assigned, Completed
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', BookingSchema);

// --- TELEGRAM BOT ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false }); // No polling for free tier stability

// --- API ROUTES ---

// 1. Create Booking (Customer)
app.post('/api/book', async (req, res) => {
    try {
        const booking = new Booking(req.body);
        await booking.save();

        // Notify Owner via Telegram
        const msg = `🚨 *NEW BOOKING* 🚨\n\n👤 ${booking.name}\n📞 ${booking.phone}\n🛺 ${booking.vehicle}\n📍 From: ${booking.pickup}\n🏁 To: ${booking.drop}`;
        await bot.sendMessage(OWNER_CHAT_ID, msg, { parse_mode: 'Markdown' });

        res.json({ success: true, message: 'Booking Sent to Owner!' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Get Pending Bookings (Driver App)
app.get('/api/jobs', async (req, res) => {
    const jobs = await Booking.find({ status: 'Pending' }).sort({ createdAt: -1 });
    res.json(jobs);
});

// 3. Accept Job (Driver)
app.post('/api/accept', async (req, res) => {
    const { bookingId, driverName } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Assigned' });
    
    // Notify Owner
    bot.sendMessage(OWNER_CHAT_ID, `✅ *Job Accepted*\nDriver ${driverName} took the booking.`);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));