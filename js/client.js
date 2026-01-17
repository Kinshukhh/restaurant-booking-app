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
        showError("Authentication error. Please login again.");
    }
});

// Get user's current location
async function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn("Geolocation is not supported by this browser.");
            resolve(null);
            return;
        }
        
        // Check if we have saved location
        const savedLocation = localStorage.getItem('userLocation');
        if (savedLocation) {
            try {
                userLocation = JSON.parse(savedLocation);
                console.log("Using saved location:", userLocation);
                // Don't show location request if we already have location
                resolve(userLocation);
                return;
            } catch (e) {
                console.warn("Failed to parse saved location:", e);
            }
        }
        
        // Only show location request if we don't have a saved location
        const locationSection = document.createElement('div');
        locationSection.className = 'location-request';
        locationSection.innerHTML = `
            <div style="background: #fff3cd; padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-map-marker-alt" style="color: #ffc107; font-size: 20px;"></i>
                    <div>
                        <h4 style="margin: 0; color: #856404;">Enable Location Services</h4>
                        <p style="margin: 5px 0; color: #856404; font-size: 14px;">
                            Allow location access to see restaurants near you
                        </p>
                    </div>
                </div>
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button onclick="allowLocation()" class="allow-location-btn">
                        <i class="fas fa-check"></i> Allow Location
                    </button>
                    <button onclick="skipLocation()" style="background: transparent; border: 1px solid #ccc; color: #666;">
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
                        timeout: 5000,
                        maximumAge: 0
                    });
                });
                
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                
                console.log("User location obtained:", userLocation);
                
                // Save location to localStorage for future use
                localStorage.setItem('userLocation', JSON.stringify(userLocation));
                
                // Update UI
                locationSection.innerHTML = `
                    <div style="background: #d4edda; padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #28a745;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-map-marker-alt" style="color: #28a745; font-size: 20px;"></i>
                            <div>
                                <h4 style="margin: 0; color: #155724;">Location Enabled</h4>
                                <p style="margin: 5px 0; color: #155724; font-size: 14px;">
                                    Showing restaurants near your location
                                </p>
                            </div>
                        </div>
                    </div>
                `;
                
                // Reload restaurants with location
                if (restaurantsData.length > 0) {
                    filterRestaurantsByLocation();
                }
                
                resolve(userLocation);
            } catch (error) {
                console.warn("Location access denied or failed:", error);
                locationSection.innerHTML = `
                    <div style="background: #f8d7da; padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #dc3545;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-exclamation-circle" style="color: #dc3545; font-size: 20px;"></i>
                            <div>
                                <h4 style="margin: 0; color: #721c24;">Location Access Denied</h4>
                                <p style="margin: 5px 0; color: #721c24; font-size: 14px;">
                                    Showing all restaurants instead
                                </p>
                            </div>
                        </div>
                    </div>
                `;
                resolve(null);
            }
        };
        
        window.skipLocation = function() {
            locationSection.style.display = 'none';
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
        if (loadingElement) loadingElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading restaurants...';
        
        // Get all restaurants
        const querySnapshot = await getDocs(collection(db, "restaurants"));
        console.log("Restaurants found:", querySnapshot.size);
        
        // Hide loading
        if (loadingElement) loadingElement.style.display = "none";
        
        restaurantsData = [];
        container.innerHTML = "";
        
        if (querySnapshot.empty) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-utensils" style="font-size: 48px; color: #dfe6e9; margin-bottom: 20px;"></i>
                    <p style="color: #636e72; font-size: 18px;">No restaurants available yet.</p>
                    <p style="color: #b2bec3;">Check back later or ask restaurant owners to add their listings.</p>
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
        
        if (loadingElement) loadingElement.style.display = "none";
        
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                Failed to load restaurants. Please try again.
                <p style="font-size: 14px; margin-top: 10px;">Error: ${error.message}</p>
                <button onclick="location.reload()" style="margin-top: 15px;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function displayRestaurants(restaurants) {
    const container = document.getElementById("restaurants-container");
    container.innerHTML = "";
    
    // Add filter options
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-section';
    filterSection.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <h3 style="margin: 0;">${restaurants.length} Restaurants Found</h3>
                <div style="display: flex; gap: 10px;">
                    <button onclick="sortByDistance()" class="filter-btn">
                        <i class="fas fa-map-marker-alt"></i> Sort by Distance
                    </button>
                    <button onclick="sortByName()" class="filter-btn">
                        <i class="fas fa-sort-alpha-down"></i> Sort by Name
                    </button>
                    <button onclick="filterByCuisine()" class="filter-btn">
                        <i class="fas fa-utensil-spoon"></i> Filter by Cuisine
                    </button>
                </div>
            </div>
            
            ${userLocation ? `
                <div style="margin-top: 10px; font-size: 14px; color: #636e72;">
                    <i class="fas fa-map-marker-alt" style="color: #e17055;"></i>
                    ${restaurants.some(r => r.distance) ? 'Showing restaurants near your location' : 'No restaurants with location data found'}
                    <span id="current-location" style="cursor: pointer; color: #e17055; margin-left: 10px;" 
                          onclick="updateLocation()">
                        <i class="fas fa-sync-alt"></i> Update Location
                    </span>
                </div>
            ` : ''}
        </div>
    `;
    
    container.appendChild(filterSection);
    
    if (restaurants.length === 0) {
        container.innerHTML += `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-search" style="font-size: 48px; color: #dfe6e9; margin-bottom: 20px;"></i>
                <p style="color: #636e72; font-size: 18px;">No restaurants match your filters.</p>
                <button onclick="clearFilters()" style="margin-top: 15px;">
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
        alert("Please enable location services to sort by distance.");
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
};

window.sortByName = function() {
    const sorted = [...restaurantsData].sort((a, b) => 
        a.name.localeCompare(b.name)
    );
    
    displayRestaurants(sorted);
};

window.filterByCuisine = function() {
    // Get unique cuisines
    const cuisines = [...new Set(restaurantsData
        .map(r => r.cuisine)
        .filter(c => c)
    )];
    
    if (cuisines.length === 0) {
        alert("No cuisines available to filter.");
        return;
    }
    
    const cuisine = prompt(`Available cuisines:\n${cuisines.join('\n')}\n\nEnter cuisine to filter:`);
    if (cuisine) {
        const filtered = restaurantsData.filter(r => 
            r.cuisine && r.cuisine.toLowerCase().includes(cuisine.toLowerCase())
        );
        
        if (filtered.length === 0) {
            alert(`No restaurants found for cuisine: ${cuisine}`);
        } else {
            displayRestaurants(filtered);
        }
    }
};

window.filterRestaurantsByLocation = function() {
    if (!userLocation) return;
    
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
        alert("No restaurants found within 50km of your location.");
        return;
    }
    
    // Sort by distance
    filtered.sort((a, b) => a.distance - b.distance);
    
    displayRestaurants(filtered);
};

window.updateLocation = async function() {
    const useCurrentLocation = confirm("Use your current location? Click OK for current location, or Cancel to enter an address.");
    
    if (useCurrentLocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 5000
                });
            });
            
            userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            
            localStorage.setItem('userLocation', JSON.stringify(userLocation));
            
            alert("Location updated successfully!");
            
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
            alert("Failed to get current location. Please check your location settings.");
        }
    } else {
        const address = prompt("Enter your address or location:");
        if (address) {
            try {
                const coords = await geocodeAddress(address);
                if (coords) {
                    userLocation = {
                        latitude: coords.lat,
                        longitude: coords.lng
                    };
                    
                    localStorage.setItem('userLocation', JSON.stringify(userLocation));
                    alert("Location updated successfully!");
                    
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
                    alert("Could not find coordinates for that address.");
                }
            } catch (error) {
                alert("Error geocoding address. Please try a different address.");
            }
        }
    }
};

window.showOnMap = function(lat, lng, name, address) {
    // Open in Google Maps
    const url = `https://www.google.com/maps?q=${lat},${lng}&z=15`;
    window.open(url, '_blank');
    
    // Also show coordinates for reference
    alert(`${name}\n${address ? address + '\n' : ''}\nCoordinates:\nLatitude: ${lat}\nLongitude: ${lng}\n\nOpening in Google Maps...`);
};

window.searchAddressOnMap = function(address, name) {
    // Open Google Maps with address search
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
    
    alert(`${name}\n\nSearching for: ${address}\n\nOpening in Google Maps...`);
};

window.clearFilters = function() {
    loadRestaurants();
};

// Geocoding function
async function geocodeAddress(address) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
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
      alert("Restaurant not found!");
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
    alert("Failed to open booking form. Please try again.");
  }
};

window.confirmBooking = async function() {
  const date = document.getElementById("booking-date").value;
  const time = document.getElementById("booking-time").value;
  const guests = parseInt(document.getElementById("booking-guests").value);
  const requests = document.getElementById("special-requests").value;
  
  if (!date || !time || !guests || guests < 1) {
    alert("Please fill in all required fields correctly.");
    return;
  }
  
  try {
    const restaurantDoc = await getDoc(doc(db, "restaurants", currentRestaurant));
    
    if (!restaurantDoc.exists()) {
      alert("Restaurant not found!");
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
    alert("✅ Booking request submitted successfully!\n\nThe restaurant owner will confirm your booking soon.");
    
  } catch (error) {
    console.error("Error creating booking:", error);
    alert("Failed to create booking. Please try again.");
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
    alert("Logout failed. Please try again.");
  }
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