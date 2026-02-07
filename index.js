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
    price: String,
    paymentMethod: { type: String, default: 'Cash' }, // NEW: 'Cash' or 'UPI'
    status: { type: String, default: 'Pending' }, 
    driverPhone: { type: String, default: null },
    driverName: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', BookingSchema);

const DriverSchema = new mongoose.Schema({
    name: String,
    phone: String,
    vehicle: String, 
    otp: String,
    otpExpires: Date
});
const Driver = mongoose.model('Driver', DriverSchema);

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// --- ROUTES ---

app.post('/api/driver/login', async (req, res) => {
    const { phone, name, vehicle } = req.body;
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString(); 
    await Driver.findOneAndUpdate({ phone }, { otp: generatedOtp, otpExpires: Date.now() + 300000, name: name, vehicle: vehicle }, { upsert: true, new: true });
    bot.sendMessage(OWNER_CHAT_ID, `🔐 *LOGIN*\nName: ${name}\nVeh: ${vehicle}\nPh: ${phone}\nOTP: *${generatedOtp}*`, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

app.post('/api/driver/verify', async (req, res) => {
    const { phone, otp } = req.body;
    const driver = await Driver.findOne({ phone });
    if (!driver || driver.otp !== otp) return res.json({ success: false });
    res.json({ success: true, name: driver.name, vehicle: driver.vehicle });
});

// BOOKING: Now accepts paymentMethod
app.post('/api/book', async (req, res) => {
    try {
        const booking = new Booking(req.body);
        const savedBooking = await booking.save();
        
        // Notify Admin (Mention Payment Type)
        bot.sendMessage(OWNER_CHAT_ID, `🚨 *NEW BOOKING (${booking.paymentMethod})*\n💰 Est: ${booking.price}\n👤 ${booking.name}\n📞 ${booking.phone}\n📍 ${booking.pickup} ➡️ ${booking.drop}`);
        
        res.json({ success: true, booking: savedBooking });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jobs', async (req, res) => {
    const { vehicle } = req.query;
    const query = { status: 'Pending' };
    if (vehicle) query.vehicle = vehicle;
    const jobs = await Booking.find(query).sort({ createdAt: -1 });
    res.json(jobs);
});

app.post('/api/accept', async (req, res) => {
    const { bookingId, driverPhone, driverName } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Assigned', driverPhone, driverName });
    bot.sendMessage(OWNER_CHAT_ID, `✅ *Job Accepted*\nDriver: ${driverName}`);
    res.json({ success: true });
});

app.post('/api/complete', async (req, res) => {
    const { bookingId } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Completed' });
    bot.sendMessage(OWNER_CHAT_ID, `🏁 *Job Completed*`);
    res.json({ success: true });
});

app.post('/api/cancel', async (req, res) => {
    const { bookingId } = req.body;
    await Booking.findByIdAndUpdate(bookingId, { status: 'Cancelled' });
    bot.sendMessage(OWNER_CHAT_ID, `❌ *Job Cancelled*`);
    res.json({ success: true });
});

app.get('/api/driver/history', async (req, res) => {
    const { phone } = req.query;
    const jobs = await Booking.find({ driverPhone: phone }).sort({ createdAt: -1 });
    res.json(jobs);
});

app.get('/api/admin/all', async (req, res) => {
    const jobs = await Booking.find({}).sort({ createdAt: -1 });
    res.json(jobs);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
