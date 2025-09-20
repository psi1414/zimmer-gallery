const upload = document.getElementById('upload');
const gallery = document.getElementById('gallery');
const modal = document.getElementById('modal');
const modalImg = document.getElementById('modal-img');
const exifInfo = document.getElementById('exif-info');
const downloadBtn = document.getElementById('download-btn');
const closeModal = document.querySelector('.close');

const adminBtn = document.getElementById('admin-btn');
const adminPanel = document.getElementById('admin-panel');
const adminPassword = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const uploadSection = document.getElementById('upload-section');
const closeAdmin = document.querySelector('.close-admin');

let photos = [];
let currentPhoto = null;
let isAdmin = false;
let photoTitles = {};

// Initialize
loadPhotos();
loadTitles();

// Admin controls
adminBtn.addEventListener('click', () => {
    adminPanel.style.display = 'block';
    setTimeout(() => adminPassword.focus(), 100);
});

closeAdmin.addEventListener('click', closeAdminPanel);

adminPanel.addEventListener('click', (e) => {
    if (e.target === adminPanel) closeAdminPanel();
});

loginBtn.addEventListener('click', verifyPassword);

adminPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
});

async function loadTitles() {
    try {
        const response = await fetch('/api/titles');
        photoTitles = await response.json();
    } catch (error) {
        console.error('Error loading titles:', error);
    }
}

async function verifyPassword() {
    try {
        const response = await fetch('/api/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: adminPassword.value })
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadSection.style.display = 'block';
            adminPassword.style.border = '2px solid #28a745';
            isAdmin = true;
            await loadTitles();
            loadPhotos();
        } else {
            showPasswordError();
        }
    } catch (error) {
        console.error('Auth error:', error);
        showPasswordError();
    }
}

function showPasswordError() {
    adminPassword.style.border = '2px solid #dc3545';
    adminPassword.value = '';
    setTimeout(() => {
        adminPassword.style.border = '2px solid #ddd';
    }, 2000);
}

function closeAdminPanel() {
    adminPanel.style.display = 'none';
    adminPassword.value = '';
    uploadSection.style.display = 'none';
    adminPassword.style.border = '2px solid #ddd';
}

// Upload handler
upload.addEventListener('change', async function(e) {
    const files = Array.from(e.target.files);
    const formData = new FormData();
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            formData.append('photos', file);
        }
    });
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            loadPhotos();
            closeAdminPanel();
        }
    } catch (error) {
        console.error('Upload error:', error);
    }
});

// Photo loading
async function loadPhotos() {
    try {
        const response = await fetch('/api/photos');
        const data = await response.json();
        photos = data.photos || [];
        
        gallery.innerHTML = '';
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
    
    const info = document.createElement('div');
    info.className = 'photo-info';
    
    const title = photoTitles[photo.filename] || photo.name;
    
    if (isAdmin) {
        const titleInput = document.createElement('input');
        titleInput.className = 'edit-title';
        titleInput.value = title;
        titleInput.readOnly = true;
        
        titleInput.addEventListener('click', (e) => {
            e.stopPropagation();
            editTitle(titleInput, photo.filename);
        });
        info.appendChild(titleInput);
    } else {
        const fileName = document.createElement('h4');
        fileName.textContent = title;
        info.appendChild(fileName);
    }
    
    const fileSize = document.createElement('p');
    fileSize.textContent = `Size: ${(photo.size / 1024 / 1024).toFixed(2)} MB`;
    
    info.appendChild(fileSize);
    card.appendChild(img);
    card.appendChild(info);
    
    card.addEventListener('click', () => openModal(photo));
    gallery.appendChild(card);
}

function editTitle(input, filename) {
    input.readOnly = false;
    input.focus();
    input.select();
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✓';
    saveBtn.className = 'save-title';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✗';
    cancelBtn.className = 'cancel-title';
    
    const originalValue = input.value;
    
    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await saveTitle(filename, input.value);
        cleanup();
    });
    
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = originalValue;
        cleanup();
    });
    
    function cleanup() {
        input.readOnly = true;
        if (saveBtn.parentNode) saveBtn.remove();
        if (cancelBtn.parentNode) cancelBtn.remove();
    }
    
    input.parentNode.appendChild(saveBtn);
    input.parentNode.appendChild(cancelBtn);
}

async function saveTitle(filename, newTitle) {
    try {
        const response = await fetch('/api/update-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, newTitle })
        });
        
        if (response.ok) {
            photoTitles[filename] = newTitle;
        }
    } catch (error) {
        console.error('Error saving title:', error);
    }
}

// Modal functions
function openModal(photo) {
    currentPhoto = photo;
    modalImg.src = photo.path;
    modal.style.display = 'block';
    
    EXIF.getData(modalImg, function() {
        displayExifData(this);
    });
}

function displayExifData(img) {
    const exifData = EXIF.getAllTags(img);
    const photoForThisModal = currentPhoto; // Capture current photo reference
    
    exifInfo.innerHTML = '';
    
    const title = photoTitles[photoForThisModal.filename] || photoForThisModal.name;
    
    const fields = {
        'Title': title,
        'Camera': exifData.Make && exifData.Model ? `${exifData.Make} ${exifData.Model}` : 'Unknown',
        'Aperture': exifData.FNumber ? `f/${exifData.FNumber}` : 'N/A',
        'ISO': exifData.ISOSpeedRatings || 'N/A',
        'Shutter Speed': exifData.ExposureTime ? `1/${Math.round(1/exifData.ExposureTime)}s` : 'N/A',
        'Focal Length': exifData.FocalLength ? `${exifData.FocalLength}mm` : 'N/A',
        'Date Taken': exifData.DateTime || new Date(photoForThisModal.lastModified).toLocaleString(),
        'Image Width': exifData.PixelXDimension || 'N/A',
        'Image Height': exifData.PixelYDimension || 'N/A',
        'File Size': `${(photoForThisModal.size / 1024 / 1024).toFixed(2)} MB`
    };
    
    Object.entries(fields).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'exif-item';
        item.innerHTML = `<strong>${key}:</strong> ${value}`;
        exifInfo.appendChild(item);
    });
}

// Modal controls
downloadBtn.addEventListener('click', function() {
    if (currentPhoto) {
        const link = document.createElement('a');
        link.href = currentPhoto.path;
        link.download = currentPhoto.name;
        link.click();
    }
});

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modal.style.display === 'block') {
            modal.style.display = 'none';
        }
        if (adminPanel.style.display === 'block') {
            closeAdminPanel();
        }
    }
});