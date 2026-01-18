import {
    addDoc, collection, getDocs, query, where,
    doc, getDoc, updateDoc, deleteDoc, onSnapshot,
    orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let selectedRestaurantId = null;
let unsubscribeBookings = null;
let restaurantsData = [];

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
        
        // Add theme styles
        addOwnerDashboardStyles();
        
        // Check for selected restaurant from localStorage
        selectedRestaurantId = localStorage.getItem('selectedRestaurant');
        if (selectedRestaurantId) {
            const bookingsContainer = document.getElementById('bookings-container');
            if (bookingsContainer) {
                bookingsContainer.innerHTML = `
                    <div class="filter-section">
                        <h3>Restaurant Bookings</h3>
                        <p style="color: var(--text-secondary, #636e72);">Showing bookings for selected restaurant</p>
                    </div>
                    <div id="bookings"></div>
                `;
            }
            // Clear after using
            setTimeout(() => {
                localStorage.removeItem('selectedRestaurant');
            }, 100);
        }
        
        loadBookings();
    } catch (error) {
        console.error("Auth check failed:", error);
        showError("Authentication error. Please login again.");
    }
});


function loadBookings() {
    try {
        console.log("Loading bookings for owner:", auth.currentUser.uid);
        const container = document.getElementById("bookings");
        
        // Clean up previous listener
        if (unsubscribeBookings) {
            unsubscribeBookings();
        }
        
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
        unsubscribeBookings = onSnapshot(q, 
            (snapshot) => {
                console.log("Bookings snapshot received:", snapshot.size);
                
                if (!container) return;
                
                container.innerHTML = "";
                
                if (snapshot.empty) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-calendar-times"></i>
                            <h3>No Bookings Yet</h3>
                            <p>Bookings will appear here when customers make reservations</p>
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
                
                // Display bookings with staggered animations
                bookings.forEach((booking, index) => {
                    const card = document.createElement("div");
                    card.className = "booking-card";
                    card.style.setProperty('--delay', `${0.1 + (index * 0.1)}s`);
                    
                    // Format date for display
                    const bookingDate = booking.date ? new Date(booking.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    }) : "Not specified";
                    
                    const bookingTime = booking.time || "Not specified";
                    let statusClass = booking.status?.toLowerCase() || 'pending';
                    let statusText = booking.status || "PENDING";
                    
                    card.innerHTML = `
                        <div class="booking-header">
                            <h4>${booking.restaurantName || "Unknown Restaurant"}</h4>
                            <span class="booking-status status-${statusClass}">${statusText}</span>
                        </div>
                        
                        <div class="booking-details">
                            <p><i class="fas fa-calendar-day"></i> ${bookingDate} | ${bookingTime}</p>
                            <p><i class="fas fa-user-friends"></i> ${booking.guests || 2} guests</p>
                            <p><i class="fas fa-user"></i> ${booking.userEmail || "Unknown user"}</p>
                            
                            ${booking.specialRequests ? `
                                <div class="special-requests">
                                    <i class="fas fa-sticky-note"></i>
                                    <div>
                                        <div class="requests-label">Special Requests</div>
                                        <div class="requests-text">${booking.specialRequests}</div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                    
                    // Add action buttons based on status
                    const actions = document.createElement("div");
                    actions.className = "booking-actions";
                    
                    if (booking.status === "PENDING") {
                        actions.innerHTML = `
                            <button onclick="showConfirmModal('${booking.id}', 'CONFIRMED', 'Confirm this booking?')" class="confirm-btn">
                                <i class="fas fa-check"></i> Confirm
                            </button>
                            <button onclick="showConfirmModal('${booking.id}', 'CANCELLED', 'Decline this booking?')" class="decline-btn">
                                <i class="fas fa-times"></i> Decline
                            </button>
                        `;
                    } else if (booking.status === "CONFIRMED") {
                        actions.innerHTML = `
                            <button onclick="showConfirmModal('${booking.id}', 'CANCELLED', 'Cancel this booking?')" class="cancel-btn">
                                <i class="fas fa-times"></i> Cancel Booking
                            </button>
                        `;
                    }
                    
                    if (actions.innerHTML) {
                        card.appendChild(actions);
                    }
                    
                    container.appendChild(card);
                });
            },
            (error) => {
                console.error("Error in bookings listener:", error);
                
                if (container) {
                    container.innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            <div>
                                <h3>Failed to Load Bookings</h3>
                                <p>Please check your internet connection and try again.</p>
                                <p class="small">Error: ${error.message}</p>
                            </div>
                            <button onclick="retryLoadBookings()" class="retry-btn">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </div>
                    `;
                }
            }
        );
        
    } catch (error) {
        console.error("Error setting up bookings listener:", error);
        
        const container = document.getElementById("bookings");
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <div>
                        <h3>Connection Error</h3>
                        <p>Failed to load bookings. Please refresh the page.</p>
                    </div>
                </div>
            `;
        }
    }
}

// New function to show confirmation modal
window.showConfirmModal = function(bookingId, status, message) {
    const modal = document.createElement('div');
    modal.className = 'modal confirm-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div style="margin-bottom: 1.5rem;">
                <div style="width: 60px; height: 60px; background: linear-gradient(135deg, var(--accent-color, #e17055), var(--accent-dark, #d63031)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                    <i class="fas fa-question-circle" style="color: white; font-size: 1.5rem;"></i>
                </div>
                <h3 style="color: var(--text-primary, #2d3436); margin-bottom: 0.5rem; font-weight: 600;">Confirm Action</h3>
                <p style="color: var(--text-secondary, #636e72); line-height: 1.5;">${message}</p>
            </div>
            
            <div class="modal-buttons">
                <button onclick="updateBookingStatus('${bookingId}', '${status}', this.closest('.modal'))" 
                        class="${status === 'CONFIRMED' ? 'confirm-btn' : 'cancel-btn'}">
                    <i class="fas fa-${status === 'CONFIRMED' ? 'check' : 'times'}"></i> ${status === 'CONFIRMED' ? 'Confirm' : status === 'CANCELLED' ? 'Decline' : 'Update'}
                </button>
                <button onclick="this.closest('.modal').remove()" 
                        style="background: linear-gradient(to right, var(--text-secondary, #636e72), var(--text-primary, #2d3436));">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
        modal.style.animation = 'fadeIn 0.3s ease-out';
    }, 10);
};

