import {
    collection, getDocs, addDoc, query, where, getDoc, doc,
    updateDoc, deleteDoc, onSnapshot, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let currentRestaurant = null;
let userLocation = null;
let restaurantsData = [];

// Add toast styles
function addToastStyles() {
    if (!document.querySelector('#toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 1rem 1.5rem;
                border-radius: 16px;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                animation: fadeSlideUp 0.3s ease-out;
                border: 1px solid;
                max-width: 400px;
                word-break: break-word;
            }
            
            .toast-success {
                background: var(--success-bg, rgba(212, 237, 218, 0.95));
                color: var(--success-color, #155724);
                border-color: var(--success-border, rgba(195, 230, 203, 0.5));
            }
            
            .toast-error {
                background: var(--error-bg, rgba(248, 215, 218, 0.95));
                color: var(--error-color, #721c24);
                border-color: var(--error-border, rgba(245, 198, 203, 0.5));
            }
            
            .toast-warning {
                background: var(--warning-bg, rgba(255, 243, 205, 0.95));
                color: var(--warning-color, #856404);
                border-color: var(--warning-border, rgba(255, 238, 186, 0.5));
            }
            
            .toast-info {
                background: var(--info-bg, rgba(209, 236, 241, 0.95));
                color: var(--info-color, #0c5460);
                border-color: var(--info-border, rgba(190, 229, 235, 0.5));
            }
            
            @keyframes fadeSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            
            /* Dark mode adjustments */
            @media (prefers-color-scheme: dark) {
                .toast-success {
                    background: rgba(212, 237, 218, 0.2);
                    color: #d4edda;
                }
                
                .toast-error {
                    background: rgba(248, 215, 218, 0.2);
                    color: #f8d7da;
                }
                
                .toast-warning {
                    background: rgba(255, 243, 205, 0.2);
                    color: #fff3cd;
                }
                
                .toast-info {
                    background: rgba(209, 236, 241, 0.2);
                    color: #d1ecf1;
                }
            }
            
            /* Confirmation modal styles */
            .confirmation-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10001;
                animation: fadeIn 0.3s ease-out;
            }
            
            .confirmation-content {
                background: var(--modal-bg, white);
                padding: 2rem;
                border-radius: 20px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: slideUp 0.3s ease-out;
            }
            
            .confirmation-header {
                display: flex;
                align-items: center;
                gap: 1rem;
                margin-bottom: 1.5rem;
            }
            
            .confirmation-icon {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
            }
            
            .confirmation-icon.warning {
                background: linear-gradient(135deg, #ffc107, #ff9800);
                color: #000;
            }
            
            .confirmation-icon.info {
                background: linear-gradient(135deg, #17a2b8, #138496);
                color: white;
            }
            
            .confirmation-title {
                font-size: 1.25rem;
                font-weight: 700;
                color: var(--text-primary, #2d3436);
                margin: 0;
            }
            
            .confirmation-message {
                color: var(--text-secondary, #636e72);
                margin-bottom: 2rem;
                line-height: 1.5;
            }
            
            .confirmation-buttons {
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
            }
            
            .confirmation-buttons button {
                padding: 0.75rem 1.5rem;
                border-radius: 12px;
                border: none;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .confirmation-cancel {
                background: var(--cancel-bg, #f5f5f5);
                color: var(--cancel-color, #666);
            }
            
            .confirmation-cancel:hover {
                background: var(--cancel-hover, #e0e0e0);
            }
            
            .confirmation-confirm {
                background: linear-gradient(135deg, var(--accent-color, #e17055), var(--accent-dark, #d63031));
                color: white;
            }
            
            .confirmation-confirm:hover {
                opacity: 0.9;
                transform: translateY(-2px);
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize toast styles
addToastStyles();

// Confirmation modal function
window.showConfirmation = function(options) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        
        modal.innerHTML = `
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <div class="confirmation-icon ${options.type || 'warning'}">
                        <i class="fas ${options.icon || 'fa-exclamation-triangle'}"></i>
                    </div>
                    <h3 class="confirmation-title">${options.title || 'Confirmation Required'}</h3>
                </div>
                <p class="confirmation-message">${options.message}</p>
                <div class="confirmation-buttons">
                    <button class="confirmation-cancel" onclick="handleConfirmation(false)">
                        ${options.cancelText || 'Cancel'}
                    </button>
                    <button class="confirmation-confirm" onclick="handleConfirmation(true)">
                        ${options.confirmText || 'Confirm'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Store resolve function globally
        window.handleConfirmation = function(result) {
            modal.remove();
            delete window.handleConfirmation;
            resolve(result);
        };
    });
};

// Toast notification function
window.showToast = function(message, type = "success", duration = 3000) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Map type to icon
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

// Check authentication
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            window.location.href = "index.html";
            return;
        }
        
        const userData = userDoc.data();
        if (userData.role !== "CLIENT") {
            window.location.href = "owner.html";
            return;
        }
        
        // Try to get user's location
        await getUserLocation();
        loadRestaurants();
    } catch (error) {
        console.error("Auth check failed:", error);
        showToast("Authentication error. Please login again.", "error");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 2000);
    }
});

// Get user's current location
async function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            showToast("Geolocation is not supported by your browser", "warning");
            resolve(null);
            return;
        }
        
        // Check if we have saved location
        const savedLocation = localStorage.getItem('userLocation');
        if (savedLocation) {
            try {
                userLocation = JSON.parse(savedLocation);
                console.log("Using saved location:", userLocation);
                resolve(userLocation);
                return;
            } catch (e) {
                console.warn("Failed to parse saved location:", e);
                localStorage.removeItem('userLocation');
            }
        }
        
        // Only show location request if we don't have a saved location
        const locationSection = document.createElement('div');
        locationSection.className = 'location-request';
        locationSection.innerHTML = `
            <div style="background: linear-gradient(135deg, #fff3cd, #ffeaa7); padding: 20px; border-radius: 16px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                    <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #ffc107, #ff9800); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-map-marker-alt" style="color: white; font-size: 24px;"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 5px 0; color: #856404; font-weight: 700;">Enable Location Services</h4>
                        <p style="margin: 0; color: #856404; font-size: 14px; opacity: 0.9;">
                            Allow location access to see restaurants near you and get distance information
                        </p>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="allowLocation()" class="allow-location-btn" style="flex: 1;">
                        <i class="fas fa-check"></i> Allow Location
                    </button>
                    <button onclick="skipLocation()" style="background: transparent; border: 2px solid #ddd; color: #666; padding: 10px 20px; border-radius: 10px; font-weight: 600;">
                        Skip for Now
                    </button>
                </div>
            </div>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            const nav = container.querySelector('nav');
            if (nav) {
                container.insertBefore(locationSection, nav.nextSibling);
            } else {
                container.insertBefore(locationSection, container.firstChild);
            }
        }
        
        // Store functions globally
        window.allowLocation = async function() {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    });
                });
                
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date().toISOString()
                };
                
                console.log("User location obtained:", userLocation);
                
                // Save location to localStorage for future use
                localStorage.setItem('userLocation', JSON.stringify(userLocation));
                
                // Update UI
                locationSection.innerHTML = `
                    <div style="background: linear-gradient(135deg, #d4edda, #c3e6cb); padding: 20px; border-radius: 16px; margin-bottom: 20px; border-left: 4px solid #28a745;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #28a745, #20c997); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-map-marker-alt" style="color: white; font-size: 24px;"></i>
                            </div>
                            <div>
                                <h4 style="margin: 0 0 5px 0; color: #155724; font-weight: 700;">Location Enabled</h4>
                                <p style="margin: 0; color: #155724; font-size: 14px; opacity: 0.9;">
                                    Showing restaurants near your location
                                </p>
                            </div>
                        </div>
                    </div>
                `;
                
                // Show success toast
                showToast("Location enabled! Showing restaurants near you", "success");
                
                // Reload restaurants with location
                if (restaurantsData.length > 0) {
                    filterRestaurantsByLocation();
                }
                
                resolve(userLocation);
            } catch (error) {
                console.warn("Location access denied or failed:", error);
                locationSection.innerHTML = `
                    <div style="background: linear-gradient(135deg, #f8d7da, #f5c6cb); padding: 20px; border-radius: 16px; margin-bottom: 20px; border-left: 4px solid #dc3545;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #dc3545, #c82333); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-exclamation-circle" style="color: white; font-size: 24px;"></i>
                            </div>
                            <div>
                                <h4 style="margin: 0 0 5px 0; color: #721c24; font-weight: 700;">Location Access Denied</h4>
                                <p style="margin: 0; color: #721c24; font-size: 14px; opacity: 0.9;">
                                    Showing all restaurants instead
                                </p>
                            </div>
                        </div>
                    </div>
                `;
                
                showToast("Location access denied. Showing all restaurants.", "warning");
                resolve(null);
            }
        };
        
        window.skipLocation = function() {
            locationSection.style.opacity = '0';
            locationSection.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                locationSection.remove();
                showToast("You can enable location later from the filter section", "info");
            }, 300);
            resolve(null);
        };
    });
}

async function loadRestaurants() {
    try {
        console.log("Loading restaurants...");
        const loadingElement = document.getElementById("loading");
        const container = document.getElementById("restaurants-container");
        
        // Show loading
        if (loadingElement) {
            loadingElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading restaurants...';
            loadingElement.style.display = "block";
        }
        
        // Get all restaurants
        const querySnapshot = await getDocs(collection(db, "restaurants"));
        console.log("Restaurants found:", querySnapshot.size);
        
        // Hide loading
        if (loadingElement) {
            loadingElement.style.display = "none";
        }
        
        restaurantsData = [];
        container.innerHTML = "";
        
        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #f5f7fa, #c3cfe2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                        <i class="fas fa-utensils" style="font-size: 36px; color: #6c757d;"></i>
                    </div>
                    <h3 style="color: #495057; margin-bottom: 10px;">No Restaurants Available</h3>
                    <p style="color: #6c757d; max-width: 400px; margin: 0 auto 25px;">
                        No restaurants have been registered yet. Check back later or ask restaurant owners to add their listings.
                    </p>
                </div>
            `;
            return;
        }
        
        // Process restaurants
        querySnapshot.forEach((doc) => {
            const restaurant = {
                id: doc.id,
                ...doc.data()
            };
            restaurantsData.push(restaurant);
        });
        
        // Add distance calculation if we have user location
        if (userLocation) {
            restaurantsData.forEach(restaurant => {
                if (restaurant.latitude && restaurant.longitude) {
                    restaurant.distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        restaurant.latitude,
                        restaurant.longitude
                    );
                }
            });
        }
        
        // Sort restaurants
        if (userLocation) {
            // Sort by distance if we have location
            restaurantsData.sort((a, b) => {
                const distA = a.distance || Infinity;
                const distB = b.distance || Infinity;
                return distA - distB;
            });
        } else {
            // Sort by name if no location
            restaurantsData.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        displayRestaurants(restaurantsData);
        
    } catch (error) {
        console.error("Error loading restaurants:", error);
        
        const container = document.getElementById("restaurants-container");
        const loadingElement = document.getElementById("loading");
        
        if (loadingElement) {
            loadingElement.style.display = "none";
        }
        
        container.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 40px 20px;">
                <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #f8d7da, #f5c6cb); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <i class="fas fa-exclamation-circle" style="color: #721c24; font-size: 24px;"></i>
                </div>
                <h3 style="color: #721c24; margin-bottom: 10px;">Failed to Load Restaurants</h3>
                <p style="color: #856404; margin-bottom: 20px;">${error.message}</p>
                <button onclick="location.reload()" style="background: linear-gradient(135deg, #e17055, #d63031); color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-redo"></i> Retry Loading
                </button>
            </div>
        `;
        
        showToast("Failed to load restaurants. Please try again.", "error");
    }
}

function displayRestaurants(restaurants) {
    const container = document.getElementById("restaurants-container");
    container.innerHTML = "";
    
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-section';
    filterSection.innerHTML = `
        <div style="margin-bottom: 25px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;">
                <div>
                    <h2 style="margin: 0; color: var(--text-primary, #2d3436);">Restaurants</h2>
                    <p style="margin: 5px 0 0 0; color: var(--text-secondary, #636e72); font-size: 14px;">
                        ${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''} found
                    </p>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="sortByDistance()" class="filter-btn" style="background: linear-gradient(135deg, #e17055, #d63031);">
                        <i class="fas fa-map-marker-alt"></i> Sort by Distance
                    </button>
                    <button onclick="sortByName()" class="filter-btn" style="background: linear-gradient(135deg, #6c5ce7, #a29bfe);">
                        <i class="fas fa-sort-alpha-down"></i> Sort by Name
                    </button>
                    <button onclick="filterByCuisine()" class="filter-btn" style="background: linear-gradient(135deg, #00b894, #00cec9);">
                        <i class="fas fa-filter"></i> Filter by Cuisine
                    </button>
                </div>
            </div>
            
            ${userLocation ? `
                <div style="background: rgba(225, 112, 85, 0.1); padding: 12px 16px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-map-marker-alt" style="color: #e17055;"></i>
                        <span style="color: #636e72; font-size: 14px;">
                            ${restaurants.some(r => r.distance) ? 
                                'Showing restaurants near your location' : 
                                'No restaurants with location data found'}
                        </span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <span id="current-location" style="cursor: pointer; color: #e17055; font-weight: 600; font-size: 14px;" 
                              onclick="updateLocation()">
                            <i class="fas fa-sync-alt"></i> Update Location
                        </span>
                        <span onclick="clearLocation()" style="cursor: pointer; color: #636e72; font-size: 14px;">
                            <i class="fas fa-times"></i> Clear
                        </span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    container.appendChild(filterSection);
    
    if (restaurants.length === 0) {
        container.innerHTML += `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #f5f7fa, #c3cfe2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <i class="fas fa-search" style="font-size: 36px; color: #6c757d;"></i>
                </div>
                <h3 style="color: #495057; margin-bottom: 10px;">No Restaurants Match Your Filters</h3>
                <p style="color: #6c757d; max-width: 400px; margin: 0 auto 25px;">
                    Try changing your filters or clear them to see all available restaurants.
                </p>
                <button onclick="clearFilters()" style="background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-times"></i> Clear Filters
                </button>
            </div>
        `;
        return;
    }
    
    restaurants.forEach(restaurant => {
        const card = document.createElement("div");
        card.className = "restaurant-card";
        
        // Calculate distance if available
        let distanceInfo = '';
        if (restaurant.distance !== undefined) {
            distanceInfo = `
                <p style="margin: 5px 0;">
                    <i class="fas fa-map-marker-alt" style="color: #e17055;"></i>
                    <strong>${restaurant.distance.toFixed(1)} km</strong> away
                </p>
            `;
        } else if (restaurant.address && !restaurant.latitude) {
            distanceInfo = `
                <p style="margin: 5px 0; color: #b2bec3;">
                    <i class="fas fa-map-marker-alt"></i>
                    Location not available for this restaurant
                </p>
            `;
        }
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h3>${restaurant.name}</h3>
                    ${restaurant.cuisine ? `
                        <span style="display: inline-block; background: #f0f0f0; padding: 3px 8px; 
                              border-radius: 12px; font-size: 12px; color: #636e72; margin-bottom: 8px;">
                            <i class="fas fa-utensil-spoon"></i> ${restaurant.cuisine}
                        </span>
                    ` : ''}
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 18px; font-weight: bold; color: #00b894;">
                        ${restaurant.priceRange || '$$'}
                    </span>
                </div>
            </div>
            
            <p style="margin: 10px 0; color: #636e72;">${restaurant.description || "No description provided"}</p>
            
            ${distanceInfo}
            
            <div class="restaurant-details">
                <p><i class="fas fa-map-marker-alt"></i> ${restaurant.address || "Address not specified"}</p>
                ${restaurant.phone ? `<p><i class="fas fa-phone"></i> ${restaurant.phone}</p>` : ''}
                <p><i class="fas fa-clock"></i> Available slots: ${restaurant.slots ? restaurant.slots.join(", ") : "Flexible timing"}</p>
                <p><i class="fas fa-users"></i> Capacity: ${restaurant.capacity || "Not specified"}</p>
            </div>
            
            <button class="book-btn" onclick="openBookingModal('${restaurant.id}')">
                <i class="fas fa-calendar-plus"></i> Book Table
            </button>
            
            ${restaurant.latitude && restaurant.longitude ? `
                <button onclick="showOnMap(${restaurant.latitude}, ${restaurant.longitude}, '${restaurant.name}', '${restaurant.address || ''}')" 
                        style="background: #6c5ce7; margin-top: 10px; width: 100%;">
                    <i class="fas fa-map"></i> View on Map
                </button>
            ` : restaurant.address ? `
                <button onclick="searchAddressOnMap('${restaurant.address}', '${restaurant.name}')" 
                        style="background: #74b9ff; margin-top: 10px; width: 100%;">
                    <i class="fas fa-map-marked-alt"></i> Find on Map
                </button>
            ` : ''}
        `;
        container.appendChild(card);
    });
}
// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

// Sorting and filtering functions
window.sortByDistance = function() {
    if (!userLocation) {
        showToast("Please enable location services to sort by distance.", "warning");
        return;
    }
    
    // First add distances to all restaurants
    const sorted = [...restaurantsData].map(restaurant => {
        if (restaurant.latitude && restaurant.longitude) {
            restaurant.distance = calculateDistance(
                userLocation.latitude,
                userLocation.longitude,
                restaurant.latitude,
                restaurant.longitude
            );
        } else {
            restaurant.distance = Infinity;
        }
        return restaurant;
    }).sort((a, b) => {
        const distA = a.distance || Infinity;
        const distB = b.distance || Infinity;
        return distA - distB;
    });
    
    displayRestaurants(sorted);
    showToast("Sorted restaurants by distance", "success");
};

window.sortByName = function() {
    const sorted = [...restaurantsData].sort((a, b) => 
        a.name.localeCompare(b.name)
    );
    
    displayRestaurants(sorted);
    showToast("Sorted restaurants by name", "success");
};

window.filterByCuisine = async function() {
    // Get unique cuisines
    const cuisines = [...new Set(restaurantsData
        .map(r => r.cuisine)
        .filter(c => c)
    )];
    
    if (cuisines.length === 0) {
        showToast("No cuisines available to filter.", "info");
        return;
    }
    
    // Create a custom prompt for cuisine selection
    const modal = document.createElement('div');
    modal.className = 'confirmation-modal';
    modal.innerHTML = `
        <div class="confirmation-content" style="max-width: 500px;">
            <div class="confirmation-header">
                <div class="confirmation-icon info">
                    <i class="fas fa-filter"></i>
                </div>
                <h3 class="confirmation-title">Filter by Cuisine</h3>
            </div>
            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
                ${cuisines.map(cuisine => `
                    <div class="cuisine-option" onclick="selectCuisine('${cuisine}')" 
                         style="padding: 12px 16px; border-radius: 10px; margin-bottom: 8px; cursor: pointer; 
                                border: 2px solid #e0e0e0; transition: all 0.3s ease;">
                        <i class="fas fa-utensil-spoon" style="margin-right: 10px; color: #e17055;"></i>
                        ${cuisine}
                    </div>
                `).join('')}
            </div>
            <div class="confirmation-buttons">
                <button class="confirmation-cancel" onclick="closeCuisineModal()">
                    Cancel
                </button>
                <button onclick="showAllCuisines()" style="background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600;">
                    Show All
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    window.selectCuisine = function(cuisine) {
        const filtered = restaurantsData.filter(r => 
            r.cuisine && r.cuisine.toLowerCase().includes(cuisine.toLowerCase())
        );
        
        modal.remove();
        delete window.selectCuisine;
        delete window.closeCuisineModal;
        delete window.showAllCuisines;
        
        if (filtered.length === 0) {
            showToast(`No restaurants found for cuisine: ${cuisine}`, "info");
        } else {
            displayRestaurants(filtered);
            showToast(`Showing ${filtered.length} restaurant${filtered.length !== 1 ? 's' : ''} with ${cuisine} cuisine`, "success");
        }
    };
    
    window.closeCuisineModal = function() {
        modal.remove();
        delete window.selectCuisine;
        delete window.closeCuisineModal;
        delete window.showAllCuisines;
    };
    
    window.showAllCuisines = function() {
        modal.remove();
        delete window.selectCuisine;
        delete window.closeCuisineModal;
        delete window.showAllCuisines;
        displayRestaurants(restaurantsData);
        showToast("Showing all cuisines", "success");
    };
};

window.filterRestaurantsByLocation = function() {
    if (!userLocation) {
        showToast("Please enable location services to filter by location.", "warning");
        return;
    }
    
    const filtered = restaurantsData.filter(restaurant => {
        if (!restaurant.latitude || !restaurant.longitude) return false;
        
        restaurant.distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            restaurant.latitude,
            restaurant.longitude
        );
        
        // Show restaurants within 50km (adjust as needed)
        return restaurant.distance <= 50;
    });
    
    if (filtered.length === 0) {
        showToast("No restaurants found within 50km of your location.", "info");
        return;
    }
    
    // Sort by distance
    filtered.sort((a, b) => a.distance - b.distance);
    
    displayRestaurants(filtered);
    showToast(`Showing ${filtered.length} restaurant${filtered.length !== 1 ? 's' : ''} within 50km`, "success");
};

window.updateLocation = async function() {
    const result = await showConfirmation({
        title: "Update Location",
        message: "How would you like to update your location?",
        cancelText: "Cancel",
        confirmText: "Use Current Location",
        type: "info",
        icon: "fa-map-marker-alt"
    });
    
    if (result) {
        // Use current location
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000
                });
            });
            
            userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('userLocation', JSON.stringify(userLocation));
            
            showToast("Location updated successfully!", "success");
            
            // Recalculate distances for all restaurants
            restaurantsData.forEach(restaurant => {
                if (restaurant.latitude && restaurant.longitude) {
                    restaurant.distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        restaurant.latitude,
                        restaurant.longitude
                    );
                }
            });
            
            // Sort by distance
            restaurantsData.sort((a, b) => {
                const distA = a.distance || Infinity;
                const distB = b.distance || Infinity;
                return distA - distB;
            });
            
            displayRestaurants(restaurantsData);
        } catch (error) {
            console.error("Location error:", error);
            showToast("Failed to get current location. Please check your location settings.", "error");
        }
    } else {
        // User cancelled or wants to enter address
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <div class="confirmation-icon info">
                        <i class="fas fa-map-pin"></i>
                    </div>
                    <h3 class="confirmation-title">Enter Location</h3>
                </div>
                <div style="margin-bottom: 20px;">
                    <input type="text" id="address-input" placeholder="Enter your address or city" 
                           style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 14px;">
                </div>
                <div class="confirmation-buttons">
                    <button class="confirmation-cancel" onclick="closeAddressModal()">
                        Cancel
                    </button>
                    <button onclick="submitAddress()" style="background: linear-gradient(135deg, #e17055, #d63031); color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600;">
                        Set Location
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        window.closeAddressModal = function() {
            modal.remove();
            delete window.closeAddressModal;
            delete window.submitAddress;
        };
        
        window.submitAddress = async function() {
            const addressInput = document.getElementById('address-input');
            const address = addressInput.value.trim();
            
            if (!address) {
                showToast("Please enter an address", "warning");
                return;
            }
            
            try {
                const coords = await geocodeAddress(address);
                if (coords) {
                    userLocation = {
                        latitude: coords.lat,
                        longitude: coords.lng,
                        address: address,
                        timestamp: new Date().toISOString()
                    };
                    
                    localStorage.setItem('userLocation', JSON.stringify(userLocation));
                    modal.remove();
                    delete window.closeAddressModal;
                    delete window.submitAddress;
                    
                    showToast("Location updated successfully!", "success");
                    
                    // Recalculate distances
                    restaurantsData.forEach(restaurant => {
                        if (restaurant.latitude && restaurant.longitude) {
                            restaurant.distance = calculateDistance(
                                userLocation.latitude,
                                userLocation.longitude,
                                restaurant.latitude,
                                restaurant.longitude
                            );
                        }
                    });
                    
                    // Sort by distance
                    restaurantsData.sort((a, b) => {
                        const distA = a.distance || Infinity;
                        const distB = b.distance || Infinity;
                        return distA - distB;
                    });
                    
                    displayRestaurants(restaurantsData);
                } else {
                    showToast("Could not find coordinates for that address. Please try again.", "error");
                }
            } catch (error) {
                console.error("Geocoding error:", error);
                showToast("Error geocoding address. Please try a different address.", "error");
            }
        };
    }
};

