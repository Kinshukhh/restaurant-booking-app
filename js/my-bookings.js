import {
  query, collection, where, onSnapshot,
  doc, getDoc, updateDoc, serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let currentBookingId = null;
let bookingsData = [];

// Check authentication
auth.onAuthStateChanged(async (user) => {
  console.log("My Bookings: Auth state changed. User:", user);
  
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
    
    if (userData.role !== "CLIENT") {
      console.log("Not a client, redirecting to owner");
      window.location.href = "owner.html";
      return;
    }
    
    loadMyBookings();
  } catch (error) {
    console.error("Auth check failed:", error);
    showError("Authentication error. Please login again.");
  }
});

function loadMyBookings() {
  console.log("Loading bookings for user:", auth.currentUser.uid);
  
  // Try different query approaches
  try {
    // First try without orderBy (simpler query)
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", auth.currentUser.uid)
      // Removed orderBy temporarily to avoid index issues
    );
    
    const container = document.getElementById("bookings-list");
    
    // Show loading
    container.innerHTML = `
      <div class="loading">
        <i class="fas fa-spinner fa-spin"></i> Loading your bookings...
      </div>
    `;
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log("Bookings snapshot received:", snapshot.size);
        bookingsData = [];
        
        if (snapshot.empty) {
          container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
              <i class="fas fa-calendar-times" style="font-size: 64px; color: #dfe6e9; margin-bottom: 20px;"></i>
              <h3 style="color: #636e72; margin-bottom: 10px;">No Bookings Yet</h3>
              <p style="color: #b2bec3; margin-bottom: 30px;">You haven't made any bookings yet.</p>
              <a href="client.html" style="display: inline-block; padding: 12px 24px; background: #e17055; color: white; text-decoration: none; border-radius: 8px;">
                <i class="fas fa-utensils"></i> Browse Restaurants
              </a>
            </div>
          `;
          return;
        }
        
        snapshot.forEach((doc) => {
          const booking = {
            id: doc.id,
            ...doc.data()
          };
          bookingsData.push(booking);
        });
        
        // Sort by date on client side (newest first)
        bookingsData.sort((a, b) => {
          const dateA = a.createdAt ? (a.createdAt.seconds || a.createdAt) : 0;
          const dateB = b.createdAt ? (b.createdAt.seconds || b.createdAt) : 0;
          return dateB - dateA;
        });
        
        displayBookings(bookingsData);
      },
      (error) => {
        console.error("Error in bookings query:", error);
        
        // Check for index error
        if (error.code === 'failed-precondition') {
          container.innerHTML = `
            <div class="error-message">
              <i class="fas fa-database"></i>
              <h3>Database Index Required</h3>
              <p>This feature needs a database index to work properly.</p>
              <p style="font-size: 14px; margin-top: 10px;">Please ask the admin to create the index or try again later.</p>
              <button onclick="retryLoadBookings()" style="margin-top: 15px;">
                <i class="fas fa-redo"></i> Try Again
              </button>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-circle"></i>
              <h3>Failed to Load Bookings</h3>
              <p>Please check your internet connection and try again.</p>
              <p style="font-size: 14px; margin-top: 10px;">Error: ${error.message}</p>
              <button onclick="retryLoadBookings()" style="margin-top: 15px;">
                <i class="fas fa-redo"></i> Retry
              </button>
            </div>
          `;
        }
      }
    );
    
    // Store unsubscribe function for cleanup
    window.unsubscribeBookings = unsubscribe;
    
  } catch (error) {
    console.error("Error setting up bookings listener:", error);
    const container = document.getElementById("bookings-list");
    container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        Failed to load bookings. Please refresh the page.
      </div>
    `;
  }
}

