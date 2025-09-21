const elements = {
    upload: document.getElementById('upload'),
    gallery: document.getElementById('gallery'),
    modal: document.getElementById('modal'),
    modalImg: document.getElementById('modal-img'),
    exifInfo: document.getElementById('exif-info'),
    downloadBtn: document.getElementById('download-btn'),
    closeModal: document.querySelector('.close'),
    adminBtn: document.getElementById('admin-btn'),
    adminPanel: document.getElementById('admin-panel'),
    adminPassword: document.getElementById('admin-password'),
    loginBtn: document.getElementById('login-btn'),
    uploadSection: document.getElementById('upload-section'),
    closeAdmin: document.querySelector('.close-admin')
};

let photos = [];
let currentPhoto = null;
let isAdmin = false;

// Initialize
loadPhotos();

// Event listeners
elements.adminBtn.addEventListener('click', () => {
    elements.adminPanel.style.display = 'block';
    setTimeout(() => elements.adminPassword.focus(), 100);
});

elements.closeAdmin.addEventListener('click', closeAdminPanel);
elements.adminPanel.addEventListener('click', (e) => {
    if (e.target === elements.adminPanel) closeAdminPanel();
});

elements.loginBtn.addEventListener('click', verifyPassword);
elements.adminPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
});

elements.upload.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const formData = new FormData();
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            formData.append('photos', file);
        }
    });
    
    try {
        await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        loadPhotos();
    } catch (error) {
        console.error('Upload error:', error);
    }
});

elements.closeModal.addEventListener('click', () => {
    elements.modal.style.display = 'none';
});

elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) {
        elements.modal.style.display = 'none';
    }
});

elements.downloadBtn.addEventListener('click', async () => {
    if (!currentPhoto) return;
    
    try {
        elements.downloadBtn.disabled = true;
        elements.downloadBtn.textContent = 'Downloading...';
        
        const response = await fetch(`/download/${currentPhoto.filename}`);
        
        if (response.status === 429) {
            const data = await response.json();
            elements.downloadBtn.textContent = `Wait ${data.waitTime}s`;
            setTimeout(() => {
                elements.downloadBtn.disabled = false;
                elements.downloadBtn.textContent = '⬇️ Download';
            }, data.waitTime * 1000);
            return;
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = currentPhoto.name;
        link.click();
        window.URL.revokeObjectURL(url);
        
        // Cooldown countdown
        for (let i = 10; i >= 1; i--) {
            elements.downloadBtn.textContent = `Cooldown (${i}s)`;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        elements.downloadBtn.disabled = false;
        elements.downloadBtn.textContent = '⬇️ Download';
        
    } catch (error) {
        console.error('Download error:', error);
        elements.downloadBtn.disabled = false;
        elements.downloadBtn.textContent = '⬇️ Download';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (elements.modal.style.display === 'block') {
            elements.modal.style.display = 'none';
        }
        if (elements.adminPanel.style.display === 'block') {
            closeAdminPanel();
        }
    }
});

// Functions
async function verifyPassword() {
    try {
        const response = await fetch('/api/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: elements.adminPassword.value })
        });
        
        if (response.status === 429) {
            const data = await response.json();
            elements.adminPassword.style.border = '2px solid #dc3545';
            alert(`IP banned for ${data.banTimeLeft} minutes`);
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            elements.uploadSection.style.display = 'block';
            elements.adminPassword.style.border = '2px solid #28a745';
            isAdmin = true;
            elements.adminPassword.style.display = 'none';
            elements.loginBtn.style.display = 'none';
        } else {
            showPasswordError();
        }
    } catch (error) {
        console.error('Auth error:', error);
        showPasswordError();
    }
}

function showPasswordError() {
    elements.adminPassword.style.border = '2px solid #dc3545';
    elements.adminPassword.value = '';
    setTimeout(() => {
        elements.adminPassword.style.border = '2px solid #ddd';
    }, 2000);
}

function closeAdminPanel() {
    elements.adminPanel.style.display = 'none';
    elements.adminPassword.value = '';
    elements.uploadSection.style.display = 'none';
    elements.adminPassword.style.border = '2px solid #ddd';
}

async function loadPhotos() {
    try {
        const response = await fetch('/api/photos');
        const data = await response.json();
        photos = data.photos || [];
        
        elements.gallery.innerHTML = '';
        photos.forEach(photo => createPhotoCard(photo));
    } catch (error) {
        console.error('Error loading photos:', error);
    }
}

function createPhotoCard(photo) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    
    const img = document.createElement('img');
    img.src = photo.path;
    img.alt = photo.name;
    
    img.onload = function() {
        const ratio = this.naturalWidth / this.naturalHeight;
        if (ratio < 0.8) {
            card.setAttribute('data-orientation', 'portrait');
        } else if (ratio > 1.3) {
            card.setAttribute('data-orientation', 'landscape');
        }
    };
    
    card.appendChild(img);
    card.addEventListener('click', () => openModal(photo));
    elements.gallery.appendChild(card);
}

function openModal(photo) {
    currentPhoto = photo;
    elements.modalImg.src = photo.path;
    elements.modal.style.display = 'block';
    
    const exifImg = new Image();
    exifImg.crossOrigin = "anonymous";
    
    exifImg.onload = function() {
        extractExifData(this, photo);
    };
    
    exifImg.onerror = function() {
        displayBasicData(photo);
    };
    
    exifImg.src = photo.path + '?t=' + Date.now();
}

function extractExifData(img, photo) {
    try {
        EXIF.getData(img, function() {
            const exifData = EXIF.getAllTags(this);
            displayPhotoData(photo, exifData);
        });
    } catch (error) {
        console.error('EXIF error:', error);
        displayBasicData(photo);
    }
}

function displayPhotoData(photo, exifData) {
    elements.exifInfo.innerHTML = '';
    
    const fields = {
        'Camera': exifData.Make && exifData.Model ? `${exifData.Make} ${exifData.Model}` : 'Unknown',
        'Aperture': exifData.FNumber ? `f/${exifData.FNumber}` : 'N/A',
        'ISO': exifData.ISOSpeedRatings || 'N/A',
        'Shutter Speed': exifData.ExposureTime ? `1/${Math.round(1/exifData.ExposureTime)}s` : 'N/A',
        'Focal Length': exifData.FocalLength ? `${exifData.FocalLength}mm` : 'N/A',
        'Date Taken': exifData.DateTime || new Date(photo.lastModified).toLocaleString(),
        'White Balance': exifData.WhiteBalance === 0 ? 'Auto' : (exifData.WhiteBalance === 1 ? 'Manual' : 'N/A'),
        'Dimensions': exifData.PixelXDimension && exifData.PixelYDimension ? 
            `${exifData.PixelXDimension} x ${exifData.PixelYDimension}` : 'N/A',
        'File Size': `${(photo.size / 1024 / 1024).toFixed(2)} MB`
    };
    
    Object.entries(fields).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'exif-item';
        item.innerHTML = `<strong>${key}:</strong> ${value}`;
        elements.exifInfo.appendChild(item);
    });
}

function displayBasicData(photo) {
    elements.exifInfo.innerHTML = '';
    
    const basicFields = {
        'Filename': photo.name,
        'File Size': `${(photo.size / 1024 / 1024).toFixed(2)} MB`,
        'Date Modified': new Date(photo.lastModified).toLocaleString()
    };
    
    Object.entries(basicFields).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'exif-item';
        item.innerHTML = `<strong>${key}:</strong> ${value}`;
        elements.exifInfo.appendChild(item);
    });
}