// ================================
// Cloudinary Global Helper
// ================================

// ⚠️ Replace with your values
const CLOUDINARY_CLOUD_NAME = "dbrctsmn7";
const CLOUDINARY_UPLOAD_PRESET = "booking";

/**
 * Upload image to Cloudinary
 * @param {File} file
 * @returns {Promise<string>} secure_url
 */
export async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
    );

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error?.message || "Upload failed");
    }

    return {
        url: data.secure_url,
        publicId: data.public_id   // 👈 IMPORTANT
    };
}
