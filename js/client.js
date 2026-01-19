import {
  query, collection, where, onSnapshot,
  doc, getDoc, updateDoc, serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase.js";

let currentBookingId = null;
let bookingsData = [];
let unsubscribeBookings = null;

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
function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getBookingEndTime(dateStr, timeStr) {
  // timeStr example: "18:00-19:30"
  if (!dateStr || !timeStr) return null;

  const endTime = timeStr.split('-')[1];
  if (!endTime) return null;

  const [hours, minutes] = endTime.split(':').map(Number);
  const bookingDate = new Date(dateStr);

  bookingDate.setHours(hours, minutes, 0, 0);
  return bookingDate;
}
function isOlderThanDays(timestamp, days) {
  if (!timestamp?.seconds) return false;

  const date = new Date(timestamp.seconds * 1000);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return date < cutoff;
}


async function autoCancelExpiredBookings(bookings) {
  const now = new Date();

  for (const booking of bookings) {
    if (booking.status !== "PENDING") continue;

    const endDateTime = getBookingEndTime(booking.date, booking.time);
    if (!endDateTime) continue;

    if (now >= endDateTime) {
      try {
        await updateDoc(doc(db, "bookings", booking.id), {
          status: "CANCELLED",
          cancelReason: "Auto-cancelled due to no confirmation",
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        console.log("Auto-cancelled booking:", booking.id);
      } catch (err) {
        console.error("Failed to auto-cancel booking:", booking.id, err);
      }
    }
  }
}

function isUpcomingBooking(booking) {
  if (!booking.date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookingDate = new Date(booking.date);
  bookingDate.setHours(0, 0, 0, 0);

  return bookingDate >= today;
}

function loadMyBookings() {
  console.log("Loading bookings for user:", auth.currentUser.uid);
  
  // Clean up previous listener
  if (unsubscribeBookings) {
    unsubscribeBookings();
  }
  
  try {
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", auth.currentUser.uid)
    );
    
    const container = document.getElementById("bookings-list");
    
    // Show loading
    container.innerHTML = `
      <div class="loading">
        <i class="fas fa-spinner fa-spin"></i> Loading your bookings...
      </div>
    `;
    
    // Set up real-time listener
    unsubscribeBookings = onSnapshot(q, 
      (snapshot) => {
        console.log("Bookings snapshot received:", snapshot.size);
        bookingsData = [];
        
        if (snapshot.empty) {
          container.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-calendar-times"></i>
              <h3>No Bookings Yet</h3>
              <p>You haven't made any bookings yet. Start exploring restaurants and make your first reservation!</p>
              <button onclick="window.location.href='client.html'" class="browse-btn">
                <i class="fas fa-utensils"></i> Browse Restaurants
              </button>
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
        autoCancelExpiredBookings(bookingsData);

        const upcomingBookings = bookingsData.filter(isUpcomingBooking);

displayBookings(upcomingBookings);

      },
      (error) => {
        console.error("Error in bookings query:", error);
        
        if (error.code === 'failed-precondition') {
          container.innerHTML = `
            <div class="error-message">
              <i class="fas fa-database"></i>
              <div>
                <h3>Database Index Required</h3>
                <p>This feature needs a database index to work properly.</p>
                <p class="small">Please ask the admin to create the index or try again later.</p>
              </div>
              <button onclick="retryLoadBookings()" class="retry-btn">
                <i class="fas fa-redo"></i> Try Again
              </button>
            </div>
          `;
        } else {
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
    const container = document.getElementById("bookings-list");
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

function displayBookings(bookings) {
  const container = document.getElementById("bookings-list");
  container.innerHTML = "";

  // ✅ Only hide cancelled bookings older than 30 days
  const visibleBookings = bookings.filter(b => {
    if (b.status === "CANCELLED") {
      return !isOlderThanDays(b.cancelledAt, 30);
    }
    return true;
  });

  if (visibleBookings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-calendar-times"></i>
        <h3>No Bookings Found</h3>
        <p>No bookings available for this filter.</p>
      </div>
    `;
    return;
  }

  visibleBookings.forEach((booking) => {
    const bookingDateObj = new Date(booking.date);
    const bookingDate = bookingDateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const bookingTime = booking.time || "Not specified";

    const createdAt = booking.createdAt
      ? new Date(booking.createdAt.seconds * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : "Unknown";

    let statusText = booking.status || "PENDING";
    let statusClass = statusText.toLowerCase();

    // ✅ Mark completed visually
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (booking.status === "CONFIRMED" && bookingDateObj < today) {
      statusText = "COMPLETED";
      statusClass = "completed";
    }

    const card = document.createElement("div");
    card.className = "booking-card";

    card.innerHTML = `
      <div class="booking-header">
        <div class="booking-info">
          <h3>${booking.restaurantName || "Unknown Restaurant"}</h3>
          <p class="booking-meta">
            <i class="fas fa-calendar-alt"></i> ${bookingDate} • 
            <i class="fas fa-clock"></i> ${bookingTime}
          </p>
        </div>
        <span class="booking-status status-${statusClass}">
          ${statusText}
        </span>
      </div>

      <div class="booking-details">
        <div class="booking-meta-row">
          <i class="fas fa-calendar-plus"></i>
          <span>Booked on ${createdAt}</span>
        </div>
      </div>
    `;

    // 🎯 Actions only for active bookings
    if (booking.status === "PENDING" || booking.status === "CONFIRMED") {
      const actions = document.createElement("div");
      actions.className = "restaurant-actions";
      actions.innerHTML = `
        <button onclick="openCancelModal('${booking.id}', '${booking.restaurantName}', '${bookingDate}', '${bookingTime}')" 
                class="cancel-btn">
          <i class="fas fa-times-circle"></i> Cancel Booking
        </button>
        <button onclick="contactRestaurant('${booking.restaurantName}')" 
                class="contact-btn">
          <i class="fas fa-phone"></i> Contact Restaurant
        </button>
      `;
      card.appendChild(actions);
    }

    container.appendChild(card);
  });
}


window.filterBookings = function (filter) {
  if (!bookingsData.length) return;

  document.querySelectorAll('.filter-btn').forEach(btn =>
    btn.classList.remove('active')
  );
  event.target.classList.add('active');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let filtered = [];

  switch (filter) {

    case "UPCOMING":
      filtered = bookingsData.filter(b => {
        if (!b.date) return false;
        const bookingDate = new Date(b.date);
        bookingDate.setHours(0, 0, 0, 0);

        return (
          bookingDate >= today &&
          (b.status === "PENDING" || b.status === "CONFIRMED")
        );
      });
      break;

    case "PENDING":
      filtered = bookingsData.filter(b => {
        if (!b.date) return false;
        const bookingDate = new Date(b.date);
        bookingDate.setHours(0, 0, 0, 0);

        return bookingDate >= today && b.status === "PENDING";
      });
      break;

    case "CONFIRMED":
      filtered = bookingsData.filter(b => {
        if (!b.date) return false;
        const bookingDate = new Date(b.date);
        bookingDate.setHours(0, 0, 0, 0);

        return bookingDate >= today && b.status === "CONFIRMED";
      });
      break;

    case "COMPLETED":
      filtered = bookingsData.filter(b => {
        if (!b.date) return false;
        const bookingDate = new Date(b.date);
        bookingDate.setHours(0, 0, 0, 0);

        return bookingDate < today && b.status === "CONFIRMED";
      });
      break;

    case "CANCELLED":
      filtered = bookingsData.filter(b => b.status === "CANCELLED");
      break;

    case "ALL":
    default:
      filtered = bookingsData;
  }

  displayBookings(filtered);
};



window.openCancelModal = function(bookingId, restaurantName, date, time) {
  currentBookingId = bookingId;
  const modal = document.getElementById('cancel-modal');
  const details = document.getElementById('booking-details');
  
  details.innerHTML = `
    <div class="booking-modal-info">
      <i class="fas fa-info-circle"></i>
      <div>
        <div class="booking-modal-name">${restaurantName}</div>
        <div class="booking-modal-time">${date} at ${time}</div>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
  document.getElementById('cancel-reason').value = '';
};

window.confirmCancel = async function() {
  const reason = document.getElementById('cancel-reason').value;
  const modal = document.getElementById('cancel-modal');
  
  if (!confirm("Are you sure you want to cancel this booking?")) {
    return;
  }
  
  try {
    const button = modal.querySelector('button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...';
    button.disabled = true;
    
    await updateDoc(doc(db, "bookings", currentBookingId), {
      status: "CANCELLED",
      cancelReason: reason || "No reason provided",
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    button.innerHTML = '<i class="fas fa-check-circle"></i> Booking Cancelled!';
    button.classList.add('success-state');
    
    setTimeout(() => {
      closeCancelModal();
      showToast("Booking cancelled successfully!", "success");
    }, 1000);
    
  } catch (error) {
    console.error("Error cancelling booking:", error);
    showToast("Failed to cancel booking. Please try again.", "error");
    modal.querySelector('button').innerHTML = '<i class="fas fa-times-circle"></i> Cancel Booking';
    modal.querySelector('button').disabled = false;
    modal.querySelector('button').classList.remove('success-state');
  }
};

window.closeCancelModal = function() {
  const modal = document.getElementById('cancel-modal');
  modal.classList.add('hidden');
  currentBookingId = null;
  
  // Reset modal button
  const button = modal.querySelector('button');
  button.innerHTML = '<i class="fas fa-times-circle"></i> Cancel Booking';
  button.disabled = false;
  button.classList.remove('success-state');
};

window.contactRestaurant = function(restaurantName) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content contact-modal">
      <div class="modal-header">
        <div class="modal-icon">
          <i class="fas fa-phone-alt"></i>
        </div>
        <h3>Contact ${restaurantName}</h3>
        <p>To contact the restaurant:</p>
      </div>
      
      <div class="contact-steps">
        <div class="contact-step">
          <i class="fas fa-info-circle"></i>
          <div>
            <div class="step-title">Check Restaurant Page</div>
            <div class="step-desc">Find contact details on the restaurant's page</div>
          </div>
        </div>
        
        <div class="contact-step">
          <i class="fas fa-phone"></i>
          <div>
            <div class="step-title">Call Directly</div>
            <div class="step-desc">For booking modifications, please call the restaurant</div>
          </div>
        </div>
      </div>
      
      <div class="modal-buttons">
        <button onclick="this.closest('.modal').remove()" class="close-btn">
          <i class="fas fa-times"></i> Close
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.retryLoadBookings = function() {
  console.log("Retrying to load bookings...");
  loadMyBookings();
};

window.logout = async function() {
  try {
    // Clean up listeners
    if (unsubscribeBookings) {
      unsubscribeBookings();
    }
    
    // Show loading state
    const logoutBtn = document.querySelector('nav a[onclick="logout()"]');
    logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
    logoutBtn.onclick = null;
    
    await auth.signOut();
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    showToast("Logout failed. Please try again.", "error");
    const logoutBtn = document.querySelector('nav a[onclick="logout()"]');
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
  }
};

function showError(message) {
  const container = document.getElementById("bookings-list");
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <div>
      <h3>Error</h3>
      <p>${message}</p>
    </div>
  `;
  container.innerHTML = '';
  container.appendChild(errorDiv);
}

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
