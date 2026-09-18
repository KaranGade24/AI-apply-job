import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { appError } from '../utils/errors.js';
import {
  TEMP_UPLOAD_DIR_NAME,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES
} from '../constant/api.constant.js';

// Resolve temporary storage directory path
const tempUploadDir = path.resolve(process.cwd(), TEMP_UPLOAD_DIR_NAME);

// Ensure temporary upload directory exists
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Configure Multer storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `resume-${uniqueSuffix}${ext}`);
  }
});

// Configure Multer file validation filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isValidMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const isValidExt = ALLOWED_EXTENSIONS.includes(ext);

  if (isValidMime || isValidExt) {
    cb(null, true);
  } else {
    cb(new appError('Invalid file type. Only PDF and DOC/DOCX files are supported.', 400), false);
  }
};

// Export Multer upload middleware instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

export default upload;