window.updateBookingStatus = async (bookingId, status, modalElement) => {
    try {
        console.log(`Updating booking ${bookingId} to ${status}`);
        
        const btn = modalElement.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;
        
        await updateDoc(doc(db, "bookings", bookingId), {
            status: status,
            updatedAt: serverTimestamp()
        });
        
        modalElement.remove();
        
        showToast(`Booking ${status.toLowerCase()} successfully!`, "success");
        
        // Close modal after success
        if (modalElement) {
            modalElement.style.animation = 'fadeIn 0.3s ease-out reverse';
            setTimeout(() => modalElement.remove(), 300);
        }
        
    } catch (error) {
        console.error("Error updating booking:", error);
        showToast("Failed to update booking. Please try again.", "error");
        if (modalElement) {
            const btn = modalElement.querySelector('button');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

// New function to show delete confirmation modal
window.showDeleteConfirm = function(restaurantId, restaurantName) {
    const modal = document.createElement('div');
    modal.className = 'modal delete-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div style="margin-bottom: 1.5rem;">
                <div style="width: 60px; height: 60px; background: linear-gradient(135deg, var(--error-dark, #d63031), var(--error-color, #e17055)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                    <i class="fas fa-exclamation-triangle" style="color: white; font-size: 1.5rem;"></i>
                </div>
                <h3 style="color: var(--error-dark, #d63031); margin-bottom: 0.5rem; font-weight: 600;">Delete Restaurant</h3>
                <p style="color: var(--text-secondary, #636e72); line-height: 1.5; margin-bottom: 0.5rem;">
                    Are you sure you want to delete <strong>"${restaurantName}"</strong>?
                </p>
                <p style="color: var(--error-color, #e17055); font-size: 0.9rem; font-weight: 500;">
                    ⚠️ All bookings will be cancelled.
                </p>
            </div>
            
            <div class="modal-buttons">
                <button onclick="deleteRestaurantOwner('${restaurantId}', '${restaurantName.replace(/'/g, "\\'")}', this.closest('.modal'))" 
                        class="delete-btn">
                    <i class="fas fa-trash"></i> Delete Restaurant
                </button>
                <button onclick="this.closest('.modal').remove()" 
                        style="background: linear-gradient(to right, var(--text-secondary, #636e72), var(--text-primary, #2d3436));">
                    <i class="fas fa-times"></i> Keep Restaurant
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
        modal.style.animation = 'fadeIn 0.3s ease-out';
    }, 10);
};

