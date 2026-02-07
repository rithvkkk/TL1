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

// --- DATABASE ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// Updated Booking Schema (Added driverPhone)
const BookingSchema = new mongoose.Schema({
    name: String,
    phone: String,
    vehicle: String,
    pickup: String,
    drop: String,
    status: { type: String, default: 'Pending' }, // Pending, Assigned, Completed
    driverPhone: { type: String, default: null }, // Who took the job?
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', BookingSchema);

// Driver Schema (For Login)
const DriverSchema = new mongoose.Schema({
    phone: String,
    otp: String,
    otpExpires: Date
});
const Driver = mongoose.model('Driver', DriverSchema);

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

app.get('/', (req, res) => res.send('🛺 Tavarekere Logistics Backend v2'));

// --- ROUTES ---

// 1. Generate OTP
app.post('/api/driver/login', async (req, res) => {
    const { phone } = req.body;
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString(); 
    await Driver.findOneAndUpdate(
        { phone }, 
        { otp: generatedOtp, otpExpires: Date.now() + 300000 }, 
        { upsert: true, new: true }
    );
    bot.sendMessage(OWNER_CHAT_ID, `🔐 *LOGIN REQUEST*\nDriver: ${phone}\nOTP: *${generatedOtp}*`, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// 2. Verify OTP
app.post('/api/driver/verify', async (req, res) => {
    const { phone, otp } = req.body;
    const driver = await Driver.findOne({ phone });
    if (!driver || driver.otp !== otp) return res.json({ success: false });
    res.json({ success: true });
});

// 3. New Booking
app.post('/api/book', async (req, res) => {
    try {
        const booking = new Booking(req.body);
        await booking.save();
        bot.sendMessage(OWNER_CHAT_ID, `🚨 *NEW BOOKING*\n👤 ${booking.name}\n📞 ${booking.phone}\n📍 ${booking.pickup} ➡️ ${booking.drop}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Get Pending Jobs (For Duty Board)
app.get('/api/jobs', async (req, res) => {
    const jobs = await Booking.find({ status: 'Pending' }).sort({ createdAt: -1 });
    res.json(jobs);
});

// 5. Accept Job (UPDATED: Saves Driver Phone)
app.post('/api/accept', async (req, res) => {
    const { bookingId, driverPhone } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Assigned', driverPhone });
    bot.sendMessage(OWNER_CHAT_ID, `✅ *Job Accepted*\nDriver ${driverPhone} is on the way.`);
    res.json({ success: true });
});

// 6. Complete Job (NEW!)
app.post('/api/complete', async (req, res) => {
    const { bookingId } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Completed' });
    bot.sendMessage(OWNER_CHAT_ID, `🏁 *Job Completed*\nRide finished successfully.`);
    res.json({ success: true });
});

// 7. Get Driver's Specific History (NEW!)
app.get('/api/driver/history', async (req, res) => {
    const { phone } = req.query;
    const jobs = await Booking.find({ driverPhone: phone }).sort({ createdAt: -1 });
    res.json(jobs);
});

// 8. Get All Admin Data (NEW!)
app.get('/api/admin/all', async (req, res) => {
    const jobs = await Booking.find({}).sort({ createdAt: -1 });
    res.json(jobs);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