function displayBookings(bookings) {
  const container = document.getElementById("bookings-list");
  container.innerHTML = "";
  
  if (bookings.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <p style="color: #636e72;">No bookings found.</p>
      </div>
    `;
    return;
  }
  
  bookings.forEach((booking) => {
    // Format dates
    const bookingDate = booking.date || "Not specified";
    const createdAt = booking.createdAt ? 
      new Date(booking.createdAt.seconds * 1000).toLocaleDateString() : 
      "Unknown";
    
    // Determine status
    let statusClass = booking.status?.toLowerCase() || "pending";
    let statusText = booking.status || "PENDING";
    
    // Check if booking is in the past (completed)
    const today = new Date();
    const bookingDay = new Date(bookingDate);
    if (booking.status === "CONFIRMED" && bookingDay < today) {
      statusClass = "completed";
      statusText = "COMPLETED";
    }
    
    const card = document.createElement("div");
    card.className = "booking-card";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <div>
          <h4 style="margin: 0 0 5px 0; color: #2d3436;">${booking.restaurantName || "Unknown Restaurant"}</h4>
          <p style="margin: 0; color: #636e72; font-size: 14px;">
            <i class="fas fa-calendar-alt"></i> ${bookingDate} | <i class="fas fa-clock"></i> ${booking.time || "Not specified"}
          </p>
        </div>
        <span class="booking-status status-${statusClass}">${statusText}</span>
      </div>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
        <p style="margin: 0 0 8px 0;">
          <i class="fas fa-user-friends"></i> <strong>${booking.guests || 2}</strong> guest${booking.guests !== 1 ? 's' : ''}
        </p>
        <p style="margin: 0 0 8px 0; color: #636e72; font-size: 14px;">
          <i class="fas fa-envelope"></i> ${booking.userEmail || auth.currentUser.email}
        </p>
        <p style="margin: 0; color: #636e72; font-size: 14px;">
          <i class="fas fa-calendar-plus"></i> Booked on ${createdAt}
        </p>
        
        ${booking.specialRequests ? `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dfe6e9;">
            <p style="margin: 0; color: #2d3436; font-size: 14px;">
              <i class="fas fa-sticky-note"></i> ${booking.specialRequests}
            </p>
          </div>
        ` : ''}
        
        ${booking.cancelReason ? `
          <div style="margin-top: 10px; padding: 10px; background: #f8d7da; border-radius: 5px;">
            <p style="margin: 0; color: #721c24; font-size: 13px;">
              <i class="fas fa-info-circle"></i> Cancelled: ${booking.cancelReason}
            </p>
          </div>
        ` : ''}
      </div>
      
      ${(booking.status === "PENDING" || booking.status === "CONFIRMED") ? `
        <div style="display: flex; gap: 10px;">
          <button onclick="openCancelModal('${booking.id}', '${booking.restaurantName}', '${bookingDate}', '${booking.time}')" 
                  class="cancel-btn" style="flex: 1;">
            <i class="fas fa-times-circle"></i> Cancel Booking
          </button>
          <button onclick="contactRestaurant('${booking.restaurantName}')" 
                  class="modify-btn" style="flex: 1;">
            <i class="fas fa-phone"></i> Contact
          </button>
        </div>
      ` : ''}
    `;
    
    container.appendChild(card);
  });
}

window.filterBookings = function(filter) {
  if (!bookingsData.length) return;
  
  // Update active filter button
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  let filtered = bookingsData;
  
  if (filter !== 'all') {
    if (filter === 'COMPLETED') {
      filtered = bookingsData.filter(b => {
        const bookingDate = new Date(b.date);
        const today = new Date();
        return b.status === "CONFIRMED" && bookingDate < today;
      });
    } else {
      filtered = bookingsData.filter(b => b.status === filter);
    }
  }
  
  displayBookings(filtered);
};

window.openCancelModal = function(bookingId, restaurantName, date, time) {
  currentBookingId = bookingId;
  document.getElementById('booking-details').textContent = 
    `${restaurantName} on ${date} at ${time}`;
  document.getElementById('cancel-modal').classList.remove('hidden');
  document.getElementById('cancel-reason').value = '';
};

window.confirmCancel = async function() {
  const reason = document.getElementById('cancel-reason').value;
  
  if (!confirm("Are you sure you want to cancel this booking?")) {
    return;
  }
  
  try {
    await updateDoc(doc(db, "bookings", currentBookingId), {
      status: "CANCELLED",
      cancelReason: reason || "No reason provided",
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    closeCancelModal();
    alert("✅ Booking cancelled successfully!");
  } catch (error) {
    console.error("Error cancelling booking:", error);
    alert("Failed to cancel booking. Please try again.");
  }
};

window.closeCancelModal = function() {
  document.getElementById('cancel-modal').classList.add('hidden');
  currentBookingId = null;
};

window.contactRestaurant = function(restaurantName) {
  alert(`To contact ${restaurantName}:\n\n1. Check the restaurant details on the Restaurants page\n2. Use the contact information provided\n3. For booking modifications, please call the restaurant directly`);
};

window.retryLoadBookings = function() {
  console.log("Retrying to load bookings...");
  loadMyBookings();
};

window.logout = async function() {
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

function showError(message) {
  const container = document.getElementById("bookings-list");
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    ${message}
  `;
  container.appendChild(errorDiv);
}