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
let unsubscribeRestaurants = null;
let unsubscribeBookings = null;

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
        
        // Add theme styles
        addOwnerThemeStyles();
        
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
        
        // Clean up previous listener
        if (unsubscribeRestaurants) {
            unsubscribeRestaurants();
        }
        
        const q = query(
            collection(db, "restaurants"),
            where("ownerId", "==", auth.currentUser.uid)
        );
        
        unsubscribeRestaurants = onSnapshot(q, 
            (snapshot) => {
                console.log("Restaurants snapshot received:", snapshot.size);
                restaurantsData = [];
                
                if (snapshot.empty) {
                    container.innerHTML = `
                        <div class="no-restaurants">
                            <i class="fas fa-store-slash"></i>
                            <h3>No Restaurants Yet</h3>
                            <p>Add your first restaurant to start accepting bookings</p>
                            <button onclick="openAddModal()" class="add-first-btn">
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
                        <div>
                            <h3>Failed to Load Restaurants</h3>
                            <p>Please check your internet connection and try again.</p>
                            <p class="small">Error: ${error.message}</p>
                        </div>
                        <button onclick="retryLoadRestaurants()" class="retry-btn">
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
        
        // Clean up previous listener
        if (unsubscribeBookings) {
            unsubscribeBookings();
        }
        
        const q = query(
            collection(db, "bookings"),
            where("ownerId", "==", auth.currentUser.uid)
        );
        
        unsubscribeBookings = onSnapshot(q, 
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
                <button onclick="openAddModal()" class="add-first-btn">
                    <i class="fas fa-plus-circle"></i> Add Your First Restaurant
                </button>
            </div>
        `;
        return;
    }
    
    restaurants.forEach((restaurant, index) => {
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
        card.style.setProperty('--delay', `${0.1 + (index * 0.1)}s`);
        card.innerHTML = `
            <div class="restaurant-header">
                <div class="restaurant-info">
                    <h3>${restaurant.name || "Unnamed Restaurant"}</h3>
                    <p class="restaurant-added">
                        <i class="fas fa-calendar-plus"></i> Added ${createdAt}
                    </p>
                </div>
                <div class="capacity-badge">
                    <i class="fas fa-users"></i> ${restaurant.capacity || 50}
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
                    <span class="booking-stats">
                        <span class="confirmed-count">${confirmedBookings}</span> confirmed • 
                        <span class="pending-count">${pendingBookings}</span> pending • 
                        <span class="cancelled-count">${cancelledBookings}</span> cancelled
                    </span>
                </div>
            </div>
        `;
        
        // Add action buttons
        const actions = document.createElement("div");
        actions.className = "restaurant-actions";
        actions.innerHTML = `
            <button onclick="editRestaurant('${restaurant.id}')" class="edit-btn">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button onclick="viewBookings('${restaurant.id}')" class="view-btn">
                <i class="fas fa-calendar-alt"></i> View Bookings
            </button>
            <button onclick="openDeleteModal('${restaurant.id}', '${restaurant.name}')" class="delete-btn">
                <i class="fas fa-trash"></i> Delete
            </button>
        `;
        card.appendChild(actions);
        
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
        <div class="stat-card" style="--delay: 0.1s;">
            <i class="fas fa-store"></i>
            <h3>${totalRestaurants}</h3>
            <p>Restaurants</p>
        </div>
        
        <div class="stat-card" style="--delay: 0.2s;">
            <i class="fas fa-calendar-alt"></i>
            <h3>${totalBookings}</h3>
            <p>Total Bookings</p>
        </div>
        
        <div class="stat-card" style="--delay: 0.3s;">
            <i class="fas fa-clock"></i>
            <h3>${pendingBookings}</h3>
            <p>Pending</p>
        </div>
        
        <div class="stat-card" style="--delay: 0.4s;">
            <i class="fas fa-check-circle"></i>
            <h3>${confirmedBookings}</h3>
            <p>Confirmed</p>
        </div>
        
        <div class="stat-card" style="--delay: 0.5s;">
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
    document.getElementById('save-btn').className = 'save-btn';
    
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
            showToast("Restaurant not found!", "error");
        }
    } catch (error) {
        console.error("Error loading restaurant:", error);
        showToast("Failed to load restaurant details. Please try again.", "error");
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
        showToast("Please enter a restaurant name", "error");
        return;
    }
    
    if (isNaN(capacity) || capacity < 1) {
        showToast("Please enter a valid capacity (minimum 1)", "error");
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
                showToast("Could not find coordinates for this address. Location-based features may not work.", "warning");
            }
        } catch (err) {
            console.warn("Geocoding failed:", err);
            showToast("Could not find coordinates for this address. Location-based features may not work.", "warning");
        }
    }
    
    try {
        const btn = document.getElementById('save-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        if (currentRestaurantId) {
            await updateDoc(doc(db, "restaurants", currentRestaurantId), restaurantData);
            showToast("Restaurant updated successfully!", "success");
        } else {
            restaurantData.createdAt = serverTimestamp();
            await addDoc(collection(db, "restaurants"), restaurantData);
            showToast("Restaurant added successfully!", "success");
        }
        
        closeModal();
    } catch (error) {
        console.error("Error saving restaurant:", error);
        showToast(`Failed to save restaurant: ${error.message}`, "error");
    } finally {
        const btn = document.getElementById('save-btn');
        btn.innerHTML = currentRestaurantId ? '<i class="fas fa-save"></i> Update Restaurant' : '<i class="fas fa-save"></i> Save Restaurant';
        btn.disabled = false;
    }
};

