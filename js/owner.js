import {
    addDoc, collection, getDocs, query, where,
    doc, getDoc, updateDoc, deleteDoc, onSnapshot,
    orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let selectedRestaurantId = null;

// Check authentication
auth.onAuthStateChanged(async (user) => {
    console.log("Owner Dashboard: Auth state changed. User:", user);
    
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
        
        // Check for selected restaurant from localStorage
        selectedRestaurantId = localStorage.getItem('selectedRestaurant');
        if (selectedRestaurantId) {
            const bookingsContainer = document.getElementById('bookings-container');
            if (bookingsContainer) {
                bookingsContainer.innerHTML = 
                    '<h3>Restaurant Bookings</h3><p style="color: #636e72;">Showing bookings for selected restaurant</p><div id="bookings"></div>';
            }
            // Clear after using
            setTimeout(() => {
                localStorage.removeItem('selectedRestaurant');
            }, 100);
        }
        
        loadMyRestaurants();
        loadBookings();
    } catch (error) {
        console.error("Auth check failed:", error);
        showError("Authentication error. Please login again.");
    }
});


async function loadMyRestaurants() {
    try {
        console.log("Loading owner's restaurants...");
        const container = document.getElementById("restaurants-list");
        
        // Show loading
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading restaurants...</div>';
        
        // Try a simpler query first - just get all restaurants for this owner
        const q = query(
            collection(db, "restaurants"),
            where("ownerId", "==", auth.currentUser.uid)
            // Removed orderBy temporarily to avoid index issues
        );
        
        const snapshot = await getDocs(q);
        console.log("Found restaurants:", snapshot.size);
        
        container.innerHTML = "";
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #636e72;">
                    <i class="fas fa-store-slash" style="font-size: 48px; color: #dfe6e9; margin-bottom: 15px;"></i>
                    <p>No restaurants added yet.</p>
                    <p style="font-size: 14px; color: #b2bec3;">Add your first restaurant to start accepting bookings</p>
                </div>
            `;
            return;
        }
        
        // Convert to array and sort manually
        const restaurants = [];
        snapshot.forEach(doc => {
            const restaurant = {
                id: doc.id,
                ...doc.data()
            };
            restaurants.push(restaurant);
        });
        
        // Sort by creation date (newest first)
        restaurants.sort((a, b) => {
            const dateA = a.createdAt ? (a.createdAt.seconds || a.createdAt) : 0;
            const dateB = b.createdAt ? (b.createdAt.seconds || b.createdAt) : 0;
            return dateB - dateA;
        });
        
        // Display restaurants
        restaurants.forEach(restaurant => {
            const card = document.createElement("div");
            card.className = "restaurant-card";
            card.innerHTML = `
                <h3>${restaurant.name}</h3>
                <p>${restaurant.description}</p>
                <div style="display: flex; justify-content: space-between; margin-top: 15px;">
                    <span><i class="fas fa-calendar"></i> ${restaurant.slots?.length || 0} slots</span>
                    <span><i class="fas fa-users"></i> Capacity: ${restaurant.capacity || 50}</span>
                </div>
                <div class="restaurant-actions">
    <div class="action-item">
        <button onclick="editRestaurantOwner('${restaurant.id}')" class="edit-btn">
            <i class="fas fa-edit"></i> Edit
        </button>
    </div>

    <div class="action-item">
        <button onclick="deleteRestaurantOwner('${restaurant.id}')" class="delete-btn">
            <i class="fas fa-trash"></i> Delete
        </button>
    </div>
</div>

            `;
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error("Error loading restaurants:", error);
        
        const container = document.getElementById("restaurants-list");
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
    }
}

async function loadBookings() {
    try {
        console.log("Loading bookings for owner:", auth.currentUser.uid);
        const container = document.getElementById("bookings");
        
        // Show loading
        if (container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading bookings...</div>';
        }
        
        // Build query
        let q;
        if (selectedRestaurantId) {
            q = query(
                collection(db, "bookings"),
                where("ownerId", "==", auth.currentUser.uid),
                where("restaurantId", "==", selectedRestaurantId)
            );
        } else {
            q = query(
                collection(db, "bookings"),
                where("ownerId", "==", auth.currentUser.uid)
            );
        }
        
        // Set up real-time listener
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                console.log("Bookings snapshot received:", snapshot.size);
                
                if (!container) return;
                
                container.innerHTML = "";
                
                if (snapshot.empty) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 30px; color: #636e72;">
                            <i class="fas fa-calendar-times" style="font-size: 48px; color: #dfe6e9; margin-bottom: 15px;"></i>
                            <p>No bookings yet.</p>
                            <p style="font-size: 14px; color: #b2bec3;">Bookings will appear here when customers make reservations</p>
                        </div>
                    `;
                    return;
                }
                
                // Convert to array for sorting
                const bookings = [];
                snapshot.forEach(doc => {
                    const booking = {
                        id: doc.id,
                        ...doc.data()
                    };
                    bookings.push(booking);
                });
                
                // Sort by creation date (newest first)
                bookings.sort((a, b) => {
                    const dateA = a.createdAt ? (a.createdAt.seconds || a.createdAt) : 0;
                    const dateB = b.createdAt ? (b.createdAt.seconds || b.createdAt) : 0;
                    return dateB - dateA;
                });
                
                // Display bookings
                bookings.forEach(booking => {
                    const card = document.createElement("div");
                    card.className = "booking-card";
                    
                    // Format date for display
                    const bookingDate = booking.date || "Not specified";
                    const bookingTime = booking.time || "Not specified";
                    
                    card.innerHTML = `
                        <h4>${booking.restaurantName || "Unknown Restaurant"}</h4>
                        <p><i class="fas fa-calendar-day"></i> ${bookingDate} | ${bookingTime}</p>
                        <p><i class="fas fa-user-friends"></i> ${booking.guests || 2} guests</p>
                        <p><i class="fas fa-user"></i> ${booking.userEmail || "Unknown user"}</p>
                        
                        ${booking.specialRequests ? `
                            <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                                <p style="margin: 0; color: #2d3436; font-size: 14px;">
                                    <i class="fas fa-sticky-note"></i> ${booking.specialRequests}
                                </p>
                            </div>
                        ` : ''}
                        
                        <p>
                            Status: 
                            <span class="booking-status status-${booking.status?.toLowerCase() || 'pending'}">
                                ${booking.status || "PENDING"}
                            </span>
                        </p>
                        
                        ${booking.status === "PENDING" ? `
                            <div style="margin-top: 15px; display: flex; gap: 10px;">
                                <button onclick="updateBookingStatus('${booking.id}', 'CONFIRMED')" class="confirm-btn">
                                    <i class="fas fa-check"></i> Confirm
                                </button>
                                <button onclick="updateBookingStatus('${booking.id}', 'CANCELLED')" class="cancel-btn">
                                    <i class="fas fa-times"></i> Decline
                                </button>
                            </div>
                        ` : ''}
                        
                        ${booking.status === "CONFIRMED" ? `
                            <div style="margin-top: 15px;">
                                <button onclick="updateBookingStatus('${booking.id}', 'CANCELLED')" class="cancel-btn">
                                    <i class="fas fa-times"></i> Cancel Booking
                                </button>
                            </div>
                        ` : ''}
                    `;
                    
                    container.appendChild(card);
                });
            },
            (error) => {
                console.error("Error in bookings listener:", error);
                
                if (container) {
                    container.innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            Failed to load bookings. Please try again.
                            <p style="font-size: 14px; margin-top: 10px;">Error: ${error.message}</p>
                            <button onclick="retryLoadBookings()" style="margin-top: 15px;">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </div>
                    `;
                }
            }
        );
        
        // Store unsubscribe function
        window.unsubscribeBookings = unsubscribe;
        
    } catch (error) {
        console.error("Error setting up bookings listener:", error);
        
        const container = document.getElementById("bookings");
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    Failed to load bookings. Please refresh the page.
                </div>
            `;
        }
    }
}

