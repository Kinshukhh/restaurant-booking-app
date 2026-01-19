import {
    collection, getDocs, addDoc, query, where, getDoc, doc,
    updateDoc, deleteDoc, onSnapshot, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let currentRestaurant = null;
let userLocation = null;
let restaurantsData = [];

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
            <div class="location-request-container">
                <div class="location-header">
                    <div class="location-icon">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="location-info">
                        <h4>Enable Location Services</h4>
                        <p>Allow location access to see restaurants near you and get distance information</p>
                    </div>
                </div>
                <div class="location-buttons">
                    <button onclick="allowLocation()" class="allow-location-btn">
                        <i class="fas fa-check"></i> Allow Location
                    </button>
                    <button onclick="skipLocation()" class="skip-location-btn">
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
                    <div class="location-success-container">
                        <div class="location-header">
                            <div class="location-icon success">
                                <i class="fas fa-map-marker-alt"></i>
                            </div>
                            <div class="location-info">
                                <h4>Location Enabled</h4>
                                <p>Showing restaurants near your location</p>
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
                    <div class="location-error-container">
                        <div class="location-header">
                            <div class="location-icon error">
                                <i class="fas fa-exclamation-circle"></i>
                            </div>
                            <div class="location-info">
                                <h4>Location Access Denied</h4>
                                <p>Showing all restaurants instead</p>
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
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-utensils"></i>
                    </div>
                    <h3>No Restaurants Available</h3>
                    <p>No restaurants have been registered yet. Check back later or ask restaurant owners to add their listings.</p>
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
            <div class="error-message">
                <div class="error-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <h3>Failed to Load Restaurants</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()" class="retry-btn">
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
        <div class="filter-header">
            <div class="filter-title">
                <h2>Restaurants</h2>
                <p class="restaurant-count">${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''} found</p>
            </div>
            <div class="filter-buttons">
                <button onclick="sortByDistance()" class="filter-btn">
                    <i class="fas fa-map-marker-alt"></i> Sort by Distance
                </button>
                <button onclick="sortByName()" class="filter-btn">
                    <i class="fas fa-sort-alpha-down"></i> Sort by Name
                </button>
                <button onclick="filterByCuisine()" class="filter-btn">
                    <i class="fas fa-filter"></i> Filter by Cuisine
                </button>
            </div>
        </div>
        
        ${userLocation ? `
            <div class="location-status">
                <div class="location-info">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>
                        ${restaurants.some(r => r.distance) ? 
                            'Showing restaurants near your location' : 
                            'No restaurants with location data found'}
                    </span>
                </div>
                <div class="location-actions">
                    <span id="current-location" onclick="updateLocation()">
                        <i class="fas fa-sync-alt"></i> Update Location
                    </span>
                    <span onclick="clearLocation()">
                        <i class="fas fa-times"></i> Clear
                    </span>
                </div>
            </div>
        ` : ''}
    `;
    
    container.appendChild(filterSection);
    
    if (restaurants.length === 0) {
        container.innerHTML += `
            <div class="no-results">
                <div class="no-results-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h3>No Restaurants Match Your Filters</h3>
                <p>Try changing your filters or clear them to see all available restaurants.</p>
                <button onclick="clearFilters()" class="clear-filters-btn">
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
                <p class="restaurant-distance">
                    <i class="fas fa-map-marker-alt"></i>
                    <strong>${restaurant.distance.toFixed(1)} km</strong> away
                </p>
            `;
        } else if (restaurant.address && !restaurant.latitude) {
            distanceInfo = `
                <p class="restaurant-no-location">
                    <i class="fas fa-map-marker-alt"></i>
                    Location not available for this restaurant
                </p>
            `;
        }
        
        card.innerHTML = `
            ${restaurant.imageUrl ? `
                <img 
                    src="${restaurant.imageUrl}" 
                    class="restaurant-image"
                    loading="lazy"
                    alt="${restaurant.name}"
                >
            ` : `
                <div class="restaurant-image-placeholder">
                    <i class="fas fa-image"></i>
                </div>
            `}

            <div class="restaurant-header">
                <div class="restaurant-title">
                    <h3>${restaurant.name}</h3>
                    ${restaurant.cuisine ? `
                        <span class="cuisine-badge">
                            <i class="fas fa-utensil-spoon"></i> ${restaurant.cuisine}
                        </span>
                    ` : ''}
                </div>
                <div class="price-range">
                    <span class="price-tag">${restaurant.priceRange || '$$'}</span>
                </div>
            </div>

            <p class="restaurant-description">${restaurant.description || "No description provided"}</p>

            ${distanceInfo}

            <div class="restaurant-details">
                <p><i class="fas fa-map-marker-alt"></i> ${restaurant.address || "Address not specified"}</p>
                ${restaurant.phone ? `<p><i class="fas fa-phone"></i> ${restaurant.phone}</p>` : ''}
                <p><i class="fas fa-clock"></i> Available slots: 
                    ${restaurant.slots ? restaurant.slots.join(", ") : "Flexible timing"}
                </p>
                <p><i class="fas fa-users"></i> Capacity: ${restaurant.capacity || "Not specified"}</p>
            </div>

            <button class="book-btn" onclick="openBookingModal('${restaurant.id}')">
                <i class="fas fa-calendar-plus"></i> Book Table
            </button>

            ${restaurant.latitude && restaurant.longitude ? `
                <button onclick="showOnMap(${restaurant.latitude}, ${restaurant.longitude}, 
                    '${restaurant.name.replace(/'/g, "\\'")}', '${restaurant.address ? restaurant.address.replace(/'/g, "\\'") : ''}')"
                    class="map-btn">
                    <i class="fas fa-map"></i> View on Map
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

window.filterByCuisine = function () {
    const cuisines = [...new Set(
        restaurantsData.map(r => r.cuisine).filter(Boolean)
    )];

    if (!cuisines.length) {
        showToast("No cuisines available", "info");
        return;
    }

    const modal = document.createElement("div");
    modal.className = "confirmation-modal";

    modal.innerHTML = `
        <div class="confirmation-content">
            <h3>Filter by Cuisine</h3>
            <div class="cuisine-list">
                ${cuisines.map(c => `
                    <div class="cuisine-option">${c}</div>
                `).join("")}
            </div>
            <button class="confirmation-cancel">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll(".cuisine-option").forEach(el => {
        el.onclick = () => {
            const filtered = restaurantsData.filter(r =>
                r.cuisine?.toLowerCase().includes(el.textContent.toLowerCase())
            );
            modal.remove();
            displayRestaurants(filtered);
        };
    });

    modal.querySelector(".confirmation-cancel").onclick = () => modal.remove();
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
        const modal = document.createElement("div");
modal.className = "confirmation-modal";
document.body.appendChild(modal);

        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <div class="confirmation-icon info">
                        <i class="fas fa-map-pin"></i>
                    </div>
                    <h3 class="confirmation-title">Enter Location</h3>
                </div>
                <div class="address-input-container">
                    <input type="text" id="address-input" placeholder="Enter your address or city">
                </div>
                <div class="confirmation-buttons">
                    <button class="confirmation-cancel" onclick="closeAddressModal()">
                        Cancel
                    </button>
                    <button onclick="submitAddress()" class="set-location-btn">
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
    toast.className = 'toast toast-info map-toast';
    toast.innerHTML = `
        <i class="fas fa-map"></i>
        <div class="map-toast-content">
            <div class="map-toast-title">${name}</div>
            ${address ? `<div class="map-toast-address">${address}</div>` : ''}
            <div class="map-toast-coords">
                Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}
            </div>
            <button onclick="openGoogleMaps(${lat}, ${lng})" class="open-map-btn">
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
    toast.className = 'toast toast-info map-toast';
    toast.innerHTML = `
        <i class="fas fa-map-marked-alt"></i>
        <div class="map-toast-content">
            <div class="map-toast-title">${name}</div>
            <div class="map-toast-address">${address}</div>
            <button onclick="searchInGoogleMaps('${encodeURIComponent(address)}')" class="open-map-btn">
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

window.openBookingModal = async function (restaurantId) {
    currentRestaurant = restaurantId;

    const restaurantDoc = await getDoc(doc(db, "restaurants", restaurantId));
    if (!restaurantDoc.exists()) {
        showToast("Restaurant not found", "error");
        return;
    }

    const restaurant = restaurantDoc.data();

    document.getElementById("modal-title").textContent =
        `Book Table at ${restaurant.name}`;

    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("booking-date");
    dateInput.min = today;
    dateInput.value = today;

    const timeSelect = document.getElementById("booking-time");
    timeSelect.innerHTML = "";

    (restaurant.slots?.length ? restaurant.slots : [
        "18:00-19:30",
        "19:30-21:00",
        "21:00-22:30"
    ]).forEach(slot => {
        const opt = document.createElement("option");
        opt.value = slot;
        opt.textContent = slot;
        timeSelect.appendChild(opt);
    });

    const modal = document.getElementById("booking-modal");
    modal.classList.remove("hidden");

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
        showToast("Booking request submitted successfully!\n\nThe restaurant owner will confirm your booking soon.", "success");
        
    } catch (error) {
        console.error("Error creating booking:", error);
        showToast("Failed to create booking. Please try again.", "error");
    }
};

window.closeModal = function () {
    document.getElementById("booking-modal").classList.add("hidden");
    currentRestaurant = null;

    document.getElementById("booking-guests").value = "2";
    document.getElementById("special-requests").value = "";
};


window.logout = async function() {
    try {
        await auth.signOut();
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Logout failed. Please try again.", "error");
    }
};

// Confirmation modal function (moved to global scope)
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

// Add the following CSS classes to your style.css file
const additionalStyles = `
/* Location Request Styles */
.location-request {
    margin-bottom: 20px;
    animation: fadeSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
/* FULLSCREEN MODAL FIX */
#booking-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;

  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);

  z-index: 100000; /* VERY IMPORTANT */
}

/* hide */
#booking-modal.hidden {
  display: none;
}

/* modal box */
#booking-modal .modal-content {
  width: 92%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;

  background: #fff;
  border-radius: 20px;
  padding: 20px;

  animation: modalPop 0.25s ease-out;
}


@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}


.location-request-container,
.location-success-container,
.location-error-container {
    padding: 20px;
    border-radius: 16px;
    border-left: 4px solid;
    margin-bottom: 20px;
}

.location-request-container {
    background: linear-gradient(135deg, #fff3cd, #ffeaa7);
    border-left-color: #ffc107;
}

.location-success-container {
    background: linear-gradient(135deg, #d4edda, #c3e6cb);
    border-left-color: #28a745;
}

.location-error-container {
    background: linear-gradient(135deg, #f8d7da, #f5c6cb);
    border-left-color: #dc3545;
}

.location-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
}

.location-icon {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.location-request-container .location-icon {
    background: linear-gradient(135deg, #ffc107, #ff9800);
}

.location-success-container .location-icon {
    background: linear-gradient(135deg, #28a745, #20c997);
}

.location-error-container .location-icon {
    background: linear-gradient(135deg, #dc3545, #c82333);
}

.location-icon i {
    color: white;
    font-size: 24px;
}

.location-info {
    flex: 1;
}

.location-info h4 {
    margin: 0 0 5px 0;
    font-weight: 700;
}

.location-request-container .location-info h4 {
    color: #856404;
}

.location-success-container .location-info h4 {
    color: #155724;
}

.location-error-container .location-info h4 {
    color: #721c24;
}

.location-info p {
    margin: 0;
    font-size: 14px;
    opacity: 0.9;
}

.location-request-container .location-info p {
    color: #856404;
}

.location-success-container .location-info p {
    color: #155724;
}

.location-error-container .location-info p {
    color: #721c24;
}

.location-buttons {
    display: flex;
    gap: 10px;
}

.allow-location-btn {
    flex: 1;
    background: linear-gradient(135deg, #ffc107, #ff9800);
    color: #000;
}

.skip-location-btn {
    background: transparent;
    border: 2px solid #ddd;
    color: #666;
    padding: 10px 20px;
    border-radius: 10px;
    font-weight: 600;
}

/* Empty States */
.empty-state {
    text-align: center;
    padding: 60px 20px;
}

.empty-state-icon {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #f5f7fa, #c3cfe2);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
}

.empty-state-icon i {
    font-size: 36px;
    color: #6c757d;
}

.empty-state h3 {
    color: #495057;
    margin-bottom: 10px;
}

.empty-state p {
    color: #6c757d;
    max-width: 400px;
    margin: 0 auto 25px;
}

/* Error Message */
.error-message {
    text-align: center;
    padding: 40px 20px;
}

.error-icon {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #f8d7da, #f5c6cb);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
}

.error-icon i {
    color: #721c24;
    font-size: 24px;
}

.error-message h3 {
    color: #721c24;
    margin-bottom: 10px;
}

.error-message p {
    color: #856404;
    margin-bottom: 20px;
}

/* Filter Section */
.filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
    margin-bottom: 15px;
}

.filter-title h2 {
    margin: 0;
    color: var(--text-primary, #2d3436);
}

.restaurant-count {
    margin: 5px 0 0 0;
    color: var(--text-secondary, #636e72);
    font-size: 14px;
}

.filter-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

/* Location Status */
.location-status {
    background: rgba(225, 112, 85, 0.1);
    padding: 12px 16px;
    border-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}

.location-info {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #636e72;
    font-size: 14px;
}

.location-info i {
    color: #e17055;
}

.location-actions {
    display: flex;
    gap: 10px;
}

.location-actions span {
    cursor: pointer;
    font-size: 14px;
}

#current-location {
    color: #e17055;
    font-weight: 600;
}

/* No Results */
.no-results {
    text-align: center;
    padding: 60px 20px;
}

.no-results-icon {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #f5f7fa, #c3cfe2);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
}

.no-results-icon i {
    font-size: 36px;
    color: #6c757d;
}

.no-results h3 {
    color: #495057;
    margin-bottom: 10px;
}

.no-results p {
    color: #6c757d;
    max-width: 400px;
    margin: 0 auto 25px;
}

.clear-filters-btn {
    background: linear-gradient(135deg, #6c5ce7, #a29bfe);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
}

/* Restaurant Card Styles */
.restaurant-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
}

.restaurant-title {
    flex: 1;
}

.restaurant-title h3 {
    margin: 0 0 8px 0;
}

.cuisine-badge {
    display: inline-block;
    background: #f0f0f0;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 12px;
    color: #636e72;
}

.cuisine-badge i {
    margin-right: 4px;
}

.price-range {
    text-align: right;
}

.price-tag {
    font-size: 18px;
    font-weight: bold;
    color: #00b894;
}

.restaurant-description {
    margin: 10px 0;
    color: #636e72;
    line-height: 1.5;
}

.restaurant-distance {
    margin: 5px 0;
    color: #636e72;
}

.restaurant-distance i {
    color: #e17055;
    margin-right: 5px;
}

.restaurant-no-location {
    margin: 5px 0;
    color: #b2bec3;
}

.restaurant-no-location i {
    margin-right: 5px;
}

/* Restaurant Image */
.restaurant-image {
    width: 100%;
    height: 180px;
    object-fit: cover;
    border-radius: 16px;
    margin-bottom: 1rem;
}

.restaurant-image-placeholder {
    width: 100%;
    height: 180px;
    background: linear-gradient(135deg, #f5f7fa, #c3cfe2);
    border-radius: 16px;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #b2bec3;
}

.restaurant-image-placeholder i {
    font-size: 48px;
}

/* Buttons */
.map-btn {
    background: #6c5ce7;
    margin-top: 10px;
    width: 100%;
}

.show-all-btn {
    background: linear-gradient(135deg, #6c5ce7, #a29bfe);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 10px;
    font-weight: 600;
}

.set-location-btn {
    background: linear-gradient(135deg, #e17055, #d63031);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 10px;
    font-weight: 600;
}

/* Cuisine Filter */
.cuisine-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 20px;
}

.cuisine-option {
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    border: 2px solid #e0e0e0;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 10px;
}

.cuisine-option:hover {
    background: rgba(225, 112, 85, 0.1);
    border-color: #e17055;
}

.cuisine-option i {
    color: #e17055;
}

/* Address Input */
.address-input-container {
    margin-bottom: 20px;
}

.address-input-container input {
    width: 100%;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-size: 14px;
}

/* Map Toast */
.map-toast {
    max-width: 400px;
}

.map-toast-content {
    flex: 1;
}

.map-toast-title {
    font-weight: 600;
    margin-bottom: 4px;
}

.map-toast-address {
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 8px;
}

.map-toast-coords {
    font-size: 11px;
    opacity: 0.6;
    margin-top: 4px;
}

.open-map-btn {
    background: #4285f4;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-top: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

/* Retry Button */
.retry-btn {
    background: linear-gradient(135deg, #e17055, #d63031);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 10px;
}

/* Dark Mode Adjustments */
@media (prefers-color-scheme: dark) {
    .restaurant-image-placeholder {
        background: linear-gradient(135deg, #2d3436, #1a1a1a);
    }
    
    .cuisine-badge {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.7);
    }
    
    .restaurant-description,
    .restaurant-distance,
    .restaurant-no-location {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .location-status {
        background: rgba(225, 112, 85, 0.2);
    }
    
    .skip-location-btn {
        border-color: rgba(255, 255, 255, 0.3);
        color: rgba(255, 255, 255, 0.7);
    }
}
`;

// Add the additional styles to the document
if (!document.querySelector('#client-additional-styles')) {
    const style = document.createElement('style');
    style.id = 'client-additional-styles';
    style.textContent = additionalStyles;
    document.head.appendChild(style);
}
