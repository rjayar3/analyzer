// Symptoms list
const symptoms = [
    "Distractible?",
    "Forgetful?",
    "Focused?",
    "Reading and retention?",
    "Follow-through (staying on track)?",
    "Better at estimating time, keeping track of time?",
    "Motivation?",
    "Moody?",
    "Irritable?",
    "Impatient?",
    "Impulsive?",
    "Restless? Fidgety?",
    "Anxiety?",
    "Worrying?",
    "Overwhelmed?",
    "Fogginess?",
    "Getting to sleep?",
    "Getting good sleep?",
    "Feeling rested after sleep?",
    "Feeling buzzy, \"over-amped,\" too chatty, over-stimulated?",
    "More anxious, maybe sweaty, or having hot \"flashes\"?",
    "Fuzzy vision, or hyper-sensitive to light?",
    "Feeling kind of weird, off-balance, more irritable?",
    "Muscle tension or cramping (jaw, neck, chest, shoulders, back, legs), or headaches?",
    "Jittery?",
    "Increased heart rate?",
    "Queasy stomach? (Nausea, appetite loss)",
    "Feeling frozen (\"zombie,\" \"robotic,\" \"flat,\" \"stiff,\" reaction times are off)?"
];

// Global state
let currentDose = null;
let currentTimeSlot = '1hour';
let doses = [];
let db = null;

// Initialize IndexedDB
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ADHDTracker', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('doses')) {
                db.createObjectStore('doses', { keyPath: 'id' });
            }
        };
    });
}

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initDB();
        await loadDosesFromDB();
    } catch (error) {
        console.log('IndexedDB failed, using localStorage fallback');
        doses = JSON.parse(localStorage.getItem('doses')) || [];
    }
    
    updateCurrentDate();
    loadTodaysDoses();
    setupEventListeners();
    loadActiveReminders();
    
    // Set current time as default
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    document.getElementById('timeTaken').value = timeString;
});

function updateCurrentDate() {
    const today = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    document.getElementById('currentDate').textContent = today.toLocaleDateString('en-US', options);
}

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });

    // New dose form
    document.getElementById('newDoseForm').addEventListener('submit', handleNewDose);

    // Time selector buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTimeSlot(btn.dataset.time);
        });
    });
    
    // Setup swipe gestures for dose cards
    setupSwipeGestures();
}

function setupSwipeGestures() {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let currentCard = null;

    document.addEventListener('touchstart', (e) => {
        const card = e.target.closest('.swipeable');
        if (card) {
            startX = e.touches[0].clientX;
            currentCard = card;
            isDragging = true;
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging || !currentCard) return;
        
        currentX = e.touches[0].clientX;
        const diffX = startX - currentX;
        
        if (diffX > 0) { // Swiping left
            currentCard.style.transform = `translateX(-${Math.min(diffX, 80)}px)`;
        }
    });

    document.addEventListener('touchend', (e) => {
        if (!isDragging || !currentCard) return;
        
        const diffX = startX - currentX;
        
        if (diffX > 40) { // Swipe threshold
            currentCard.classList.add('swiped');
            currentCard.style.transform = 'translateX(-80px)';
        } else {
            currentCard.style.transform = 'translateX(0)';
            currentCard.classList.remove('swiped');
        }
        
        isDragging = false;
        currentCard = null;
    });
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'doses') {
        loadTodaysDoses();
    } else if (tabName === 'history') {
        loadHistory();
    }
}

function handleNewDose(e) {
    e.preventDefault();
    
    const medName = document.getElementById('medName').value;
    const amount = document.getElementById('amount').value;
    const timeTaken = document.getElementById('timeTaken').value;
    const enableNotifications = document.getElementById('enableNotifications').checked;
    
    const dose = {
        id: Date.now(),
        medName,
        amount,
        timeTaken,
        date: new Date().toDateString(),
        ratings: {
            '1hour': {},
            '2hour': {},
            '3hour': {},
            'later': {}
        }
    };
    
    doses.push(dose);
    saveDoses();
    
    // Clear form
    document.getElementById('newDoseForm').reset();
    document.getElementById('medName').value = 'Ritalin'; // Keep default
    document.getElementById('enableNotifications').checked = true; // Keep default
    const now = new Date();
    document.getElementById('timeTaken').value = now.toTimeString().slice(0, 5);
    
    // Switch to doses tab and show tracking
    switchTab('doses');
    openTrackingSheet(dose);
    
    // Schedule notifications if enabled
    if (enableNotifications) {
        scheduleNotifications(dose);
    }
}