window.updateBookingStatus = async (bookingId, status) => {
    if (!confirm(`Are you sure you want to ${status.toLowerCase()} this booking?`)) {
        return;
    }
    
    try {
        console.log(`Updating booking ${bookingId} to ${status}`);
        
        await updateDoc(doc(db, "bookings", bookingId), {
            status: status,
            updatedAt: serverTimestamp()
        });
        
        alert(`✅ Booking ${status.toLowerCase()} successfully!`);
    } catch (error) {
        console.error("Error updating booking:", error);
        alert("Failed to update booking. Please try again.");
    }
};

window.deleteRestaurantOwner = async (restaurantId) => {
    if (!confirm("Are you sure you want to delete this restaurant? All bookings will be cancelled.")) {
        return;
    }
    
    try {
        console.log("Deleting restaurant:", restaurantId);
        
        // First, get restaurant name for feedback
        const restaurantDoc = await getDoc(doc(db, "restaurants", restaurantId));
        const restaurantName = restaurantDoc.exists() ? restaurantDoc.data().name : "this restaurant";
        
        // Delete restaurant
        await deleteDoc(doc(db, "restaurants", restaurantId));
        
        // Cancel all bookings for this restaurant
        const bookingsQuery = query(
            collection(db, "bookings"),
            where("restaurantId", "==", restaurantId)
        );
        
        const bookingsSnapshot = await getDocs(bookingsQuery);
        const updatePromises = [];
        
        bookingsSnapshot.forEach(bookingDoc => {
            updatePromises.push(
                updateDoc(doc(db, "bookings", bookingDoc.id), {
                    status: "CANCELLED",
                    cancelReason: "Restaurant deleted by owner",
                    updatedAt: serverTimestamp()
                })
            );
        });
        
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        
        alert(`✅ Restaurant "${restaurantName}" deleted successfully!`);
        loadMyRestaurants();
        
    } catch (error) {
        console.error("Error deleting restaurant:", error);
        alert("Failed to delete restaurant. Please try again.");
    }
};

window.editRestaurantOwner = function(restaurantId) {
    // Redirect to owner-restaurants.html for editing
    window.location.href = "owner-restaurants.html";
    
    // Store the restaurant ID to edit
    localStorage.setItem('editRestaurantId', restaurantId);
};

// Helper functions
window.retryLoadRestaurants = function() {
    console.log("Retrying to load restaurants...");
    loadMyRestaurants();
};

window.retryLoadBookings = function() {
    console.log("Retrying to load bookings...");
    loadBookings();
};

function showError(message) {
    const container = document.querySelector(".container") || document.body;
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        ${message}
    `;
    container.prepend(errorDiv);
}

window.logout = async () => {
    try {
        // Clean up listeners
        if (window.unsubscribeBookings) {
            window.unsubscribeBookings();
        }
        
        await auth.signOut();
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        alert("Logout failed. Please try again.");
    }
};
