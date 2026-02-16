// api/index.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// GLOBAL VARIABLE to cache the connection between requests
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    // Connect to MongoDB (Use Env Variable for security)
    const client = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000 // Fail fast if DB is down
    });

    cachedDb = client;
    return cachedDb;
}

// Define Schema (Same as before)
const LocationSchema = new mongoose.Schema({
    deviceId: String,
    timestamp: Date,
    lat: Number,
    lng: Number,
    accuracy: Number,
    source: String,
    raw: Object
});

// "LocationLog" will be compiled only once
const LocationLog = mongoose.models.LocationLog || mongoose.model('LocationLog', LocationSchema);

app.post('/webhook', async (req, res) => {
    try {
        await connectToDatabase(); // Ensure DB is connected

        console.log('Received data:', req.body);
        const msg = req.body;

        if (msg.location) {
            await LocationLog.create({
                deviceId: msg.deviceId,
                timestamp: new Date(msg.timestamp || Date.now()),
                lat: msg.location.lat,
                lng: msg.location.lon,
                accuracy: msg.location.uncertainty,
                source: 'nrf-cloud',
                raw: msg
            });
            console.log("Saved to MongoDB!");
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/', (req, res) => {
    res.send("Thingy:91 Receiver is Live!");
});

// EXPORT the app, do not listen
module.exports = app;