function loadTodaysDoses() {
    const today = new Date().toDateString();
    const todaysDoses = doses.filter(dose => dose.date === today);
    
    const dosesList = document.getElementById('dosesList');
    
    if (todaysDoses.length === 0) {
        dosesList.innerHTML = `
            <div class="empty-state">
                <p>No doses logged today</p>
                <button class="btn-primary" onclick="switchTab('new-dose')">Log First Dose</button>
            </div>
        `;
        return;
    }
    
    dosesList.innerHTML = todaysDoses.map(dose => createDoseCard(dose)).join('');
}

function createDoseCard(dose) {
    const timeSlots = ['1hour', '2hour', '3hour', 'later'];
    const timeLabels = ['1hr', '2hr', '3hr', 'Later'];
    const progressDots = timeSlots.map((slot, index) => {
        const hasRatings = Object.keys(dose.ratings[slot]).length > 0;
        const dotClass = hasRatings ? 'completed' : '';
        return `<div class="progress-dot ${dotClass}" onclick="event.stopPropagation(); openTrackingSheetById('${dose.id}', '${slot}')" title="${timeLabels[index]}"></div>`;
    }).join('');
    
    return `
        <div class="dose-card swipeable" data-dose-id="${dose.id}" onclick="openTrackingSheetById('${dose.id}')">
            <div class="dose-header">
                <div class="dose-info">
                    <h3>${dose.medName} - ${dose.amount}</h3>
                    <div class="dose-time">${dose.timeTaken}</div>
                </div>
            </div>
            <div class="progress-indicators">
                ${progressDots}
            </div>
            <div class="delete-action">
                <button class="delete-btn" onclick="event.stopPropagation(); deleteDose('${dose.id}')">Delete</button>
            </div>
        </div>
    `;
}

function openTrackingSheet(dose, timeSlot = '1hour') {
    currentDose = dose;
    currentTimeSlot = timeSlot;
    
    document.getElementById('modalTitle').textContent = `${dose.medName} ${dose.amount} - ${dose.timeTaken}`;
    
    // Update time selector
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.time === timeSlot) {
            btn.classList.add('active');
        }
    });
    
    renderSymptoms();
    document.getElementById('trackingModal').style.display = 'block';
}

function switchTimeSlot(timeSlot) {
    currentTimeSlot = timeSlot;
    
    // Update active button
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.time === timeSlot) {
            btn.classList.add('active');
        }
    });
    
    // Update time label
    const timeLabels = {
        '1hour': '1 Hour',
        '2hour': '2 Hours', 
        '3hour': '3 Hours',
        'later': 'Later (4+ Hours)'
    };
    document.getElementById('currentTimeLabel').textContent = timeLabels[timeSlot];
    
    renderSymptoms();
}

function renderSymptoms() {
    const container = document.getElementById('symptomsList');
    
    container.innerHTML = symptoms.map((symptom, index) => {
        const currentRating = currentDose.ratings[currentTimeSlot][index] || '';
        
        return `
            <div class="symptom-row">
                <div class="symptom-text">${symptom}</div>
                <div class="rating-buttons">
                    <button class="rating-btn worse ${currentRating === 'W' ? 'active' : ''}" 
                            onclick="setRating(${index}, 'W')">W</button>
                    <button class="rating-btn neutral ${currentRating === 'N' ? 'active' : ''}" 
                            onclick="setRating(${index}, 'N')">N</button>
                    <button class="rating-btn better ${currentRating === 'B' ? 'active' : ''}" 
                            onclick="setRating(${index}, 'B')">B</button>
                </div>
            </div>
        `;
    }).join('');
}