window.deleteRestaurantOwner = async (restaurantId, restaurantName, modalElement) => {
    try {
        console.log("Deleting restaurant:", restaurantId);
        
        const btn = modalElement.querySelector('.delete-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        btn.disabled = true;
        
        // Get restaurant name for feedback
        const restaurantDoc = await getDoc(doc(db, "restaurants", restaurantId));
        const finalRestaurantName = restaurantDoc.exists() ? restaurantDoc.data().name : restaurantName;
        
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
                    cancelledAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })
            );
        });
        
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        
        modalElement.style.animation = 'fadeIn 0.3s ease-out reverse';
        setTimeout(() => modalElement.remove(), 300);
        
        showToast(`Restaurant "${finalRestaurantName}" deleted successfully! ${updatePromises.length} booking(s) cancelled.`, "success");
        loadMyRestaurants();
        
    } catch (error) {
        console.error("Error deleting restaurant:", error);
        showToast("Failed to delete restaurant. Please try again.", "error");
        if (modalElement) {
            const btn = modalElement.querySelector('.delete-btn');
            btn.innerHTML = '<i class="fas fa-trash"></i> Delete Restaurant';
            btn.disabled = false;
        }
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
    errorDiv.style.animation = "fadeSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <div>
            <h3>Error</h3>
            <p>${message}</p>
        </div>
    `;
    container.prepend(errorDiv);
}

window.logout = async () => {
    try {
        // Clean up listeners
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

function addOwnerDashboardStyles() {
    if (!document.querySelector('#owner-dashboard-styles')) {
        const style = document.createElement('style');
        style.id = 'owner-dashboard-styles';
        style.textContent = `
            /* Restaurant card styles */
            .restaurant-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 0.75rem;
            }
            
            .restaurant-header h3 {
                margin: 0;
                color: var(--text-primary, #2d3436);
                font-size: 1.1rem;
                font-weight: 700;
                letter-spacing: -0.01em;
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
            
            .restaurant-description {
                color: var(--text-secondary, #636e72);
                font-size: 0.9rem;
                line-height: 1.4;
                margin-bottom: 1rem;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            
            .restaurant-meta {
                display: flex;
                gap: 1rem;
                color: var(--text-secondary, #636e72);
                font-size: 0.85rem;
                margin-bottom: 1rem;
            }
            
            .restaurant-meta i {
                color: var(--accent-color, #e17055);
                margin-right: 0.5rem;
            }
            
            /* Booking card styles */
            .booking-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 1rem;
            }
            
            .booking-header h4 {
                margin: 0;
                color: var(--text-primary, #2d3436);
                font-size: 1rem;
                font-weight: 600;
            }
            
            .booking-details {
                background: var(--card-bg-light, rgba(248, 249, 250, 0.8));
                padding: 1.25rem;
                border-radius: 16px;
                margin-bottom: 1rem;
                border: 1px solid var(--border-color, rgba(223, 230, 233, 0.3));
            }
            
            .booking-details p {
                color: var(--text-secondary, #636e72);
                font-size: 0.9rem;
                margin-bottom: 0.75rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .booking-details i {
                color: var(--accent-color, #e17055);
                font-size: 0.9rem;
                min-width: 16px;
            }
            
            .special-requests {
                margin-top: 0.75rem;
                padding-top: 0.75rem;
                border-top: 1px solid var(--border-light, rgba(223, 230, 233, 0.5));
                display: flex;
                align-items: flex-start;
                gap: 0.5rem;
            }
            
            .requests-label {
                font-size: 0.85rem;
                color: var(--text-secondary, #636e72);
                margin-bottom: 0.25rem;
                font-weight: 500;
            }
            
            .requests-text {
                color: var(--text-primary, #2d3436);
                font-size: 0.9rem;
                line-height: 1.4;
            }
            
            /* Booking status badges */
            .booking-status {
                display: inline-block;
                padding: 0.4rem 1rem;
                border-radius: 20px;
                font-size: 0.75rem;
                font-weight: 700;
                text-transform: uppercase;
                white-space: nowrap;
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
            
            .status-pending {
                background: linear-gradient(to right, #ffc107, #ff9800);
                color: #000;
            }
            
            .status-confirmed {
                background: linear-gradient(to right, #4CAF50, #45a049);
                color: white;
            }
            
            .status-cancelled {
                background: linear-gradient(to right, #f44336, #d32f2f);
                color: white;
            }
            
            .status-completed {
                background: linear-gradient(to right, #607d8b, #455a64);
                color: white;
            }
            
            /* Booking action buttons */
            .booking-actions {
                display: flex;
                gap: 0.75rem;
                margin-top: 1rem;
            }
            
            .booking-actions button {
                flex: 1;
            }
            
            .confirm-btn {
                background: linear-gradient(to right, var(--success-color, #00b894), var(--success-dark, #00a085));
            }
            
            .decline-btn {
                background: linear-gradient(to right, var(--warning-color, #fdcb6e), var(--warning-dark, #f39c12));
            }
            
            .cancel-btn {
                background: linear-gradient(to right, var(--error-dark, #d63031), var(--error-color, #e17055));
            }
            
            /* Restaurant action buttons */
            .restaurant-actions {
                display: block;
                margin-top: 16px;
            }
            
            .action-item {
                margin-bottom: 14px;
            }
            
            .action-item:last-child {
                margin-bottom: 0;
            }
            
            .edit-btn {
                background: linear-gradient(to right, var(--accent-color, #e17055), var(--accent-dark, #d63031));
                width: 100%;
            }
            
            .delete-btn {
                background: linear-gradient(to right, var(--error-dark, #d63031), var(--error-color, #e17055));
                width: 100%;
            }
            
            /* Empty states */
            .empty-state {
                text-align: center;
                padding: 3rem 1rem;
                animation: fadeSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .empty-state i {
                font-size: 3rem;
                color: var(--icon-color, rgba(223, 230, 233, 0.5));
                margin-bottom: 1rem;
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .empty-state h3 {
                color: var(--text-secondary, #636e72);
                margin-bottom: 0.75rem;
                font-weight: 600;
            }
            
            .empty-state p {
                color: var(--text-light, #b2bec3);
                margin-bottom: 1.5rem;
                max-width: 300px;
                margin-left: auto;
                margin-right: auto;
            }
            
            .add-restaurant-btn {
                background: linear-gradient(to right, var(--accent-color, #e17055), var(--accent-dark, #d63031));
                width: auto;
                display: inline-block;
            }
            
            /* Toast */
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
            
            /* Confirmation Modals */
            .confirm-modal .modal-content,
            .delete-modal .modal-content {
                background: rgba(255, 255, 255, 0.9);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                padding: 2rem;
                border-radius: 24px;
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.15),
                    0 8px 32px rgba(0, 0, 0, 0.08),
                    inset 0 1px 0 rgba(255, 255, 255, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
            
            /* Dark mode variables */
            @media (prefers-color-scheme: dark) {
                :root {
                    --text-primary: #ffffff;
                    --text-secondary: rgba(255, 255, 255, 0.7);
                    --text-light: rgba(255, 255, 255, 0.5);
                    --accent-color: #e17055;
                    --accent-dark: #d63031;
                    --card-bg-light: rgba(40, 40, 40, 0.8);
                    --border-color: rgba(255, 255, 255, 0.1);
                    --border-light: rgba(255, 255, 255, 0.05);
                    --icon-color: rgba(255, 255, 255, 0.1);
                    --error-color: #e17055;
                    --error-dark: #d63031;
                    --success-color: #00b894;
                    --success-dark: #00a085;
                    --warning-color: #fdcb6e;
                    --warning-dark: #f39c12;
                    --error-bg: rgba(248, 215, 218, 0.2);
                    --error-border: rgba(245, 198, 203, 0.3);
                    --success-bg: rgba(212, 237, 218, 0.2);
                    --success-border: rgba(195, 230, 203, 0.3);
                }
                
                .booking-details, .capacity-badge {
                    background: rgba(40, 40, 40, 0.6);
                }
                
                .empty-state i {
                    background: linear-gradient(135deg, #2d3436 0%, #1a1a1a 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                
                .status-pending {
                    background: linear-gradient(to right, #ffb300, #ff8f00);
                    color: #000;
                }
                
                .status-confirmed {
                    background: linear-gradient(to right, #388e3c, #2e7d32);
                }
                
                .status-cancelled {
                    background: linear-gradient(to right, #d32f2f, #b71c1c);
                }
                
                .status-completed {
                    background: linear-gradient(to right, #546e7a, #455a64);
                }
                
                .confirm-modal .modal-content,
                .delete-modal .modal-content {
                    background: rgba(30, 30, 30, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
            }
            
            /* Responsive */
            @media (min-width: 768px) {
                .restaurant-actions {
                    display: flex;
                    gap: 12px;
                }
                
                .action-item {
                    margin-bottom: 0;
                    flex: 1;
                }
                
                .booking-actions {
                    flex-direction: row;
                }
                
                .confirm-modal .modal-content,
                .delete-modal .modal-content {
                    max-width: 400px;
                }
            }
            
            /* Animations */
            @keyframes fadeSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
}
