const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "rentora"; // default folder
    if (file.fieldname === "ownerIdFile") folder = "rentora/ownerId";
    if (file.fieldname === "ownershipProofFile") folder = "rentora/proof";

    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
    };
  },
});

const upload = multer({ storage });

module.exports = upload;