function setRating(symptomIndex, rating) {
    // Set rating for current time slot
    currentDose.ratings[currentTimeSlot][symptomIndex] = rating;
    
    // Smart defaults: if this is the first time slot being filled, copy to others
    const timeSlots = ['1hour', '2hour', '3hour', 'later'];
    const currentSlotIndex = timeSlots.indexOf(currentTimeSlot);
    
    // If this is the first rating for this symptom across all time slots, copy it forward
    const hasAnyRating = timeSlots.some(slot => 
        currentDose.ratings[slot][symptomIndex] !== undefined
    );
    
    if (!hasAnyRating || currentSlotIndex === 0) {
        // Copy this rating to future time slots that don't have ratings yet
        for (let i = currentSlotIndex + 1; i < timeSlots.length; i++) {
            if (!currentDose.ratings[timeSlots[i]][symptomIndex]) {
                currentDose.ratings[timeSlots[i]][symptomIndex] = rating;
            }
        }
    }
    
    // Update the dose in storage
    const doseIndex = doses.findIndex(d => d.id === currentDose.id);
    if (doseIndex !== -1) {
        doses[doseIndex] = currentDose;
        saveDoses();
    }
    
    // Re-render to show updated ratings
    renderSymptoms();
    
    // Show save confirmation
    showSaveStatus();
}

function showSaveStatus() {
    const status = document.getElementById('saveStatus');
    status.textContent = 'Saved ✓';
    status.style.color = '#28a745';
    
    setTimeout(() => {
        status.textContent = 'Auto-saving...';
        status.style.color = '#6c757d';
    }, 1000);
}

function closeModal() {
    document.getElementById('trackingModal').style.display = 'none';
    loadTodaysDoses(); // Refresh the doses list to show updated progress
}

async function loadDosesFromDB() {
    if (!db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['doses'], 'readonly');
        const store = transaction.objectStore('doses');
        const request = store.getAll();
        
        request.onsuccess = () => {
            doses = request.result || [];
            resolve(doses);
        };
        request.onerror = () => reject(request.error);
    });
}

async function saveDoses() {
    // Save to localStorage as backup
    localStorage.setItem('doses', JSON.stringify(doses));
    
    // Save to IndexedDB if available
    if (db) {
        try {
            const transaction = db.transaction(['doses'], 'readwrite');
            const store = transaction.objectStore('doses');
            
            // Clear existing data
            await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = () => reject(clearRequest.error);
            });
            
            // Add all doses
            for (const dose of doses) {
                await new Promise((resolve, reject) => {
                    const addRequest = store.add(dose);
                    addRequest.onsuccess = () => resolve();
                    addRequest.onerror = () => reject(addRequest.error);
                });
            }
        } catch (error) {
            console.log('IndexedDB save failed, using localStorage only');
        }
    }
}

function scheduleNotifications(dose) {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                const baseTime = new Date();
                const [hours, minutes] = dose.timeTaken.split(':');
                baseTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                
                // Schedule notifications for 1, 2, 3 hours and 4 hours (later)
                const intervals = [1, 2, 3, 4];
                const messages = [
                    '1 hour symptom check',
                    '2 hour symptom check', 
                    '3 hour symptom check',
                    'Final symptom check (4+ hours)'
                ];
                
                intervals.forEach((hour, index) => {
                    const notificationTime = new Date(baseTime.getTime() + (hour * 60 * 60 * 1000));
                    const now = new Date();
                    
                    if (notificationTime > now) {
                        const timeoutMs = notificationTime.getTime() - now.getTime();
                        const timeSlots = ['1hour', '2hour', '3hour', 'later'];
                        
                        setTimeout(() => {
                            new Notification(`📊 ${messages[index]}`, {
                                body: `Rate symptoms for ${dose.medName} ${dose.amount} taken at ${dose.timeTaken}`,
                                icon: '/icon-192.png',
                                tag: `dose-${dose.id}-${timeSlots[index]}`,
                                requireInteraction: true,
                                actions: [
                                    { action: 'rate', title: 'Rate Now' },
                                    { action: 'later', title: 'Remind Later' }
                                ]
                            });
                        }, timeoutMs);
                    }
                });
            }
        });
    }
}

