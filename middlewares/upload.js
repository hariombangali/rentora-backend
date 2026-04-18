const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_DOC_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "rentora";
    if (file.fieldname === "ownerIdFile") folder = "rentora/ownerId";
    if (file.fieldname === "ownershipProofFile") folder = "rentora/proof";

    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
    };
  },
});

const fileFilter = (req, file, cb) => {
  const isDoc = file.fieldname === "ownerIdFile" || file.fieldname === "ownershipProofFile";
  const allowed = isDoc ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES;

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images (and PDF for documents) are allowed.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

module.exports = upload;