window.getCurrentLocation = function() {
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser", "error");
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
            
            showToast("Location obtained successfully!", "success");
        },
        (error) => {
            showToast("Unable to retrieve your location. Please enter address manually.", "error");
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
        
        const deleteBtn = document.querySelector('#delete-modal .delete-btn');
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        deleteBtn.disabled = true;
        
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
        showToast(`Restaurant "${restaurantName}" deleted successfully! ${updatePromises.length} booking(s) were cancelled.`, "success");
        
    } catch (error) {
        console.error("Error deleting restaurant:", error);
        showToast("Failed to delete restaurant. Please try again.", "error");
    } finally {
        const deleteBtn = document.querySelector('#delete-modal .delete-btn');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Restaurant';
        deleteBtn.disabled = false;
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
        // Clean up listeners
        if (unsubscribeRestaurants) {
            unsubscribeRestaurants();
        }
        if (unsubscribeBookings) {
            unsubscribeBookings();
        }
        
        await auth.signOut();
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Logout failed. Please try again.", "error");
    }
};

// Helper function to show errors
function showError(message) {
    const container = document.getElementById("restaurants-container");
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <div>
                    <h3>Error</h3>
                    <p>${message}</p>
                </div>
                <button onclick="location.reload()" class="refresh-btn">
                    <i class="fas fa-redo"></i> Refresh Page
                </button>
            </div>
        `;
    }
}

function showToast(message, type = "success") {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle'}"></i>
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

function addOwnerThemeStyles() {
    if (!document.querySelector('#owner-theme-styles')) {
        const style = document.createElement('style');
        style.id = 'owner-theme-styles';
        style.textContent = `
            /* Restaurant card styles */
            .restaurant-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 1rem;
            }
            
            .restaurant-info {
                flex: 1;
            }
            
            .restaurant-info h3 {
                margin: 0 0 0.5rem 0;
                color: var(--text-primary, #2d3436);
                font-size: 1.1rem;
                font-weight: 700;
                letter-spacing: -0.01em;
            }
            
            .restaurant-added {
                margin: 0;
                color: var(--text-secondary, #636e72);
                font-size: 0.85rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .restaurant-added i {
                color: var(--accent-color, #e17055);
            }
            
            .capacity-badge {
                display: inline-block;
                padding: 0.4rem 1rem;
                background: var(--card-bg-light, rgba(248, 249, 250, 0.8));
                border-radius: 15px;
                font-size: 0.85rem;
                color: var(--text-secondary, #636e72);
                border: 1px solid var(--border-color, rgba(223, 230, 233, 0.3));
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            }
            
            .restaurant-details {
                background: var(--card-bg-light, rgba(248, 249, 250, 0.8));
                padding: 1.25rem;
                border-radius: 16px;
                margin-bottom: 1rem;
                border: 1px solid var(--border-color, rgba(223, 230, 233, 0.3));
            }
            
            .detail-row {
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
                margin-bottom: 0.75rem;
                color: var(--text-secondary, #636e72);
                font-size: 0.9rem;
            }
            
            .detail-row:last-child {
                margin-bottom: 0;
            }
            
            .detail-row i {
                color: var(--accent-color, #e17055);
                font-size: 0.9rem;
                margin-top: 0.1rem;
                min-width: 16px;
            }
            
            .booking-stats {
                font-weight: 500;
            }
            
            .confirmed-count {
                color: var(--success-color, #00b894);
                font-weight: 700;
            }
            
            .pending-count {
                color: var(--warning-color, #fdcb6e);
                font-weight: 700;
            }
            
            .cancelled-count {
                color: var(--error-color, #d63031);
                font-weight: 700;
            }
            
            /* Action buttons */
            .restaurant-actions {
                display: block;
                margin-top: 16px;
            }
            
            .restaurant-actions button {
                display: block;
                width: 100%;
                margin-bottom: 14px;
            }
            
            .restaurant-actions button:last-child {
                margin-bottom: 0;
            }
            
            .edit-btn {
                background: linear-gradient(to right, var(--accent-color, #e17055), var(--accent-dark, #d63031));
            }
            
            .view-btn {
                background: linear-gradient(to right, var(--primary-color, #0984e3), var(--primary-dark, #6c5ce7));
            }
            
            .delete-btn {
                background: linear-gradient(to right, var(--error-dark, #d63031), var(--error-color, #e17055));
            }
            
            .save-btn {
                background: linear-gradient(to right, var(--success-color, #00b894), var(--success-dark, #00a085));
            }
            
            
            /* Empty states */
            .no-restaurants {
                text-align: center;
                padding: 3rem 1rem;
                animation: fadeSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .no-restaurants i {
                font-size: 3rem;
                color: var(--icon-color, rgba(223, 230, 233, 0.5));
                margin-bottom: 1rem;
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .no-restaurants h3 {
                color: var(--text-secondary, #636e72);
                margin-bottom: 0.75rem;
                font-weight: 600;
            }
            
            .no-restaurants p {
                color: var(--text-light, #b2bec3);
                margin-bottom: 1.5rem;
                max-width: 300px;
                margin-left: auto;
                margin-right: auto;
            }
            
            .add-first-btn {
                background: linear-gradient(to right, var(--accent-color, #e17055), var(--accent-dark, #d63031));
                width: auto;
                display: inline-block;
            }
            
            /* Utility buttons */
            .retry-btn, .refresh-btn {
                margin-top: 1rem;
            }
            
            /* Toast */
            .toast-warning {
                background: var(--warning-bg, rgba(255, 243, 205, 0.95));
                color: var(--warning-color-dark, #856404);
                border-color: var(--warning-border, rgba(255, 238, 186, 0.5));
            }
            
            /* Dark mode variables */
            @media (prefers-color-scheme: dark) {
                :root {
                    --text-primary: #ffffff;
                    --text-secondary: rgba(255, 255, 255, 0.7);
                    --text-light: rgba(255, 255, 255, 0.5);
                    --accent-color: #e17055;
                    --accent-dark: #d63031;
                    --primary-color: #0984e3;
                    --primary-dark: #6c5ce7;
                    --card-bg-light: rgba(40, 40, 40, 0.8);
                    --border-color: rgba(255, 255, 255, 0.1);
                    --icon-color: rgba(255, 255, 255, 0.1);
                    --error-color: #e17055;
                    --error-dark: #d63031;
                    --success-color: #00b894;
                    --success-dark: #00a085;
                    --warning-color: #fdcb6e;
                    --warning-color-dark: #f39c12;
                    --warning-bg: rgba(255, 243, 205, 0.2);
                    --warning-border: rgba(255, 238, 186, 0.3);
                }
                
                .restaurant-details {
                    background: rgba(40, 40, 40, 0.6);
                }
                
                .capacity-badge {
                    background: rgba(50, 50, 50, 0.8);
                }
                
                .no-restaurants i {
                    background: linear-gradient(135deg, #2d3436 0%, #1a1a1a 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                
                .confirmed-count {
                    color: var(--success-color, #00b894);
                }
                
                .pending-count {
                    color: var(--warning-color, #fdcb6e);
                }
                
                .cancelled-count {
                    color: var(--error-color, #e17055);
                }
            }
            
            /* Responsive */
            @media (min-width: 768px) {
                .restaurant-actions {
                    display: flex;
                    gap: 12px;
                }
                
                .restaurant-actions button {
                    margin-bottom: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
