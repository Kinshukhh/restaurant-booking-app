import {
    collection, getDocs, addDoc, query, where,
    doc, getDoc, updateDoc, deleteDoc, onSnapshot,
    orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let currentRestaurantId = null;
let restaurantsData = [];
let bookingsData = [];
let isLoading = true;

// Check authentication
auth.onAuthStateChanged(async (user) => {
    console.log("Owner Restaurants: Auth state changed. User:", user);
    
    if (!user) {
        console.log("No user, redirecting to login");
        window.location.href = "index.html";
        return;
    }
    
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
            console.error("User document doesn't exist");
            window.location.href = "index.html";
            return;
        }
        
        const userData = userDoc.data();
        console.log("User role:", userData.role);
        
        if (userData.role !== "OWNER") {
            console.log("Not an owner, redirecting to client");
            window.location.href = "client.html";
            return;
        }
        
        // Check if we're editing a restaurant from owner.html
        const editRestaurantId = localStorage.getItem('editRestaurantId');
        if (editRestaurantId) {
            setTimeout(() => {
                editRestaurant(editRestaurantId);
                localStorage.removeItem('editRestaurantId');
            }, 1000);
        }
        
        // Load both restaurants and bookings
        await Promise.all([
  loadOwnerRestaurants(user.uid),
  loadRestaurantBookings(user.uid)
]);

        isLoading = false;
        
    } catch (error) {
        console.error("Auth check failed:", error);
        isLoading = false;
        showError("Authentication error. Please login again.");
    }
});

function loadOwnerRestaurants() {
    return new Promise((resolve, reject) => {
        console.log("Loading owner's restaurants...");
        const container = document.getElementById("restaurants-container");
        
        // Show loading
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading your restaurants...</div>';
        
        // Try without orderBy first to avoid index issues
        const q = query(
            collection(db, "restaurants"),
            where("ownerId", "==", auth.currentUser.uid)
        );
        
        onSnapshot(q, 
            (snapshot) => {
                console.log("Restaurants snapshot received:", snapshot.size);
                restaurantsData = [];
                
                if (snapshot.empty) {
                    container.innerHTML = `
                        <div class="no-restaurants">
                            <i class="fas fa-store-slash"></i>
                            <h3>No Restaurants Yet</h3>
                            <p>Add your first restaurant to start accepting bookings</p>
                            <button onclick="openAddModal()" style="margin-top: 20px;">
                                <i class="fas fa-plus-circle"></i> Add Your First Restaurant
                            </button>
                        </div>
                    `;
                    updateStats();
                    resolve();
                    return;
                }
                
                snapshot.forEach(doc => {
                    const restaurant = {
                        id: doc.id,
                        ...doc.data()
                    };
                    restaurantsData.push(restaurant);
                });
                
                // Sort by createdAt manually (newest first)
                restaurantsData.sort((a, b) => {
                    const dateA = a.createdAt ? (a.createdAt.seconds || a.createdAt) : 0;
                    const dateB = b.createdAt ? (b.createdAt.seconds || b.createdAt) : 0;
                    return dateB - dateA;
                });
                
                // Check if bookings data is loaded before displaying
                    displayRestaurants(restaurantsData);
                    updateStats();
                    resolve();
            },
            (error) => {
                console.error("Error in restaurants listener:", error);
                container.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        Failed to load restaurants. Please try again.
                        <p style="font-size: 14px; margin-top: 10px;">Error: ${error.message}</p>
                        <button onclick="retryLoadRestaurants()" style="margin-top: 15px;">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
                reject(error);
            }
        );
    });
}
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
function loadRestaurantBookings() {
    return new Promise((resolve, reject) => {
        console.log("Loading restaurant bookings...");
        
        const q = query(
            collection(db, "bookings"),
            where("ownerId", "==", auth.currentUser.uid)
        );
        
        onSnapshot(q, 
            (snapshot) => {
                console.log("Bookings snapshot received:", snapshot.size);
                bookingsData = [];
                snapshot.forEach(doc => {
                    const booking = {
                        id: doc.id,
                        ...doc.data()
                    };
                    bookingsData.push(booking);
                });
                
                // Update display and stats if restaurants are already loaded
                if (restaurantsData.length > 0 && !isLoading) {
                    displayRestaurants(restaurantsData);
                    updateStats();
                }
                resolve();
            },
            (error) => {
                console.error("Error in bookings listener:", error);
                // Don't show error for bookings as it's secondary data
                // But still resolve so the UI shows restaurants without booking counts
                resolve();
            }
        );
    });
}

