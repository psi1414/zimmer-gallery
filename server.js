const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
}

let cachedPhotos = [];

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

app.use(express.json());
app.use(express.static('.'));
app.use('/images', express.static('images'));

app.post('/api/verify-password', (req, res) => {
    res.json({ success: req.body.password === process.env.ADMIN_PASSWORD });
});

app.post('/api/upload', upload.array('photos'), (req, res) => {
    const fileData = req.files.map(file => ({
        id: Date.now() + Math.random(),
        name: file.originalname,
        filename: file.filename,
        path: `/images/${file.filename}`,
        size: file.size
    }));
    
    updatePhotoCache();
    res.json({ success: true, files: fileData });
});

app.get('/api/photos', (req, res) => {
    res.json({ photos: cachedPhotos });
});

app.post('/api/update-title', (req, res) => {
    const { filename, newTitle } = req.body;
    
    const titlesFile = path.join(__dirname, 'titles.json');
    let titles = {};
    
    if (fs.existsSync(titlesFile)) {
        titles = JSON.parse(fs.readFileSync(titlesFile, 'utf8'));
    }
    
    titles[filename] = newTitle;
    fs.writeFileSync(titlesFile, JSON.stringify(titles, null, 2));
    
    res.json({ success: true });
});

app.get('/api/titles', (req, res) => {
    const titlesFile = path.join(__dirname, 'titles.json');
    let titles = {};
    
    if (fs.existsSync(titlesFile)) {
        titles = JSON.parse(fs.readFileSync(titlesFile, 'utf8'));
    }
    
    res.json(titles);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});