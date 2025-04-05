document.addEventListener('DOMContentLoaded', function() {
  // Theme toggling functionality
  function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const themeText = document.getElementById('themeText');
    const appContainer = document.querySelector('.app-container');
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('babyTrackerTheme');
    if (savedTheme === 'blue') {
      appContainer.classList.add('blue-theme');
      themeText.textContent = 'Pink';
    } else {
      themeText.textContent = 'Blue';
    }
    
    // Toggle theme on click
    themeToggle.addEventListener('click', function() {
      if (appContainer.classList.contains('blue-theme')) {
        appContainer.classList.remove('blue-theme');
        localStorage.setItem('babyTrackerTheme', 'pink');
        themeText.textContent = 'Blue';
      } else {
        appContainer.classList.add('blue-theme');
        localStorage.setItem('babyTrackerTheme', 'blue');
        themeText.textContent = 'Pink';
      }
    });
  }

  // Call theme setup
  setupThemeToggle();

  // Pre-initialize date-time inputs
  window.addEventListener('load', function() {
    function initDateTimeInput(id) {
      const input = document.getElementById(id);
      if (input) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        input.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
    }
    
    initDateTimeInput('milkCustomDateTime');
    initDateTimeInput('solidCustomDateTime');
    initDateTimeInput('diaperCustomDateTime');
    initDateTimeInput('editMilkDateTime');
    initDateTimeInput('editSolidDateTime');
    initDateTimeInput('editDiaperDateTime');
  });
  
  // Data storage
  const babyTrackerApp = {
    currentBaby: null,
    currentUser: null,
    isMainCaregiver: false,
    
    // Initialize the app
    init: function() {
      this.loadFromStorage();
      this.setupEventListeners();
      this.checkLoginStatus();
    },
    
    // Setup all event listeners
    setupEventListeners: function() {
      // Register button
      document.getElementById('registerButton').addEventListener('click', () => {
        const babyName = document.getElementById('babyName').value.trim();
        const babyBirthday = document.getElementById('babyBirthday').value;
        const parentName = document.getElementById('parentName').value.trim();
        let relationship = document.getElementById('relationship').value;
        
        if (relationship === 'Other') {
          const otherRelationship = document.getElementById('otherRelationship').value.trim();
          if (otherRelationship) {
            relationship = otherRelationship;
          } else {
            alert('Please specify your relationship to the baby');
            return;
          }
        }
        
        if (babyName && parentName && babyBirthday) {
          this.registerBaby(babyName, parentName, relationship, babyBirthday);
        } else {
          alert('Please fill in all required fields (baby name, birthday, and your name)');
        }
      });
      
      // Relationship dropdown change
      document.getElementById('relationship').addEventListener('change', function() {
        const otherGroup = document.getElementById('otherRelationshipGroup');
        if (this.value === 'Other') {
          otherGroup.classList.remove('hidden');
        } else {
          otherGroup.classList.add('hidden');
        }
      });
      
      // New caregiver relationship dropdown change
      document.getElementById('newCaregiverRelationship').addEventListener('change', function() {
        const otherGroup = document.getElementById('newCaregiverOtherRelationshipGroup');
        if (this.value === 'Other') {
          otherGroup.classList.remove('hidden');
        } else {
          otherGroup.classList.add('hidden');
        }
      });
      
      // Login/Register toggle
      document.getElementById('showLoginLink').addEventListener('click', () => {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginCard').classList.remove('hidden');
      });
      
      document.getElementById('backToRegister').addEventListener('click', () => {
        document.getElementById('registerForm').classList.remove('hidden');
        document.getElementById('loginCard').classList.add('hidden');
      });
      
      // Login button
      document.getElementById('loginButton').addEventListener('click', () => {
        const accessCode = document.getElementById('accessCode').value.trim();
        if (accessCode) {
          this.loginWithAccessCode(accessCode);
        } else {
          alert('Please enter an access code');
        }
      });
      
      // Nav tabs
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', event => {
          const target = event.currentTarget.dataset.target;
          
          // Update nav item active state
          document.querySelectorAll('.nav-item').forEach(navItem => {
            navItem.classList.remove('active');
          });
          event.currentTarget.classList.add('active');
          
          // Update content area visibility
          document.querySelectorAll('.content-area').forEach(content => {
            content.classList.remove('active');
          });
          document.getElementById(target).classList.add('active');
        });
      });
      
      // Quick action buttons
      document.getElementById('newMilkButton').addEventListener('click', () => {
        this.showScreen('milkFeedingScreen');
      });
      
      document.getElementById('newSolidButton').addEventListener('click', () => {
        this.showScreen('solidFoodScreen');
      });
      
      document.getElementById('newDiaperButton').addEventListener('click', () => {
        this.showScreen('diaperChangeScreen');
      });
      
      document.getElementById('newPhotoButton').addEventListener('click', () => {
        this.showScreen('photoScreen');
      });
      
      // Gallery add photo button
      document.getElementById('galleryAddPhotoButton').addEventListener('click', () => {
        this.showScreen('photoScreen');
      });
      
      // Close buttons
      document.querySelectorAll('.close-button, .close-modal').forEach(button => {
        button.addEventListener('click', event => {
          this.hideScreen(event.currentTarget.dataset.target);
        });
      });
      
      // Time toggle switches
      this.setupTimeToggle('milk');
      this.setupTimeToggle('solid');
      this.setupTimeToggle('diaper');
      
      // Photo date toggle
      document.getElementById('photoCurrentDate').addEventListener('change', function() {
        const customDateGroup = document.getElementById('photoCustomDateGroup');
        if (this.checked) {
          customDateGroup.classList.add('hidden');
        } else {
          customDateGroup.classList.remove('hidden');
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          
          document.getElementById('photoCustomDate').value = `${year}-${month}-${day}`;
        }
      });
      
      // Save buttons
      document.getElementById('saveMilkButton').addEventListener('click', () => {
        this.saveMilkFeeding();
      });
      
      document.getElementById('saveSolidButton').addEventListener('click', () => {
        this.saveSolidFeeding();
      });
      
      document.getElementById('saveDiaperButton').addEventListener('click', () => {
        this.saveDiaperChange();
      });
      
      document.getElementById('savePhotoButton').addEventListener('click', () => {
        this.savePhoto();
      });
      
      // Edit buttons
      document.getElementById('updateMilkButton').addEventListener('click', () => {
        this.updateMilkFeeding();
      });
      
      document.getElementById('updateSolidButton').addEventListener('click', () => {
        this.updateSolidFood();
      });
      
      document.getElementById('updateDiaperButton').addEventListener('click', () => {
        this.updateDiaperChange();
      });
      
      // Add caregiver
      document.getElementById('addCaregiverButton').addEventListener('click', () => {
        const caregiverName = document.getElementById('newCaregiverName').value.trim();
        let relationship = document.getElementById('newCaregiverRelationship').value;
        
        if (relationship === 'Other') {
          const otherRelationship = document.getElementById('newCaregiverOtherRelationship').value.trim();
          if (otherRelationship) {
            relationship = otherRelationship;
          } else {
            alert('Please specify the relationship to the baby');
            return;
          }
        }
        
        if (caregiverName) {
          this.addCaregiver(caregiverName, relationship);
        } else {
          alert('Please enter caregiver name');
        }
      });
      
      // Filter history
      document.getElementById('filterType').addEventListener('change', () => {
        this.renderHistory();
      });
      
      document.getElementById('filterCaregiver').addEventListener('change', () => {
        this.renderHistory();
      });
      
      document.getElementById('filterDate').addEventListener('change', () => {
        this.renderHistory();
      });
      
      // Filter gallery
      document.getElementById('galleryMonthFilter').addEventListener('change', () => {
        this.renderGallery();
      });
    },
    
    // Setup time toggle for forms
    setupTimeToggle: function(prefix) {
      const toggle = document.getElementById(`${prefix}CurrentTime`);
      const customTimeGroup = document.getElementById(`${prefix}CustomTimeGroup`);
      const dateTimeInput = document.getElementById(`${prefix}CustomDateTime`);
      
      // Set initial default value
      const setDefaultDateTime = function() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        dateTimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      
      // Set default value initially
      setDefaultDateTime();
      
      toggle.addEventListener('change', function() {
        if (this.checked) {
          customTimeGroup.classList.add('hidden');
        } else {
          customTimeGroup.classList.remove('hidden');
          setDefaultDateTime(); // Update to current time when revealed
        }
      });
    },
    
    // Check if user is already logged in
    checkLoginStatus: function() {
      if (this.currentBaby && this.currentUser) {
        this.showMainScreen();
        this.renderAllData();
        this.updateAgeDisplay();
        
        // Update header info
        document.getElementById('babyNameDisplay').textContent = this.currentBaby.name;
        document.getElementById('currentUserName').textContent = this.currentUser.name;
        document.getElementById('currentUserRelationship').textContent = this.currentUser.relationship || 'Caregiver';
      }
    },
    
    // Update baby's age display
    updateAgeDisplay: function() {
      if (!this.currentBaby || !this.currentBaby.birthday) return;
      
      const birthDate = new Date(this.currentBaby.birthday);
      const today = new Date();
      
      // Calculate age
      let months = (today.getFullYear() - birthDate.getFullYear()) * 12;
      months -= birthDate.getMonth();
      months += today.getMonth();
      
      // Adjust for same month but earlier day
      if (today.getDate() < birthDate.getDate()) {
        months--;
      }
      
      // Calculate days for more precise age
      const monthDiff = new Date(today.getFullYear(), today.getMonth(), today.getDate()) - 
                        new Date(today.getFullYear(), today.getMonth(), birthDate.getDate());
      const days = Math.ceil(monthDiff / (1000 * 60 * 60 * 24));
      
      let ageDisplay = '';
      if (months === 0) {
        // Less than a month old
        const daysSinceBirth = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24));
        ageDisplay = `${daysSinceBirth} day${daysSinceBirth !== 1 ? 's' : ''} old`;
      } else if (months < 24) {
        // Less than 2 years, show months
        ageDisplay = `${months} month${months !== 1 ? 's' : ''} old`;
      } else {
        // 2+ years, show years and months
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        ageDisplay = `${years} year${years !== 1 ? 's' : ''}`;
        if (remainingMonths > 0) {
          ageDisplay += ` ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
        }
        ageDisplay += ' old';
      }
      
      document.getElementById('babyAgeDisplay').textContent = ageDisplay;
    },
    
    // Calculate age at a specific date
    calculateAgeAtDate: function(date) {
      if (!this.currentBaby || !this.currentBaby.birthday) return '';
      
      const birthDate = new Date(this.currentBaby.birthday);
      const targetDate = new Date(date);
      
      // Calculate age
      let months = (targetDate.getFullYear() - birthDate.getFullYear()) * 12;
      months -= birthDate.getMonth();
      months += targetDate.getMonth();
      
      // Adjust for same month but earlier day
      if (targetDate.getDate() < birthDate.getDate()) {
        months--;
      }
      
      let ageDisplay = '';
      if (months === 0) {
        // Less than a month old
        const daysSinceBirth = Math.floor((targetDate - birthDate) / (1000 * 60 * 60 * 24));
        ageDisplay = `${daysSinceBirth} day${daysSinceBirth !== 1 ? 's' : ''} old`;
      } else if (months < 24) {
        // Less than 2 years, show months
        ageDisplay = `${months} month${months !== 1 ? 's' : ''} old`;
      } else {
        // 2+ years, show years and months
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        ageDisplay = `${years} year${years !== 1 ? 's' : ''}`;
        if (remainingMonths > 0) {
          ageDisplay += ` ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
        }
        ageDisplay += ' old';
      }
      
      return ageDisplay;
    },
    
    // Register a new baby
    registerBaby: function(babyName, parentName, relationship, birthday) {
      const babyId = 'baby_' + Date.now();
      const caregiverId = 'cg_' + Date.now();
      
      // Create baby object
      const babyData = {
        id: babyId,
        name: babyName,
        birthday: birthday,
        mainCaregiverId: caregiverId,
        caregivers: [{
          id: caregiverId,
          name: parentName,
          relationship: relationship,
          accessCode: this.generateAccessCode()
        }],
        activities: [],
        photos: []
      };
      
      // Save to localStorage
      localStorage.setItem(babyId, JSON.stringify(babyData));
      
      // Set current session
      this.currentBaby = babyData;
      this.currentUser = {
        id: caregiverId,
        name: parentName,
        relationship: relationship
      };
      this.isMainCaregiver = true;
      
      // Save session info
      this.saveSession();
      
      // Update header info
      document.getElementById('babyNameDisplay').textContent = babyName;
      document.getElementById('currentUserName').textContent = parentName;
      document.getElementById('currentUserRelationship').textContent = relationship;
      this.updateAgeDisplay();
      
      // Show main screen
      this.showMainScreen();
    },
    
    // Login with access code
    loginWithAccessCode: function(accessCode) {
      // Check all babies in localStorage
      let found = false;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('baby_')) {
          const babyData = JSON.parse(localStorage.getItem(key));
          
          // Find caregiver with matching access code
          const caregiver = babyData.caregivers.find(cg => cg.accessCode === accessCode);
          if (caregiver) {
            this.currentBaby = babyData;
            this.currentUser = {
              id: caregiver.id,
              name: caregiver.name,
              relationship: caregiver.relationship
            };
            this.isMainCaregiver = (caregiver.id === babyData.mainCaregiverId);
            this.saveSession();
            
            // Update header info
            document.getElementById('babyNameDisplay').textContent = babyData.name;
            document.getElementById('currentUserName').textContent = caregiver.name;
            document.getElementById('currentUserRelationship').textContent = caregiver.relationship || 'Caregiver';
            this.updateAgeDisplay();
            
            this.showMainScreen();
            this.renderAllData();
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        alert('Invalid access code. Please try again.');
      }
    },
    
    // Add a new caregiver
    addCaregiver: function(name, relationship) {
      if (!this.isMainCaregiver) {
        alert('Only the main caregiver can add additional caregivers');
        return;
      }
      
      const caregiverId = 'cg_' + Date.now();
      const accessCode = this.generateAccessCode();
      
      const newCaregiver = {
        id: caregiverId,
        name: name,
        relationship: relationship,
        accessCode: accessCode
      };
      
      this.currentBaby.caregivers.push(newCaregiver);
      this.saveCurrentBaby();
      
      // Show access code
      document.getElementById('generatedAccessCode').textContent = accessCode;
      this.showScreen('accessCodeScreen');
      
      // Clear input
      document.getElementById('newCaregiverName').value = '';
      document.getElementById('newCaregiverRelationship').value = 'Mom';
      document.getElementById('newCaregiverOtherRelationshipGroup').classList.add('hidden');
      document.getElementById('newCaregiverOtherRelationship').value = '';
      
      // Refresh caregivers list
      this.renderCaregivers();
      
      // Update the caregiver filter dropdown
      this.updateCaregiverFilter();
    },
    
    // Remove a caregiver
    removeCaregiver: function(caregiverId) {
      if (!this.isMainCaregiver) {
        alert('Only the main caregiver can remove caregivers');
        return;
      }
      
      if (caregiverId === this.currentBaby.mainCaregiverId) {
        alert('You cannot remove the main caregiver');
        return;
      }
      
      const index = this.currentBaby.caregivers.findIndex(cg => cg.id === caregiverId);
      if (index !== -1) {
        this.currentBaby.caregivers.splice(index, 1);
        this.saveCurrentBaby();
        this.renderCaregivers();
        this.updateCaregiverFilter();
      }
    },
    
    // Update the caregiver filter dropdown
    updateCaregiverFilter: function() {
      const select = document.getElementById('filterCaregiver');
      
      // Clear current options except "All Caregivers"
      while (select.options.length > 1) {
        select.remove(1);
      }
      
      // Add all caregivers to the filter
      this.currentBaby.caregivers.forEach(caregiver => {
        const option = document.createElement('option');
        option.value = caregiver.id;
        option.textContent = caregiver.name + (caregiver.relationship ? ` (${caregiver.relationship})` : '');
        select.appendChild(option);
      });
    },
    
    // Update gallery month filter
    updateGalleryMonthFilter: function() {
      const select = document.getElementById('galleryMonthFilter');
      
      // Clear current options except "All Photos"
      while (select.options.length > 1) {
        select.remove(1);
      }
      
      if (!this.currentBaby || !this.currentBaby.photos || this.currentBaby.photos.length === 0) {
        return;
      }
      
      // Get unique months from photos
      const months = {};
      this.currentBaby.photos.forEach(photo => {
        const date = new Date(photo.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()+1}`;
        const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        months[monthKey] = monthName;
      });
      
      // Add month options to filter
      Object.keys(months).sort().reverse().forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = months[key];
        select.appendChild(option);
      });
    },
    
    // Save milk feeding
    saveMilkFeeding: function() {
      const useCurrentTime = document.getElementById('milkCurrentTime').checked;
      let timestamp;
      
      if (useCurrentTime) {
        timestamp = new Date();
      } else {
        const customDateTime = document.getElementById('milkCustomDateTime').value;
        timestamp = new Date(customDateTime);
      }
      
      const milkType = document.getElementById('milkType').value;
      const amount = document.getElementById('milkAmount').value;
      const feedingOrder = document.getElementById('milkFeeding').value;
      const notes = document.getElementById('milkNotes').value;
      
      if (!amount) {
        alert('Please enter the amount');
        return;
      }
      
      const activity = {
        id: 'act_' + Date.now(),
        type: 'milk',
        timestamp: timestamp.toISOString(),
        data: {
          milkType: milkType,
          amount: amount,
          feedingOrder: feedingOrder,
          notes: notes
        },
        caregiver: {
          id: this.currentUser.id,
          name: this.currentUser.name,
          relationship: this.currentUser.relationship
        }
      };
      
      this.addActivity(activity);
      this.hideScreen('milkFeedingScreen');
      this.resetForm('milk');
    },
    
    // Save solid food feeding
    saveSolidFeeding: function() {
      const useCurrentTime = document.getElementById('solidCurrentTime').checked;
      let timestamp;
      
      if (useCurrentTime) {
        timestamp = new Date();
      } else {
        const customDateTime = document.getElementById('solidCustomDateTime').value;
        timestamp = new Date(customDateTime);
      }
      
      const description = document.getElementById('foodDescription').value;
      const amount = document.getElementById('foodAmount').value;
      const mealType = document.getElementById('solidFeeding').value;
      const notes = document.getElementById('foodNotes').value;
      
      if (!description) {
        alert('Please enter food description');
        return;
      }
      
      const activity = {
        id: 'act_' + Date.now(),
        type: 'solid',
        timestamp: timestamp.toISOString(),
        data: {
          description: description,
          amount: amount,
          mealType: mealType,
          notes: notes
        },
        caregiver: {
          id: this.currentUser.id,
          name: this.currentUser.name,
          relationship: this.currentUser.relationship
        }
      };
      
      this.addActivity(activity);
      this.hideScreen('solidFoodScreen');
      this.resetForm('solid');
    },
    
    // Save diaper change
    saveDiaperChange: function() {
      const useCurrentTime = document.getElementById('diaperCurrentTime').checked;
      let timestamp;
      
      if (useCurrentTime) {
        timestamp = new Date();
      } else {
        const customDateTime = document.getElementById('diaperCustomDateTime').value;
        timestamp = new Date(customDateTime);
      }
      
      const diaperType = document.getElementById('diaperType').value;
      const changeOrder = document.getElementById('diaperChange').value;
      const notes = document.getElementById('diaperNotes').value;
      
      const activity = {
        id: 'act_' + Date.now(),
        type: 'diaper',
        timestamp: timestamp.toISOString(),
        data: {
          diaperType: diaperType,
          changeOrder: changeOrder,
          notes: notes
        },
        caregiver: {
          id: this.currentUser.id,
          name: this.currentUser.name,
          relationship: this.currentUser.relationship
        }
      };
      
      this.addActivity(activity);
      this.hideScreen('diaperChangeScreen');
      this.resetForm('diaper');
    },
    
    // Save photo
    savePhoto: function() {
      const useCurrentDate = document.getElementById('photoCurrentDate').checked;
      let photoDate;
      
      if (useCurrentDate) {
        photoDate = new Date();
      } else {
        const customDate = document.getElementById('photoCustomDate').value;
        photoDate = new Date(customDate);
      }
      
      const title = document.getElementById('photoTitle').value;
      const photoUrl = document.getElementById('photoUrl').value;
      const notes = document.getElementById('photoNotes').value;
      
      if (!title) {
        alert('Please enter a title for the photo');
        return;
      }
      
      if (!photoUrl) {
        alert('Please enter a URL for the photo');
        return;
      }
      
      const photo = {
        id: 'photo_' + Date.now(),
        title: title,
        url: photoUrl,
        date: photoDate.toISOString(),
        notes: notes,
        caregiver: {
          id: this.currentUser.id,
          name: this.currentUser.name,
          relationship: this.currentUser.relationship
        }
      };
      
      // Initialize photos array if it doesn't exist
      if (!this.currentBaby.photos) {
        this.currentBaby.photos = [];
      }
      
      this.currentBaby.photos.push(photo);
      this.saveCurrentBaby();
      
      // Also add as an activity
      const activity = {
        id: 'act_' + Date.now(),
        type: 'photo',
        timestamp: photoDate.toISOString(),
        data: {
          photoId: photo.id,
          title: title,
          url: photoUrl,
          notes: notes
        },
        caregiver: {
          id: this.currentUser.id,
          name: this.currentUser.name,
          relationship: this.currentUser.relationship
        }
      };
      
      this.addActivity(activity);
      
      // Update gallery
      this.updateGalleryMonthFilter();
      this.renderGallery();
      
      this.hideScreen('photoScreen');
      this.resetForm('photo');
    },
    
    // View photo details
    viewPhoto: function(photoId) {
      const photo = this.currentBaby.photos.find(p => p.id === photoId);
      if (!photo) return;
      
      document.getElementById('photoViewTitle').textContent = photo.title;
      document.getElementById('photoViewImage').src = photo.url;
      document.getElementById('photoViewImage').alt = photo.title;
      
      const photoDate = new Date(photo.date);
      document.getElementById('photoViewDate').textContent = photoDate.toLocaleDateString();
      
      const ageAtPhoto = this.calculateAgeAtDate(photo.date);
      document.getElementById('photoViewAge').textContent = ageAtPhoto;
      
      document.getElementById('photoViewNotes').textContent = photo.notes || '';
      
      this.showScreen('photoViewScreen');
    },
    
    // Edit milk feeding
    editMilkFeeding: function(activityId) {
      const activity = this.currentBaby.activities.find(act => act.id === activityId);
      if (!activity) return;
      
      // Fill in the edit form
      document.getElementById('editMilkId').value = activity.id;
      
      const date = new Date(activity.timestamp);
      const formattedDate = date.toISOString().slice(0, 16); // Format for datetime-local input
      document.getElementById('editMilkDateTime').value = formattedDate;
      
      document.getElementById('editMilkType').value = activity.data.milkType;
      document.getElementById('editMilkAmount').value = activity.data.amount;
      document.getElementById('editMilkFeeding').value = activity.data.feedingOrder || '1';
      document.getElementById('editMilkNotes').value = activity.data.notes || '';
      
      this.showScreen('editMilkScreen');
    },

    // Update milk feeding
    updateMilkFeeding: function() {
      const activityId = document.getElementById('editMilkId').value;
      const activity = this.currentBaby.activities.find(act => act.id === activityId);
      if (!activity) return;
      
      const newDateTime = document.getElementById('editMilkDateTime').value;
      const newMilkType = document.getElementById('editMilkType').value;
      const newAmount = document.getElementById('editMilkAmount').value;
      const newFeedingOrder = document.getElementById('editMilkFeeding').value;
      const newNotes = document.getElementById('editMilkNotes').value;
      
      if (!newAmount) {
        alert('Please enter the amount');
        return;
      }
      
      // Update activity data
      activity.timestamp = new Date(newDateTime).toISOString();
      activity.data.milkType = newMilkType;
      activity.data.amount = newAmount;
      activity.data.feedingOrder = newFeedingOrder;
      activity.data.notes = newNotes;
      
      // Save changes
      this.saveCurrentBaby();
      this.renderRecentActivities();
      this.renderHistory();
      this.updateTodayStats();
      
      this.hideScreen('editMilkScreen');
    },
    // Edit solid food
    editSolidFood: function(activityId) {
      const activity = this.currentBaby.activities.find(act => act.id === activityId);
      if (!activity) return;
      
      // Fill in the edit form
      document.getElementById('editSolidId').value = activity.id;
      
      const date = new Date(activity.timestamp);
      const formattedDate = date.toISOString().slice(0, 16); // Format for datetime-local input
      document.getElementById('editSolidDateTime').value = formattedDate;
      
      document.getElementById('editFoodDescription').value = activity.data.description;
      document.getElementById('editFoodAmount').value = activity.data.amount || '';
      document.getElementById('editSolidFeeding').value = activity.data.mealType || 'breakfast';
      document.getElementById('editFoodNotes').value = activity.data.notes || '';
      
      this.showScreen('editSolidScreen');
    },

    // Update solid food
    updateSolidFood: function() {
      const activityId = document.getElementById('editSolidId').value;
      const activity = this.currentBaby.activities.find(act => act.id === activityId);
      if (!activity) return;
      
      const newDateTime = document.getElementById('editSolidDateTime').value;
      const newDescription = document.getElementById('editFoodDescription').value;
      const newAmount = document.getElementById('editFoodAmount').value;
      const newMealType = document.getElementById('editSolidFeeding').value;
      const newNotes = document.getElementById('editFoodNotes').value;
      
      if (!newDescription) {
        alert('Please enter food description');
        return;
      }
      
      // Update activity data
      activity.timestamp = new Date(newDateTime).toISOString();
      activity.data.description = newDescription;
      activity.data.amount = newAmount;
      activity.data.mealType = newMealType;
      activity.data.notes = newNotes;
      
      // Save changes
      this.saveCurrentBaby();
      this.renderRecentActivities();
      this.renderHistory();
      this.updateTodayStats();
      
      this.hideScreen('editSolidScreen');
    },

    // Edit diaper change
    editDiaperChange: function(activityId) {
      const activity = this.currentBaby.activities.find(act => act.id === activityId);
      if (!activity) return;
      
      // Fill in the edit form
      document.getElementById('editDiaperId').value = activity.id;
      
      const date = new Date(activity.timestamp);
      const formattedDate = date.toISOString().slice(0, 16); // Format for datetime-local input
      document.getElementById('editDiaperDateTime').value = formattedDate;
      
      document.getElementById('editDiaperType').value = activity.data.diaperType;
      document.getElementById('editDiaperChange').value = activity.data.changeOrder || '1';
      document.getElementById('editDiaperNotes').value = activity.data.notes || '';
      
      this.showScreen('editDiaperScreen');
    },

    // Update diaper change
    updateDiaperChange: function() {
      const activityId = document.getElementById('editDiaperId').value;
      const activity = this.currentBaby.activities.find(act => act.id === activityId);
      if (!activity) return;
      
      const newDateTime = document.getElementById('editDiaperDateTime').value;
      const newDiaperType = document.getElementById('editDiaperType').value;
      const newChangeOrder = document.getElementById('editDiaperChange').value;
      const newNotes = document.getElementById('editDiaperNotes').value;
      
      // Update activity data
      activity.timestamp = new Date(newDateTime).toISOString();
      activity.data.diaperType = newDiaperType;
      activity.data.changeOrder = newChangeOrder;
      activity.data.notes = newNotes;
      
      // Save changes
      this.saveCurrentBaby();
      this.renderRecentActivities();
      this.renderHistory();
      this.updateTodayStats();
      
      this.hideScreen('editDiaperScreen');
    },

    // Delete activity
    deleteActivity: function(activityId) {
      if (confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
        const index = this.currentBaby.activities.findIndex(act => act.id === activityId);
        if (index !== -1) {
          this.currentBaby.activities.splice(index, 1);
          this.saveCurrentBaby();
          this.renderRecentActivities();
          this.renderHistory();
          this.updateTodayStats();
        }
      }
    },
    
    // Add activity to baby's record
    addActivity: function(activity) {
      this.currentBaby.activities.push(activity);
      this.saveCurrentBaby();
      this.renderRecentActivities();
      this.renderHistory();
      this.updateTodayStats();
    },
    
    // Update today's stats
    updateTodayStats: function() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get today's activities
      const todayFeedings = this.currentBaby.activities.filter(function(activity) {
        const actDate = new Date(activity.timestamp);
        return actDate >= today && (activity.type === 'milk' || activity.type === 'solid');
      });
      
      const todayDiapers = this.currentBaby.activities.filter(function(activity) {
        const actDate = new Date(activity.timestamp);
        return actDate >= today && activity.type === 'diaper';
      });
      
      document.getElementById('todayFeedingsCount').textContent = todayFeedings.length;
      document.getElementById('todayDiapersCount').textContent = todayDiapers.length;
    },
    
    // Reset form fields
    resetForm: function(prefix) {
      switch(prefix) {
        case 'milk':
          document.getElementById('milkCurrentTime').checked = true;
          document.getElementById('milkCustomTimeGroup').classList.add('hidden');
          document.getElementById('milkType').value = 'formula';
          document.getElementById('milkAmount').value = '';
          document.getElementById('milkFeeding').value = '1';
          document.getElementById('milkNotes').value = '';
          break;
        case 'solid':
          document.getElementById('solidCurrentTime').checked = true;
          document.getElementById('solidCustomTimeGroup').classList.add('hidden');
          document.getElementById('foodDescription').value = '';
          document.getElementById('foodAmount').value = '';
          document.getElementById('solidFeeding').value = 'breakfast';
          document.getElementById('foodNotes').value = '';
          break;
        case 'diaper':
          document.getElementById('diaperCurrentTime').checked = true;
          document.getElementById('diaperCustomTimeGroup').classList.add('hidden');
          document.getElementById('diaperType').value = 'wet';
          document.getElementById('diaperChange').value = '1';
          document.getElementById('diaperNotes').value = '';
          break;
        case 'photo':
          document.getElementById('photoCurrentDate').checked = true;
          document.getElementById('photoCustomDateGroup').classList.add('hidden');
          document.getElementById('photoTitle').value = '';
          document.getElementById('photoUrl').value = '';
          document.getElementById('photoNotes').value = '';
          break;
      }
    },
    
    // Show a screen
    showScreen: function(screenId) {
      document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
      });
      
      document.getElementById(screenId).classList.add('active');
    },
    
    // Hide a screen
    hideScreen: function(screenId) {
      document.getElementById(screenId).classList.remove('active');
      
      // Show main screen
      document.getElementById('mainScreen').classList.add('active');
    },
    
    // Show main app screen
    showMainScreen: function() {
      this.showScreen('mainScreen');
    },
    
    // Render recent activities on dashboard
    renderRecentActivities: function() {
      const container = document.getElementById('todayActivities');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get today's activities
      const todayActivities = this.currentBaby.activities.filter(act => {
        const actDate = new Date(act.timestamp);
        return actDate >= today;
      });
      
      // Sort by most recent first
      todayActivities.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      
      if (todayActivities.length === 0) {
        container.innerHTML = '<p class="empty-state">No activities recorded today</p>';
        return;
      }
      
      // Render activities
      container.innerHTML = '';
      todayActivities.forEach(activity => {
        container.appendChild(this.createActivityElement(activity));
      });
    },
    
    // Render all history
    renderHistory: function() {
      const container = document.getElementById('historyList');
      const filterType = document.getElementById('filterType').value;
      const filterCaregiver = document.getElementById('filterCaregiver').value;
      const filterDate = document.getElementById('filterDate').value;
      
      let filteredActivities = [...this.currentBaby.activities];
      
      // Apply type filter
      if (filterType !== 'all') {
        filteredActivities = filteredActivities.filter(act => act.type === filterType);
      }
      
      // Apply caregiver filter
      if (filterCaregiver !== 'all') {
        filteredActivities = filteredActivities.filter(act => act.caregiver.id === filterCaregiver);
      }
      
      // Apply date filter
      if (filterDate) {
        const selectedDate = new Date(filterDate);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(selectedDate.getDate() + 1);
        
        filteredActivities = filteredActivities.filter(act => {
          const actDate = new Date(act.timestamp);
          return actDate >= selectedDate && actDate < nextDay;
        });
      }
      
      // Sort by most recent first
      filteredActivities.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      
      if (filteredActivities.length === 0) {
        container.innerHTML = '<p class="empty-state">No history to display</p>';
        return;
      }
      
      // Render activities
      container.innerHTML = '';
      filteredActivities.forEach(activity => {
        container.appendChild(this.createActivityElement(activity));
      });
    },
    
    // Render gallery
    renderGallery: function() {
      const container = document.getElementById('photoGallery');
      const filterMonth = document.getElementById('galleryMonthFilter').value;
      
      if (!this.currentBaby.photos || this.currentBaby.photos.length === 0) {
        container.innerHTML = '<p class="empty-state">No photos added yet</p>';
        return;
      }
      
      let filteredPhotos = [...this.currentBaby.photos];
      
      // Apply month filter
      if (filterMonth !== 'all') {
        filteredPhotos = filteredPhotos.filter(photo => {
          const photoDate = new Date(photo.date);
          const photoMonth = `${photoDate.getFullYear()}-${photoDate.getMonth()+1}`;
          return photoMonth === filterMonth;
        });
      }
      
      // Sort by most recent first
      filteredPhotos.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });
      
      if (filteredPhotos.length === 0) {
        container.innerHTML = '<p class="empty-state">No photos match the selected filter</p>';
        return;
      }
      
      // Render photos
      container.innerHTML = '';
      filteredPhotos.forEach(photo => {
        const photoEl = document.createElement('div');
        photoEl.className = 'photo-item';
        photoEl.addEventListener('click', () => {
          this.viewPhoto(photo.id);
        });
        
        const imgEl = document.createElement('img');
        imgEl.className = 'photo-thumbnail';
        imgEl.src = photo.url;
        imgEl.alt = photo.title;
        
        const infoEl = document.createElement('div');
        infoEl.className = 'photo-info';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'photo-title';
        titleEl.textContent = photo.title;
        
        const dateEl = document.createElement('div');
        dateEl.className = 'photo-date';
        dateEl.textContent = new Date(photo.date).toLocaleDateString();
        
        const ageEl = document.createElement('div');
        ageEl.className = 'photo-age';
        ageEl.textContent = this.calculateAgeAtDate(photo.date);
        
        infoEl.appendChild(titleEl);
        infoEl.appendChild(dateEl);
        infoEl.appendChild(ageEl);
        
        photoEl.appendChild(imgEl);
        photoEl.appendChild(infoEl);
        
        container.appendChild(photoEl);
      });
    },
    
    // Render caregivers list
    renderCaregivers: function() {
      const container = document.getElementById('caregiversList');
      
      const caregivers = this.currentBaby.caregivers.filter(cg => 
        cg.id !== this.currentBaby.mainCaregiverId
      );
      
      if (caregivers.length === 0) {
        container.innerHTML = '<p class="empty-state">No additional caregivers</p>';
        return;
      }
      
      container.innerHTML = '';
      caregivers.forEach(caregiver => {
        const caregiverEl = document.createElement('div');
        caregiverEl.className = 'caregiver-item';
        
        const infoEl = document.createElement('div');
        infoEl.className = 'caregiver-info';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'caregiver-name';
        nameEl.textContent = caregiver.name;
        
        const relationshipEl = document.createElement('div');
        relationshipEl.className = 'caregiver-relationship';
        relationshipEl.textContent = caregiver.relationship || 'Caregiver';
        
        infoEl.appendChild(nameEl);
        infoEl.appendChild(relationshipEl);
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-caregiver';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          this.removeCaregiver(caregiver.id);
        });
        
        caregiverEl.appendChild(infoEl);
        if (this.isMainCaregiver) {
          caregiverEl.appendChild(removeBtn);
        }
        
        container.appendChild(caregiverEl);
      });
    },
    
    // Create activity element
    createActivityElement: function(activity) {
      const activityEl = document.createElement('div');
      activityEl.className = 'activity-item';
      
      // Add action buttons (edit/delete)
      const actionsEl = document.createElement('div');
      actionsEl.className = 'activity-actions';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-button';
      editBtn.innerHTML = '✏️';
      editBtn.setAttribute('title', 'Edit');
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-button';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.setAttribute('title', 'Delete');
      
      // Add event listeners based on activity type
      switch(activity.type) {
        case 'milk':
          editBtn.addEventListener('click', () => this.editMilkFeeding(activity.id));
          break;
        case 'solid':
          editBtn.addEventListener('click', () => this.editSolidFood(activity.id));
          break;
        case 'diaper':
          editBtn.addEventListener('click', () => this.editDiaperChange(activity.id));
          break;
        case 'photo':
          // Photos have their own edit flow through the gallery
          editBtn.style.display = 'none';
          break;
      }
      
      deleteBtn.addEventListener('click', () => this.deleteActivity(activity.id));
      
      actionsEl.appendChild(editBtn);
      actionsEl.appendChild(deleteBtn);
      activityEl.appendChild(actionsEl);
      
      const timestamp = new Date(activity.timestamp);
      const timeStr = timestamp.toLocaleString();
      
      const timeEl = document.createElement('div');
      timeEl.className = 'activity-time';
      timeEl.textContent = timeStr;
      
      const titleEl = document.createElement('div');
      titleEl.className = 'activity-title';
      
      const detailsEl = document.createElement('div');
      detailsEl.className = 'activity-details';
      
      // Set content based on activity type
      switch(activity.type) {
        case 'milk':
          let feedingOrderText = '';
          if (activity.data.feedingOrder && activity.data.feedingOrder !== 'other') {
            feedingOrderText = ` (${activity.data.feedingOrder} feeding)`;
          }
          titleEl.textContent = `Milk Feeding${feedingOrderText}`;
          detailsEl.textContent = `${activity.data.milkType} - ${activity.data.amount} oz`;
          if (activity.data.notes) {
            detailsEl.textContent += ` - ${activity.data.notes}`;
          }
          break;
        case 'solid':
          let mealTypeText = '';
          if (activity.data.mealType && activity.data.mealType !== 'other') {
            mealTypeText = ` (${activity.data.mealType.replace('_', ' ')})`;
          }
          titleEl.textContent = `Solid Food${mealTypeText}`;
          detailsEl.textContent = activity.data.description;
          if (activity.data.amount) {
            detailsEl.textContent += ` - ${activity.data.amount}`;
          }
          if (activity.data.notes) {
            detailsEl.textContent += ` - ${activity.data.notes}`;
          }
          break;
        case 'diaper':
          let changeOrderText = '';
          if (activity.data.changeOrder && activity.data.changeOrder !== 'other') {
            changeOrderText = ` (${activity.data.changeOrder} change)`;
          }
          titleEl.textContent = `Diaper Change${changeOrderText}`;
          detailsEl.textContent = `Type: ${activity.data.diaperType}`;
          if (activity.data.notes) {
            detailsEl.textContent += ` - ${activity.data.notes}`;
          }
          break;
        case 'photo':
          titleEl.textContent = `Photo: ${activity.data.title}`;
          
          // Create thumbnail if photo exists
          if (activity.data.url) {
            const thumbContainer = document.createElement('div');
            thumbContainer.style.marginTop = '0.5rem';
            
            const thumbImg = document.createElement('img');
            thumbImg.src = activity.data.url;
            thumbImg.alt = activity.data.title;
            thumbImg.style.width = '100%';
            thumbImg.style.maxHeight = '100px';
            thumbImg.style.objectFit = 'cover';
            thumbImg.style.borderRadius = '8px';
            
            thumbContainer.appendChild(thumbImg);
            detailsEl.appendChild(thumbContainer);
          }
          
          if (activity.data.notes) {
            const notesEl = document.createElement('div');
            notesEl.textContent = activity.data.notes;
            notesEl.style.marginTop = '0.5rem';
            detailsEl.appendChild(notesEl);
          }
          break;
      }
      
      const caregiverEl = document.createElement('div');
      caregiverEl.className = 'activity-caregiver';
      
      const relationship = activity.caregiver.relationship 
        ? ` (${activity.caregiver.relationship})` 
        : '';
      
      caregiverEl.textContent = `Recorded by ${activity.caregiver.name}${relationship}`;
      
      activityEl.appendChild(timeEl);
      activityEl.appendChild(titleEl);
      
      // Only append details if it has content
      if (!(detailsEl instanceof HTMLDivElement) || detailsEl.textContent || detailsEl.childNodes.length > 0) {
        activityEl.appendChild(detailsEl);
      }
      
      activityEl.appendChild(caregiverEl);
      
      return activityEl;
    },
    
    // Render all data
    renderAllData: function() {
      this.renderRecentActivities();
      this.renderHistory();
      this.renderCaregivers();
      this.renderGallery();
      this.updateCaregiverFilter();
      this.updateGalleryMonthFilter();
      this.updateTodayStats();
    },
    
    // Generate random access code
    generateAccessCode: function() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    },
    
    // Save current baby data
    saveCurrentBaby: function() {
      localStorage.setItem(this.currentBaby.id, JSON.stringify(this.currentBaby));
    },
    
    // Save session info
    saveSession: function() {
      sessionStorage.setItem('currentBabyId', this.currentBaby.id);
      sessionStorage.setItem('currentUserId', this.currentUser.id);
    },
    
    // Load data from storage
    loadFromStorage: function() {
      const babyId = sessionStorage.getItem('currentBabyId');
      const userId = sessionStorage.getItem('currentUserId');
      
      if (babyId && userId) {
        const babyData = localStorage.getItem(babyId);
        if (babyData) {
          this.currentBaby = JSON.parse(babyData);
          const caregiver = this.currentBaby.caregivers.find(cg => cg.id === userId);
          if (caregiver) {
            this.currentUser = {
              id: caregiver.id,
              name: caregiver.name,
              relationship: caregiver.relationship
            };
            this.isMainCaregiver = (userId === this.currentBaby.mainCaregiverId);
          }
        }
      }
    }
  };
  
  // Initialize the app
  babyTrackerApp.init();
});