function displayRestaurants(restaurants) {
    const container = document.getElementById("restaurants-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    if (!restaurants || restaurants.length === 0) {
        container.innerHTML = `
            <div class="no-restaurants">
                <i class="fas fa-store-slash"></i>
                <h3>No Restaurants Yet</h3>
                <p>Add your first restaurant to start accepting bookings</p>
                <button onclick="openAddModal()" style="margin-top: 20px;">
                    <i class="fas fa-plus-circle"></i> Add Your First Restaurant
                </button>
            </div>
        `;
        return;
    }
    
    restaurants.forEach(restaurant => {
        // Count bookings for this restaurant
        let confirmedBookings = 0;
        let pendingBookings = 0;
        let cancelledBookings = 0;
        
        if (bookingsData && bookingsData.length > 0) {
            const restaurantBookings = bookingsData.filter(b => b.restaurantId === restaurant.id);
            confirmedBookings = restaurantBookings.filter(b => b.status === "CONFIRMED").length;
            pendingBookings = restaurantBookings.filter(b => b.status === "PENDING").length;
            cancelledBookings = restaurantBookings.filter(b => b.status === "CANCELLED").length;
        }
        
        // Format creation date
        let createdAt = "Recently";
        if (restaurant.createdAt) {
            try {
                const date = restaurant.createdAt.toDate ? restaurant.createdAt.toDate() : new Date(restaurant.createdAt);
                createdAt = date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                });
            } catch (e) {
                console.log("Error parsing date:", e);
            }
        }
        
        const card = document.createElement("div");
        card.className = "restaurant-card";
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h3 style="margin: 0; color: #2d3436;">${restaurant.name || "Unnamed Restaurant"}</h3>
                    <p style="margin: 5px 0; color: #636e72; font-size: 14px;">
                        <i class="fas fa-calendar-plus"></i> Added ${createdAt}
                    </p>
                </div>
                <div style="text-align: right;">
                    <span style="display: inline-block; padding: 4px 12px; background: #dfe6e9; border-radius: 15px; font-size: 14px;">
                        <i class="fas fa-users"></i> ${restaurant.capacity || 50}
                    </span>
                </div>
            </div>
            
            <div class="restaurant-details">
                <div class="detail-row">
                    <i class="fas fa-align-left"></i>
                    <span>${restaurant.description || "No description provided"}</span>
                </div>
                
                ${restaurant.cuisine ? `
                <div class="detail-row">
                    <i class="fas fa-utensil-spoon"></i>
                    <span>Cuisine: ${restaurant.cuisine}</span>
                </div>
                ` : ''}
                
                ${restaurant.address ? `
                <div class="detail-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${restaurant.address}</span>
                </div>
                ` : ''}
                
                ${restaurant.phone ? `
                <div class="detail-row">
                    <i class="fas fa-phone"></i>
                    <span>${restaurant.phone}</span>
                </div>
                ` : ''}
                
                <div class="detail-row">
                    <i class="fas fa-clock"></i>
                    <span>${restaurant.slots?.length || 0} time slots available</span>
                </div>
                
                <div class="detail-row">
                    <i class="fas fa-calendar-check"></i>
                    <span>
                        <span style="color: #00b894;"><strong>${confirmedBookings}</strong> confirmed</span> • 
                        <span style="color: #fdcb6e;"><strong>${pendingBookings}</strong> pending</span> • 
                        <span style="color: #d63031;"><strong>${cancelledBookings}</strong> cancelled</span>
                    </span>
                </div>
            </div>
            
            <div class="restaurant-actions">
                <button onclick="editRestaurant('${restaurant.id}')" class="edit-btn">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button onclick="viewBookings('${restaurant.id}')" class="view-btn">
                    <i class="fas fa-calendar-alt"></i> View Bookings
                </button>
                <button onclick="openDeleteModal('${restaurant.id}', '${restaurant.name}')" class="delete-btn">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function updateStats() {
    const statsContainer = document.getElementById("stats-container");
    if (!statsContainer) return;
    
    // Calculate stats
    const totalRestaurants = restaurantsData.length;
    const totalBookings = bookingsData.length;
    const pendingBookings = bookingsData.filter(b => b.status === "PENDING").length;
    const confirmedBookings = bookingsData.filter(b => b.status === "CONFIRMED").length;
    const cancelledBookings = bookingsData.filter(b => b.status === "CANCELLED").length;
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <i class="fas fa-store"></i>
            <h3>${totalRestaurants}</h3>
            <p>Restaurants</p>
        </div>
        
        <div class="stat-card">
            <i class="fas fa-calendar-alt"></i>
            <h3>${totalBookings}</h3>
            <p>Total Bookings</p>
        </div>
        
        <div class="stat-card">
            <i class="fas fa-clock"></i>
            <h3>${pendingBookings}</h3>
            <p>Pending</p>
        </div>
        
        <div class="stat-card">
            <i class="fas fa-check-circle"></i>
            <h3>${confirmedBookings}</h3>
            <p>Confirmed</p>
        </div>
        
        <div class="stat-card">
            <i class="fas fa-times-circle"></i>
            <h3>${cancelledBookings}</h3>
            <p>Cancelled</p>
        </div>
    `;
}

window.openAddModal = function() {
    console.log("Opening add restaurant modal");
    currentRestaurantId = null;
    document.getElementById('modal-title').textContent = 'Add New Restaurant';
    document.getElementById('save-btn').innerHTML = '<i class="fas fa-save"></i> Save Restaurant';
    
    // Clear form
    document.getElementById('restaurant-name').value = '';
    document.getElementById('restaurant-desc').value = '';
    document.getElementById('restaurant-address').value = '';
    document.getElementById('restaurant-phone').value = '';
    document.getElementById('restaurant-email').value = '';
    document.getElementById('restaurant-slots').value = '18:00-19:30\n19:30-21:00\n21:00-22:30';
    document.getElementById('restaurant-capacity').value = '30';
    document.getElementById('restaurant-cuisine').value = '';
    document.getElementById('restaurant-price').value = '$$';
    
    document.getElementById('restaurant-modal').classList.remove('hidden');
};

window.editRestaurant = async function(restaurantId) {
    console.log("Editing restaurant:", restaurantId);
    
    try {
        const docRef = doc(db, "restaurants", restaurantId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const restaurant = docSnap.data();
            currentRestaurantId = restaurantId;
            
            document.getElementById('modal-title').textContent = 'Edit Restaurant';
            document.getElementById('save-btn').innerHTML = '<i class="fas fa-save"></i> Update Restaurant';
            
            // Fill form with existing data
            document.getElementById('restaurant-name').value = restaurant.name || '';
            document.getElementById('restaurant-desc').value = restaurant.description || '';
            document.getElementById('restaurant-address').value = restaurant.address || '';
            document.getElementById('restaurant-phone').value = restaurant.phone || '';
            document.getElementById('restaurant-email').value = restaurant.email || '';
            document.getElementById('restaurant-slots').value = restaurant.slots?.join('\n') || '';
            document.getElementById('restaurant-capacity').value = restaurant.capacity || 30;
            document.getElementById('restaurant-cuisine').value = restaurant.cuisine || '';
            document.getElementById('restaurant-price').value = restaurant.priceRange || '$$';
            
            document.getElementById('restaurant-modal').classList.remove('hidden');
        } else {
            alert("Restaurant not found!");
        }
    } catch (error) {
        console.error("Error loading restaurant:", error);
        alert("Failed to load restaurant details. Please try again.");
    }
};

window.saveRestaurant = async function() {
    const name = document.getElementById('restaurant-name').value.trim();
    const description = document.getElementById('restaurant-desc').value.trim();
    const address = document.getElementById('restaurant-address').value.trim();
    const phone = document.getElementById('restaurant-phone').value.trim();
    const email = document.getElementById('restaurant-email').value.trim();
    const slotsText = document.getElementById('restaurant-slots').value.trim();
    const capacity = parseInt(document.getElementById('restaurant-capacity').value);
    const cuisine = document.getElementById('restaurant-cuisine').value.trim();
    const priceRange = document.getElementById('restaurant-price').value;
    
    if (!name) {
        alert("Please enter a restaurant name");
        return;
    }
    
    if (isNaN(capacity) || capacity < 1) {
        alert("Please enter a valid capacity (minimum 1)");
        return;
    }
    
    // Parse slots
    const slots = slotsText ? slotsText.split('\n')
        .map(slot => slot.trim())
        .filter(slot => slot.length > 0) : [
            "18:00-19:30",
            "19:30-21:00", 
            "21:00-22:30"
        ];
    
    const restaurantData = {
        name,
        description: description || "No description provided",
        address: address || "",
        phone: phone || "",
        email: email || "",
        slots,
        capacity,
        cuisine: cuisine || "",
        priceRange,
        ownerId: auth.currentUser.uid,
        ownerEmail: auth.currentUser.email,
        updatedAt: serverTimestamp()
    };
    
    // Try to geocode address if provided
    if (address) {
        try {
            const coords = await geocodeAddress(address);
            if (coords) {
                restaurantData.latitude = coords.lat;
                restaurantData.longitude = coords.lng;
                restaurantData.hasLocation = true;
            } else {
                alert(
                    "⚠️ Could not find coordinates for this address.\n" +
                    "Location-based features may not work."
                );
            }
        } catch (err) {
            console.warn("Geocoding failed:", err);
            alert(
                "⚠️ Could not find coordinates for this address.\n" +
                "Location-based features may not work."
            );
        }
    }
    
    try {
        const btn = document.getElementById('save-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        if (currentRestaurantId) {
            await updateDoc(doc(db, "restaurants", currentRestaurantId), restaurantData);
            alert("✅ Restaurant updated successfully!");
        } else {
            restaurantData.createdAt = serverTimestamp();
            await addDoc(collection(db, "restaurants"), restaurantData);
            alert("✅ Restaurant added successfully!");
        }
        
        closeModal();
    } catch (error) {
        console.error("Error saving restaurant:", error);
        alert("Failed to save restaurant. Please try again.\n\nError: " + error.message);
    } finally {
        const btn = document.getElementById('save-btn');
        btn.innerHTML = currentRestaurantId ? '<i class="fas fa-save"></i> Update Restaurant' : '<i class="fas fa-save"></i> Save Restaurant';
        btn.disabled = false;
    }
};
window.getCurrentLocation = function() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            document.getElementById('restaurant-latitude').value = position.coords.latitude;
            document.getElementById('restaurant-longitude').value = position.coords.longitude;
            
            // Reverse geocode to get address
            reverseGeocode(position.coords.latitude, position.coords.longitude)
                .then(address => {
                    if (address) {
                        document.getElementById('restaurant-address').value = address;
                    }
                });
            
            alert("Location obtained successfully!");
        },
        (error) => {
            alert("Unable to retrieve your location. Please enter address manually.");
            console.error("Geolocation error:", error);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
};

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        );
        const data = await response.json();
        
        if (data && data.display_name) {
            return data.display_name;
        }
        return null;
    } catch (error) {
        console.error("Reverse geocoding error:", error);
        return null;
    }
}


window.openDeleteModal = function(restaurantId, restaurantName) {
    console.log("Opening delete modal for:", restaurantName);
    currentRestaurantId = restaurantId;
    document.getElementById('delete-message').textContent = 
        `Are you sure you want to delete "${restaurantName}"?`;
    document.getElementById('delete-modal').classList.remove('hidden');
};

window.confirmDelete = async function() {
    if (!currentRestaurantId) return;
    
    if (!confirm("Are you absolutely sure? This will cancel all bookings for this restaurant!")) {
        return;
    }
    
    try {
        // Get restaurant name for feedback
        const restaurantDoc = await getDoc(doc(db, "restaurants", currentRestaurantId));
        const restaurantName = restaurantDoc.exists() ? restaurantDoc.data().name : "this restaurant";
        
        // Delete restaurant
        await deleteDoc(doc(db, "restaurants", currentRestaurantId));
        
        // Cancel all bookings for this restaurant
        const bookingsQuery = query(
            collection(db, "bookings"),
            where("restaurantId", "==", currentRestaurantId)
        );
        
        const bookingsSnapshot = await getDocs(bookingsQuery);
        const updatePromises = [];
        
        bookingsSnapshot.forEach(bookingDoc => {
            updatePromises.push(
                updateDoc(doc(db, "bookings", bookingDoc.id), {
                    status: "CANCELLED",
                    cancelReason: "Restaurant deleted by owner",
                    cancelledAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })
            );
        });
        
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        
        closeDeleteModal();
        alert(`✅ Restaurant "${restaurantName}" deleted successfully!\n\n${updatePromises.length} booking(s) were cancelled.`);
        
    } catch (error) {
        console.error("Error deleting restaurant:", error);
        alert("Failed to delete restaurant. Please try again.");
    }
};

window.viewBookings = function(restaurantId) {
    console.log("Viewing bookings for restaurant:", restaurantId);
    // Redirect to owner.html with restaurant filter
    localStorage.setItem('selectedRestaurant', restaurantId);
    window.location.href = 'owner.html';
};

window.closeModal = function() {
    document.getElementById('restaurant-modal').classList.add('hidden');
    currentRestaurantId = null;
};

window.closeDeleteModal = function() {
    document.getElementById('delete-modal').classList.add('hidden');
    currentRestaurantId = null;
};

window.retryLoadRestaurants = function() {
    console.log("Retrying to load restaurants...");
    loadOwnerRestaurants();
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
    const container = document.getElementById("restaurants-container");
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                ${message}
                <button onclick="location.reload()" style="margin-top: 15px;">
                    <i class="fas fa-redo"></i> Refresh Page
                </button>
            </div>
        `;
    }
}