window.clearLocation = function() {
    localStorage.removeItem('userLocation');
    userLocation = null;
    showToast("Location cleared", "info");
    loadRestaurants();
};

window.showOnMap = function(lat, lng, name, address) {
    // Create a toast with map info
    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    toast.innerHTML = `
        <i class="fas fa-map"></i>
        <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 4px;">${name}</div>
            ${address ? `<div style="font-size: 12px; opacity: 0.8;">${address}</div>` : ''}
            <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">
                Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}
            </div>
            <button onclick="openGoogleMaps(${lat}, ${lng})" style="background: #4285f4; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; margin-top: 8px; cursor: pointer;">
                <i class="fab fa-google"></i> Open in Google Maps
            </button>
        </div>
    `;
    
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
    
    // Store function to open maps
    window.openGoogleMaps = function(lat, lng) {
        const url = `https://www.google.com/maps?q=${lat},${lng}&z=15`;
        window.open(url, '_blank');
    };
};

window.searchAddressOnMap = function(address, name) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    toast.innerHTML = `
        <i class="fas fa-map-marked-alt"></i>
        <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 4px;">${name}</div>
            <div style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">${address}</div>
            <button onclick="searchInGoogleMaps('${encodeURIComponent(address)}')" style="background: #4285f4; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                <i class="fab fa-google"></i> Search in Google Maps
            </button>
        </div>
    `;
    
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
    
    window.searchInGoogleMaps = function(searchAddress) {
        const url = `https://www.google.com/maps/search/?api=1&query=${searchAddress}`;
        window.open(url, '_blank');
    };
};

