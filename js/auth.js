import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Signup function with error handling
export async function signup(email, password, role) {
  try {
    console.log("Signing up user:", email);
    
    // Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log("User created in auth:", user.uid);
    
    // Create user document in Firestore
    await setDoc(doc(db, "users", user.uid), {
      email: email,
      role: role, // "OWNER" or "CLIENT"
      createdAt: serverTimestamp(),
      uid: user.uid
    });
    
    console.log("User document created in Firestore");
    return { success: true, user: user };
    
  } catch (error) {
    console.error("Signup error:", error);
    
    // User-friendly error messages
    let errorMessage = "Signup failed. Please try again.";
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = "Email is already registered.";
    } else if (error.code === 'auth/weak-password') {
      errorMessage = "Password should be at least 6 characters.";
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = "Invalid email address.";
    }
    
    throw new Error(errorMessage);
  }
}

// Login function with error handling
export async function login(email, password) {
  try {
    console.log("Logging in user:", email);
    
    // Sign in user
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log("User signed in:", user.uid);
    
    // Get user data from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      throw new Error("User data not found.");
    }
    
    const userData = userDoc.data();
    console.log("User role:", userData.role);
    
    return userData.role;
    
  } catch (error) {
    console.error("Login error:", error);
    
    // User-friendly error messages
    let errorMessage = "Login failed. Please check your credentials.";
    if (error.code === 'auth/user-not-found') {
      errorMessage = "No account found with this email.";
    } else if (error.code === 'auth/wrong-password') {
      errorMessage = "Incorrect password.";
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = "Invalid email address.";
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = "Too many failed attempts. Please try again later.";
    }
    
    throw new Error(errorMessage);
  }
}

// Logout function
export async function logoutUser() {
  try {
    await signOut(auth);
    console.log("User logged out");
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}