function setDailyReminder(reminderNumber) {
    const timeInput = document.getElementById(`reminder${reminderNumber}`);
    const time = timeInput.value;
    
    if (!time) {
        alert('Please select a time first');
        return;
    }
    
    // Request notification permission
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                // Save reminder to localStorage
                const reminders = JSON.parse(localStorage.getItem('dailyReminders')) || {};
                reminders[reminderNumber] = time;
                localStorage.setItem('dailyReminders', JSON.stringify(reminders));
                
                // Schedule daily notification
                scheduleDailyReminder(reminderNumber, time);
                
                // Update UI
                loadActiveReminders();
                timeInput.value = '';
                
                alert(`Daily reminder set for ${time}`);
            } else {
                alert('Please enable notifications to set reminders');
            }
        });
    }
}

function scheduleDailyReminder(reminderNumber, time) {
    const [hours, minutes] = time.split(':');
    const now = new Date();
    const reminderTime = new Date();
    reminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // If time has passed today, schedule for tomorrow
    if (reminderTime <= now) {
        reminderTime.setDate(reminderTime.getDate() + 1);
    }
    
    const timeoutMs = reminderTime.getTime() - now.getTime();
    
    setTimeout(() => {
        new Notification(`💊 Time for medication`, {
            body: `Reminder ${reminderNumber}: Time to take your medication`,
            icon: '/icon-192.png',
            tag: `daily-reminder-${reminderNumber}`,
            requireInteraction: true,
            actions: [
                { action: 'taken', title: 'Mark as Taken' },
                { action: 'snooze', title: 'Snooze 15min' }
            ]
        });
        
        // Reschedule for next day
        setTimeout(() => {
            scheduleDailyReminder(reminderNumber, time);
        }, 24 * 60 * 60 * 1000); // 24 hours later
        
    }, timeoutMs);
}

function loadActiveReminders() {
    const reminders = JSON.parse(localStorage.getItem('dailyReminders')) || {};
    const container = document.getElementById('activeReminders');
    
    if (Object.keys(reminders).length === 0) {
        container.innerHTML = '<p class="help-text">No daily reminders set</p>';
        return;
    }
    
    container.innerHTML = '<h4>Active Reminders:</h4>' + 
        Object.entries(reminders).map(([number, time]) => `
            <div class="active-reminder">
                <span class="reminder-time">Reminder ${number}: ${time}</span>
                <button class="remove-reminder" onclick="removeDailyReminder(${number})">Remove</button>
            </div>
        `).join('');
}

function removeDailyReminder(reminderNumber) {
    const reminders = JSON.parse(localStorage.getItem('dailyReminders')) || {};
    delete reminders[reminderNumber];
    localStorage.setItem('dailyReminders', JSON.stringify(reminders));
    loadActiveReminders();
}

function setFoodReminder() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                // 30 minute reminder
                setTimeout(() => {
                    new Notification('🍽️ Food timing reminder', {
                        body: 'You can take your medication now (30 min before food)',
                        icon: '/icon-192.png',
                        tag: 'food-reminder'
                    });
                }, 30 * 60 * 1000); // 30 minutes
                
                alert('Food timer set! You\'ll get a reminder in 30 minutes when you can take medication before eating.');
            }
        });
    }
}

function setNextDoseReminder() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                // 4 hour reminder
                setTimeout(() => {
                    new Notification('💊 Next dose reminder', {
                        body: 'Time for your next dose (4 hours have passed)',
                        icon: '/icon-192.png',
                        tag: 'next-dose-reminder',
                        requireInteraction: true
                    });
                }, 4 * 60 * 60 * 1000); // 4 hours
                
                alert('Next dose reminder set! You\'ll get notified in 4 hours for your next dose.');
            }
        });
    }
}

