const express = require('express');
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3443;

const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
}

let cachedPhotos = [];
let downloadCooldowns = new Map();
let failedAttempts = new Map();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'images/'),
    filename: (req, file, cb) => {
        const originalName = file.originalname;
        const newName = `UPLOAD_${originalName}`;
        cb(null, newName);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

function throttleDownload(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (downloadCooldowns.has(clientIP)) {
        const lastDownload = downloadCooldowns.get(clientIP);
        const timePassed = now - lastDownload;
        
        if (timePassed < 10000) {
            return res.status(429).json({ 
                error: 'Download cooldown active',
                waitTime: Math.ceil((10000 - timePassed) / 1000)
            });
        }
    }
    
    downloadCooldowns.set(clientIP, now);
    next();
}

function updatePhotoCache() {
    try {
        const files = fs.readdirSync(imagesDir);
        const imageFiles = files.filter(file => 
            /\.(jpe?g|png|gif|webp)$/i.test(file)
        );
        
        cachedPhotos = imageFiles.map(file => {
            const filePath = path.join(imagesDir, file);
            const stats = fs.statSync(filePath);
            return {
                id: file,
                name: file,
                filename: file,
                path: `/images/${file}`,
                size: stats.size,
                lastModified: stats.mtime.getTime()
            };
        });
    } catch (error) {
        console.error('Error updating cache:', error);
        cachedPhotos = [];
    }
}

const watcher = chokidar.watch(imagesDir, {ignored: /^\./, persistent: true});
watcher.on('add', () => setTimeout(updatePhotoCache, 100));
watcher.on('unlink', () => setTimeout(updatePhotoCache, 100));

updatePhotoCache();

app.set('trust proxy', true);
app.use(express.json());
app.use(express.static('.'));

app.get('/download/:filename', throttleDownload, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(imagesDir, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const throttleRate = 500 * 1024; // 500KB/s
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileSize);
    
    const readStream = fs.createReadStream(filePath);
    let totalBytes = 0;
    const startTime = Date.now();
    
    readStream.on('data', (chunk) => {
        totalBytes += chunk.length;
        const elapsed = Date.now() - startTime;
        const expectedTime = (totalBytes / throttleRate) * 1000;
        const delay = Math.max(0, expectedTime - elapsed);
        
        setTimeout(() => {
            res.write(chunk);
        }, delay);
    });
    
    readStream.on('end', () => {
        const elapsed = Date.now() - startTime;
        const expectedTime = (totalBytes / throttleRate) * 1000;
        const delay = Math.max(0, expectedTime - elapsed);
        
        setTimeout(() => {
            res.end();
        }, delay);
    });
});

app.use('/images', express.static('images'));

app.post('/api/verify-password', (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (failedAttempts.has(clientIP)) {
        const attempt = failedAttempts.get(clientIP);
        if (attempt.banUntil && now < attempt.banUntil) {
            return res.status(429).json({ 
                error: 'IP banned', 
                banTimeLeft: Math.ceil((attempt.banUntil - now) / 1000 / 60)
            });
        }
    }
    
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        failedAttempts.delete(clientIP);
        res.json({ success: true });
    } else {
        const current = failedAttempts.get(clientIP) || { count: 0 };
        current.count++;
        
        if (current.count >= 2) {
            current.banUntil = now + (12 * 60 * 60 * 1000);
        }
        
        failedAttempts.set(clientIP, current);
        res.json({ success: false });
    }
});

app.post('/api/upload', upload.array('photos'), (req, res) => {
    updatePhotoCache();
    res.json({ success: true });
});

app.get('/api/photos', (req, res) => {
    res.json({ photos: cachedPhotos });
});

const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS Server running on https://localhost:${PORT}`);
});