import {
    collection, getDocs, query, where, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let map;
let markers = [];
let userMarker = null;
let userLocation = null;
let restaurants = [];

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
        
        initMap();
        loadRestaurants();
    } catch (error) {
        console.error("Auth check failed:", error);
        window.location.href = "index.html";
    }
});

function initMap() {
    // Initialize map with default view (world)
    map = L.map('map').setView([20, 0], 2);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Try to get user location
    getUserLocation();
}

async function getUserLocation() {
    try {
        const position = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation not supported"));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000
            });
        });
        
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        // Add user marker
        userMarker = L.marker([userLocation.lat, userLocation.lng])
            .addTo(map)
            .bindPopup('<b>Your Location</b>')
            .openPopup();
        
        // Center map on user
        map.setView([userLocation.lat, userLocation.lng], 13);
        
    } catch (error) {
        console.warn("Could not get user location:", error);
        // Use saved location if available
        const savedLocation = localStorage.getItem('userLocation');
        if (savedLocation) {
            try {
                const loc = JSON.parse(savedLocation);
                userLocation = { lat: loc.latitude, lng: loc.longitude };
                userMarker = L.marker([userLocation.lat, userLocation.lng])
                    .addTo(map)
                    .bindPopup('<b>Your Location</b>');
                map.setView([userLocation.lat, userLocation.lng], 13);
            } catch (e) {
                console.warn("Failed to parse saved location:", e);
            }
        }
    }
}

async function loadRestaurants() {
    try {
        const querySnapshot = await getDocs(collection(db, "restaurants"));
        restaurants = [];
        
        querySnapshot.forEach((doc) => {
            const restaurant = {
                id: doc.id,
                ...doc.data()
            };
            if (restaurant.latitude && restaurant.longitude) {
                restaurants.push(restaurant);
            }
        });
        
        displayRestaurantsOnMap();
        updateRestaurantList();
        
    } catch (error) {
        console.error("Error loading restaurants:", error);
        document.getElementById('restaurant-list').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                Failed to load restaurants.
            </div>
        `;
    }
}

function displayRestaurantsOnMap() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    restaurants.forEach(restaurant => {
        // Create custom icon
        const restaurantIcon = L.divIcon({
            html: `<div class="restaurant-marker">
                      <i class="fas fa-utensils"></i>
                      ${restaurant.name.substring(0, 15)}${restaurant.name.length > 15 ? '...' : ''}
                   </div>`,
            className: 'restaurant-marker-icon',
            iconSize: [150, 40],
            iconAnchor: [75, 40]
        });
        
        const marker = L.marker([restaurant.latitude, restaurant.longitude], {
            icon: restaurantIcon
        })
        .addTo(map)
        .bindPopup(`
            <div style="min-width: 200px;">
                <h4 style="margin: 0 0 10px 0;">${restaurant.name}</h4>
                <p style="margin: 5px 0; color: #636e72;">${restaurant.cuisine || 'Various cuisine'}</p>
                <p style="margin: 5px 0; color: #636e72;">${restaurant.address || 'No address'}</p>
                ${restaurant.phone ? `<p style="margin: 5px 0;"><i class="fas fa-phone"></i> ${restaurant.phone}</p>` : ''}
                <div style="margin-top: 10px;">
                    <button onclick="bookRestaurant('${restaurant.id}')" 
                            style="background: #00b894; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; width: 100%;">
                        <i class="fas fa-calendar-plus"></i> Book Now
                    </button>
                </div>
            </div>
        `);
        
        // Store reference to restaurant
        marker.restaurantId = restaurant.id;
        markers.push(marker);
    });
}

function updateRestaurantList() {
    const listContainer = document.getElementById('restaurant-list');
    listContainer.innerHTML = '';
    
    if (restaurants.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #636e72;">
                <i class="fas fa-utensils"></i>
                <p>No restaurants with location data</p>
            </div>
        `;
        return;
    }
    
    restaurants.forEach((restaurant, index) => {
        const item = document.createElement('div');
        item.className = 'restaurant-list-item';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${restaurant.name}</strong><br>
                    <small style="color: #636e72;">${restaurant.cuisine || 'Various cuisine'}</small>
                </div>
                <button onclick="flyToRestaurant(${restaurant.latitude}, ${restaurant.longitude}, ${index})" 
                        style="background: #e17055; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-map-marker-alt"></i>
                </button>
            </div>
        `;
        
        item.addEventListener('click', () => {
            flyToRestaurant(restaurant.latitude, restaurant.longitude, index);
        });
        
        listContainer.appendChild(item);
    });
}

window.flyToRestaurant = function(lat, lng, index) {
    map.flyTo([lat, lng], 15);
    
    // Open the marker popup
    const marker = markers.find(m => m.restaurantId === restaurants[index].id);
    if (marker) {
        marker.openPopup();
    }
    
    // Highlight the list item
    document.querySelectorAll('.restaurant-list-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
};

window.centerOnUser = function() {
    if (userLocation && userMarker) {
        map.flyTo([userLocation.lat, userLocation.lng], 13);
        userMarker.openPopup();
    } else {
        alert("Location not available. Please enable location services.");
    }
};

window.showAllMarkers = function() {
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        if (userMarker) {
            group.addLayer(userMarker);
        }
        map.fitBounds(group.getBounds().pad(0.1));
    } else if (userMarker) {
        map.setView([userMarker.getLatLng().lat, userMarker.getLatLng().lng], 13);
    } else {
        map.setView([20, 0], 2);
    }
};

window.bookRestaurant = function(restaurantId) {
    window.location.href = `client.html?restaurant=${restaurantId}`;
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