window.clearFilters = function() {
    loadRestaurants();
    showToast("All filters cleared", "success");
};

// Geocoding function
async function geocodeAddress(address) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`
        );
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
        return null;
    } catch (error) {
        console.error("Geocoding error:", error);
        return null;
    }
}
window.openBookingModal = async function(restaurantId) {
  console.log("Opening booking modal for restaurant:", restaurantId);
  currentRestaurant = restaurantId;
  
  try {
    const restaurantDoc = await getDoc(doc(db, "restaurants", restaurantId));
    
    if (!restaurantDoc.exists()) {
      showToast("Restaurant not found!");
      return;
    }
    
    const restaurant = restaurantDoc.data();
    
    // Set modal title
    document.getElementById("modal-title").textContent = `Book Table at ${restaurant.name}`;
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("booking-date").min = today;
    document.getElementById("booking-date").value = today;
    
    // Load time slots
    const timeSelect = document.getElementById("booking-time");
    timeSelect.innerHTML = "";
    
    if (restaurant.slots && restaurant.slots.length > 0) {
      restaurant.slots.forEach(slot => {
        const option = document.createElement("option");
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
      });
    } else {
      // Default time slots
      const defaultSlots = ["18:00-19:30", "19:30-21:00", "21:00-22:30"];
      defaultSlots.forEach(slot => {
        const option = document.createElement("option");
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
      });
    }
    
    // Show modal
    document.getElementById("booking-modal").classList.remove("hidden");
    
  } catch (error) {
    console.error("Error opening booking modal:", error);
    showToast("Failed to open booking form. Please try again.");
  }
};

window.confirmBooking = async function() {
  const date = document.getElementById("booking-date").value;
  const time = document.getElementById("booking-time").value;
  const guests = parseInt(document.getElementById("booking-guests").value);
  const requests = document.getElementById("special-requests").value;
  
  if (!date || !time || !guests || guests < 1) {
    showToast("Please fill in all required fields correctly.");
    return;
  }
  
  try {
    const restaurantDoc = await getDoc(doc(db, "restaurants", currentRestaurant));
    
    if (!restaurantDoc.exists()) {
      showToast("Restaurant not found!");
      return;
    }
    
    const restaurant = restaurantDoc.data();
    
    // Create booking
    await addDoc(collection(db, "bookings"), {
      restaurantId: currentRestaurant,
      restaurantName: restaurant.name,
      ownerId: restaurant.ownerId,
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      date: date,
      time: time,
      guests: guests,
      specialRequests: requests,
      status: "PENDING",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    closeModal();
    showToast("Booking request submitted successfully!\n\nThe restaurant owner will confirm your booking soon.","success");
    
  } catch (error) {
    console.error("Error creating booking:", error);
    showToast("Failed to create booking. Please try again.","error");
  }
};

window.closeModal = function() {
  document.getElementById("booking-modal").classList.add("hidden");
  currentRestaurant = null;
  
  // Reset form
  document.getElementById("booking-guests").value = "2";
  document.getElementById("special-requests").value = "";
};

window.logout = async function() {
  try {
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    showToast("Logout failed. Please try again.","error");
  }
};
function showToast(message, type = "success") {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
// Helper function to show errors
function showError(message) {
  const container = document.getElementById("restaurants-container") || document.body;
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    ${message}
  `;
  container.appendChild(errorDiv);
}
