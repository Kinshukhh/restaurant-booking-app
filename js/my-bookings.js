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
    
    // Show loading with skeleton animation
    container.innerHTML = `
      <div class="loading" style="animation: fadeSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);">
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
        
        displayBookings(bookingsData);
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
  
  if (bookings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <h3>No Bookings Found</h3>
        <p>Try changing your filter or browse restaurants to make a booking.</p>
      </div>
    `;
    return;
  }
  
  bookings.forEach((booking, index) => {
    // Format dates
    const bookingDate = booking.date ? new Date(booking.date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : "Not specified";
    
    const bookingTime = booking.time || "Not specified";
    const createdAt = booking.createdAt ? 
      new Date(booking.createdAt.seconds * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) : "Unknown";
    
    // Determine status and styling
    let statusClass = booking.status?.toLowerCase() || "pending";
    let statusText = booking.status || "PENDING";
    
    // Check if booking is in the past (completed)
    const today = new Date();
    const bookingDay = new Date(booking.date);
    if (booking.status === "CONFIRMED" && bookingDay < today) {
      statusClass = "completed";
      statusText = "COMPLETED";
    }
    
    const card = document.createElement("div");
    card.className = "booking-card";
    card.style.setProperty('--delay', `${0.1 + (index * 0.1)}s`);
    
    // Create status badge with theme-aware classes
    const statusBadge = document.createElement("span");
    statusBadge.className = `booking-status status-${statusClass}`;
    statusBadge.textContent = statusText;
    
    card.innerHTML = `
      <div class="booking-header">
        <div class="booking-info">
          <h3>${booking.restaurantName || "Unknown Restaurant"}</h3>
          <p class="booking-meta">
            <i class="fas fa-calendar-alt"></i> ${bookingDate} • 
            <i class="fas fa-clock"></i> ${bookingTime}
          </p>
        </div>
      </div>
      
      <div class="booking-details">
        <div class="booking-stats">
          <div class="stat-item">
            <i class="fas fa-user-friends"></i>
            <div>
              <div class="stat-label">Guests</div>
              <div class="stat-value">${booking.guests || 2}</div>
            </div>
          </div>
          
          <div class="stat-item">
            <i class="fas fa-envelope"></i>
            <div>
              <div class="stat-label">Email</div>
              <div class="stat-email">${booking.userEmail || auth.currentUser.email}</div>
            </div>
          </div>
        </div>
        
        <div class="booking-meta-row">
          <i class="fas fa-calendar-plus"></i>
          <span>Booked on ${createdAt}</span>
        </div>
        
        ${booking.specialRequests ? `
          <div class="special-requests">
            <i class="fas fa-sticky-note"></i>
            <div>
              <div class="requests-label">Special Requests</div>
              <div class="requests-text">${booking.specialRequests}</div>
            </div>
          </div>
        ` : ''}
        
        ${booking.cancelReason ? `
          <div class="cancel-reason">
            <i class="fas fa-info-circle"></i>
            <div>
              <div class="cancel-label">Cancellation Reason</div>
              <div class="cancel-text">${booking.cancelReason}</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    // Add status badge to header
    const header = card.querySelector('.booking-header');
    header.appendChild(statusBadge);
    
    // Add action buttons if applicable
    if (booking.status === "PENDING" || booking.status === "CONFIRMED") {
      const actions = document.createElement("div");
      actions.className = "restaurant-actions";
      actions.innerHTML = `
        <button onclick="openCancelModal('${booking.id}', '${booking.restaurantName}', '${bookingDate}', '${booking.time}')" 
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
  
  // Add fade in animation
  modal.style.animation = 'fadeIn 0.3s ease-out';
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
  setTimeout(() => {
    modal.style.animation = 'fadeIn 0.3s ease-out';
  }, 10);
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
  errorDiv.style.animation = "fadeSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
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

// Add dynamic CSS for theme-aware components
function addThemeStyles() {
  if (!document.querySelector('#theme-styles')) {
    const style = document.createElement('style');
    style.id = 'theme-styles';
    style.textContent = `
      /* Status badges */
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
      
      /* Booking card internal styles */
      .booking-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
      }
      
      .booking-info {
        flex: 1;
      }
      
      .booking-info h3 {
        margin: 0 0 0.5rem 0;
        color: var(--text-primary, #2d3436);
        font-size: 1.1rem;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      
      .booking-meta {
        margin: 0;
        color: var(--text-secondary, #636e72);
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .booking-meta i {
        color: var(--accent-color, #e17055);
      }
      
      .booking-details {
        background: var(--card-bg-light, rgba(248, 249, 250, 0.8));
        padding: 1.25rem;
        border-radius: 16px;
        margin-bottom: 1rem;
        border: 1px solid var(--border-color, rgba(223, 230, 233, 0.3));
      }
      
      .booking-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
        margin-bottom: 0.75rem;
      }
      
      .stat-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .stat-item i {
        color: var(--accent-color, #e17055);
        font-size: 1rem;
      }
      
      .stat-label {
        font-size: 0.85rem;
        color: var(--text-secondary, #636e72);
        margin-bottom: 0.25rem;
      }
      
      .stat-value {
        font-weight: 700;
        color: var(--text-primary, #2d3436);
        font-size: 1.1rem;
      }
      
      .stat-email {
        font-weight: 500;
        color: var(--text-primary, #2d3436);
        font-size: 0.9rem;
        word-break: break-all;
      }
      
      .booking-meta-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-light, rgba(223, 230, 233, 0.5));
        color: var(--text-secondary, #636e72);
        font-size: 0.85rem;
        font-weight: 500;
      }
      
      .booking-meta-row i {
        color: var(--accent-color, #e17055);
        font-size: 0.9rem;
      }
      
      .special-requests {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-light, rgba(223, 230, 233, 0.5));
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }
      
      .special-requests i {
        color: var(--accent-color, #e17055);
        font-size: 0.9rem;
        margin-top: 0.2rem;
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
      
      .cancel-reason {
        margin-top: 1rem;
        padding: 1rem;
        background: var(--error-bg-light, rgba(248, 215, 218, 0.3));
        border-radius: 12px;
        border: 1px solid var(--error-border, rgba(245, 198, 203, 0.5));
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }
      
      .cancel-reason i {
        color: var(--error-color, #721c24);
        font-size: 0.9rem;
        margin-top: 0.1rem;
      }
      
      .cancel-label {
        font-size: 0.85rem;
        color: var(--error-color, #721c24);
        margin-bottom: 0.25rem;
        font-weight: 600;
      }
      
      .cancel-text {
        color: var(--error-color, #721c24);
        font-size: 0.85rem;
        line-height: 1.4;
      }
      
      /* Modal styles */
      .booking-modal-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--accent-light, rgba(225, 112, 85, 0.1));
        border-radius: 12px;
        margin-bottom: 1rem;
      }
      
      .booking-modal-info i {
        color: var(--accent-color, #e17055);
        font-size: 1.2rem;
      }
      
      .booking-modal-name {
        font-weight: 600;
        color: var(--text-primary, #2d3436);
        margin-bottom: 0.25rem;
      }
      
      .booking-modal-time {
        color: var(--text-secondary, #636e72);
        font-size: 0.9rem;
      }
      
      /* Contact modal */
      .contact-modal {
        max-width: 400px;
        text-align: center;
      }
      
      .modal-header {
        margin-bottom: 1.5rem;
      }
      
      .modal-icon {
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, var(--accent-color, #e17055), var(--accent-dark, #d63031));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
      }
      
      .modal-icon i {
        color: white;
        font-size: 1.5rem;
      }
      
      .contact-steps {
        text-align: left;
        background: var(--card-bg-light, rgba(248, 249, 250, 0.8));
        padding: 1.25rem;
        border-radius: 16px;
        margin-bottom: 1.5rem;
      }
      
      .contact-step {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-light, rgba(223, 230, 233, 0.5));
      }
      
      .contact-step:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }
      
      .contact-step i {
        color: var(--accent-color, #e17055);
        font-size: 1.1rem;
      }
      
      .step-title {
        font-weight: 600;
        color: var(--text-primary, #2d3436);
        font-size: 0.95rem;
      }
      
      .step-desc {
        color: var(--text-secondary, #636e72);
        font-size: 0.85rem;
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
      
      .browse-btn {
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
      
      /* Button states */
      .cancel-btn {
        background: linear-gradient(to right, var(--error-dark, #d63031), var(--accent-color, #e17055));
      }
      
      .contact-btn {
        background: linear-gradient(to right, var(--text-secondary, #636e72), var(--text-primary, #2d3436));
      }
      
      .success-state {
        background: linear-gradient(to right, var(--success-color, #4CAF50), var(--success-dark, #45a049));
      }
      
      .retry-btn {
        margin-top: 1rem;
      }
      
      /* Small text */
      .small {
        font-size: 0.85rem;
        opacity: 0.8;
        margin: 0;
      }
      
      /* Dark mode variables */
      @media (prefers-color-scheme: dark) {
        :root {
          --text-primary: #ffffff;
          --text-secondary: rgba(255, 255, 255, 0.7);
          --text-light: rgba(255, 255, 255, 0.5);
          --accent-color: #e17055;
          --accent-dark: #d63031;
          --accent-light: rgba(225, 112, 85, 0.2);
          --card-bg-light: rgba(40, 40, 40, 0.8);
          --border-color: rgba(255, 255, 255, 0.1);
          --border-light: rgba(255, 255, 255, 0.05);
          --icon-color: rgba(255, 255, 255, 0.1);
          --error-color: #f5c6cb;
          --error-bg: rgba(248, 215, 218, 0.2);
          --error-bg-light: rgba(248, 215, 218, 0.1);
          --error-border: rgba(245, 198, 203, 0.3);
          --error-dark: #d32f2f;
          --success-color: #4CAF50;
          --success-dark: #45a049;
          --success-bg: rgba(212, 237, 218, 0.2);
          --success-border: rgba(195, 230, 203, 0.3);
        }
        
        .booking-details {
          background: rgba(40, 40, 40, 0.6);
        }
        
        .contact-steps {
          background: rgba(40, 40, 40, 0.6);
        }
        .contact-btn {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.18),
    rgba(255, 255, 255, 0.08)
  );
  color: #ffffff;
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
      }
      
      @keyframes fadeSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize theme styles
addThemeStyles();
