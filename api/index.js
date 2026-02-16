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

// Add this route to periodically fetch messages from nRF Cloud
app.get('/fetch-messages', async (req, res) => {
    try {
        await connectToDatabase();

        const end = new Date();
        const start = new Date(end.getTime() - 5 * 60 * 1000); // last 5 minutes

        const response = await fetch(
            `https://api.nrfcloud.com/v1/messages?` +
            `inclusiveStart=${start.toISOString()}&` +
            `exclusiveEnd=${end.toISOString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.NRF_CLOUD_API_KEY}`
                }
            }
        );

        const data = await response.json();
        let saved = 0;

        for (const msg of (data.items || [])) {
            if (msg.message?.appId === 'GROUND_FIX' || msg.message?.appId === 'GNSS' || msg.message?.appId === 'LOCATION') {
                const loc = msg.message?.data;
                if (loc?.lat && (loc?.lon || loc?.lng)) {
                    await LocationLog.updateOne(
                        { deviceId: msg.deviceId, timestamp: new Date(msg.receivedAt) },
                        {
                            deviceId: msg.deviceId,
                            timestamp: new Date(msg.receivedAt),
                            lat: loc.lat,
                            lng: loc.lon || loc.lng,
                            accuracy: loc.uncertainty,
                            source: 'nrf-cloud',
                            raw: msg
                        },
                        { upsert: true }
                    );
                    saved++;
                }
            }
        }

        res.status(200).json({ fetched: data.items?.length || 0, saved });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

app.get('/', (req, res) => {
    res.send("Thingy:91 Receiver is Live!");
});

// EXPORT the app, do not listen
module.exports = app;