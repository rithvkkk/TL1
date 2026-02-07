const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; 
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// --- MODELS ---
const BookingSchema = new mongoose.Schema({
    name: String,
    phone: String,
    vehicle: String,
    pickup: String,
    drop: String,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', BookingSchema);

// New Driver Schema for OTP
const DriverSchema = new mongoose.Schema({
    phone: String,
    otp: String,
    otpExpires: Date
});
const Driver = mongoose.model('Driver', DriverSchema);

// --- TELEGRAM BOT ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// --- ROUTES ---

app.get('/', (req, res) => res.send('🛺 Tavarekere Logistics Backend Running!'));

// 1. Generate OTP (Driver Login)
app.post('/api/driver/login', async (req, res) => {
    const { phone } = req.body;
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString(); // Random 4 digits

    // Save OTP to DB (Upsert: Create if new, update if exists)
    await Driver.findOneAndUpdate(
        { phone }, 
        { otp: generatedOtp, otpExpires: Date.now() + 300000 }, // Expires in 5 mins
        { upsert: true, new: true }
    );

    // Send OTP to OWNER via Telegram (Free SMS workaround)
    bot.sendMessage(OWNER_CHAT_ID, `🔐 *DRIVER LOGIN REQUEST*\n\nPhone: ${phone}\nOTP: *${generatedOtp}*`, { parse_mode: 'Markdown' });

    res.json({ success: true, message: 'OTP sent to Admin!' });
});

// 2. Verify OTP
app.post('/api/driver/verify', async (req, res) => {
    const { phone, otp } = req.body;
    const driver = await Driver.findOne({ phone });

    if (!driver || driver.otp !== otp) {
        return res.json({ success: false, message: 'Invalid OTP' });
    }

    res.json({ success: true, message: 'Login Successful' });
});

// 3. Customer Booking
app.post('/api/book', async (req, res) => {
    try {
        const booking = new Booking(req.body);
        await booking.save();
        const msg = `🚨 *NEW BOOKING* 🚨\n\n👤 ${booking.name}\n📞 ${booking.phone}\n🛺 ${booking.vehicle}\n📍 ${booking.pickup} ➡️ ${booking.drop}`;
        await bot.sendMessage(OWNER_CHAT_ID, msg, { parse_mode: 'Markdown' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Get Jobs
app.get('/api/jobs', async (req, res) => {
    const jobs = await Booking.find({ status: 'Pending' }).sort({ createdAt: -1 });
    res.json(jobs);
});

// 5. Accept Job
app.post('/api/accept', async (req, res) => {
    const { bookingId, driverName } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Assigned' });
    bot.sendMessage(OWNER_CHAT_ID, `✅ *Job Accepted*\nDriver ${driverName} took the booking.`);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