function openTrackingSheetById(doseId, timeSlot = '1hour') {
    const dose = doses.find(d => d.id == doseId);
    if (dose) {
        openTrackingSheet(dose, timeSlot);
    }
}

function loadHistory() {
    const historyList = document.getElementById('historyList');
    
    if (doses.length === 0) {
        historyList.innerHTML = '<p>No history yet</p>';
        return;
    }
    
    // Group doses by date
    const dosesByDate = {};
    doses.forEach(dose => {
        if (!dosesByDate[dose.date]) {
            dosesByDate[dose.date] = [];
        }
        dosesByDate[dose.date].push(dose);
    });
    
    // Sort dates (newest first)
    const sortedDates = Object.keys(dosesByDate).sort((a, b) => new Date(b) - new Date(a));
    
    historyList.innerHTML = sortedDates.map(date => {
        const dayDoses = dosesByDate[date];
        const doseCards = dayDoses.map(dose => createDoseCard(dose)).join('');
        
        return `
            <div class="history-day">
                <h3 class="history-date">${new Date(date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                })}</h3>
                ${doseCards}
            </div>
        `;
    }).join('');
}

function deleteDose(doseId) {
    if (confirm('Are you sure you want to delete this dose?')) {
        doses = doses.filter(dose => dose.id != doseId);
        saveDoses();
        loadTodaysDoses();
        loadHistory();
    }
}

function exportData() {
    const dataToExport = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        doses: doses
    };
    
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `adhd-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    // Show confirmation
    alert('Backup exported! Save this file to restore your data later.');
}

function exportCSV() {
    if (doses.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Create CSV header
    let csvContent = 'Date,Medication,Amount,Time Taken,Symptom,1 Hour,2 Hours,3 Hours,Later\n';
    
    // Process each dose
    doses.forEach(dose => {
        const baseInfo = `${dose.date},${dose.medName},${dose.amount},${dose.timeTaken}`;
        
        // Add a row for each symptom
        symptoms.forEach((symptom, index) => {
            const ratings = {
                '1hour': dose.ratings['1hour'][index] || '',
                '2hour': dose.ratings['2hour'][index] || '',
                '3hour': dose.ratings['3hour'][index] || '',
                'later': dose.ratings['later'][index] || ''
            };
            
            // Escape commas and quotes in symptom text
            const escapedSymptom = `"${symptom.replace(/"/g, '""')}"`;
            
            csvContent += `${baseInfo},${escapedSymptom},${ratings['1hour']},${ratings['2hour']},${ratings['3hour']},${ratings['later']}\n`;
        });
    });
    
    // Create and download CSV file
    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(csvBlob);
    link.download = `adhd-tracker-data-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    alert('CSV exported! You can open this in Excel, Google Sheets, or any spreadsheet app.');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (importedData.doses && Array.isArray(importedData.doses)) {
                const confirmImport = confirm(
                    `Import ${importedData.doses.length} doses from ${importedData.exportDate ? new Date(importedData.exportDate).toLocaleDateString() : 'backup'}?\n\nThis will replace your current data.`
                );
                
                if (confirmImport) {
                    doses = importedData.doses;
                    saveDoses();
                    loadTodaysDoses();
                    loadHistory();
                    alert('Data imported successfully!');
                }
            } else {
                alert('Invalid backup file format.');
            }
        } catch (error) {
            alert('Error reading backup file. Please check the file format.');
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
}

// Make functions globally available
window.switchTab = switchTab;
window.openTrackingSheet = openTrackingSheet;
window.openTrackingSheetById = openTrackingSheetById;
window.setRating = setRating;
window.closeModal = closeModal;
window.deleteDose = deleteDose;
window.exportData = exportData;
window.exportCSV = exportCSV;
window.importData = importData;
window.setDailyReminder = setDailyReminder;
window.removeDailyReminder = removeDailyReminder;
window.setFoodReminder = setFoodReminder;
window.setNextDoseReminder = setNextDoseReminder;