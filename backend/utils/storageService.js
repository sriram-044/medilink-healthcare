/**
 * storageService.js — Cloud-Agnostic Medical Report Storage Abstraction
 * Supports Local Disk Storage by default, with seamless architecture for AWS S3, GCS, and Azure.
 */

const fs = require('fs');
const path = require('path');

// Ensure local uploads directory exists
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

/**
 * Local Disk Storage Driver (Development & On-Prem Default)
 */
class LocalStorageDriver {
  constructor(uploadDir) {
    this.uploadDir = uploadDir;
  }

  async saveFile(fileBufferOrPath, fileName) {
    const destinationPath = path.join(this.uploadDir, fileName);
    if (Buffer.isBuffer(fileBufferOrPath)) {
      await fs.promises.writeFile(destinationPath, fileBufferOrPath);
    } else if (typeof fileBufferOrPath === 'string' && fs.existsSync(fileBufferOrPath)) {
      // If temporary file path from multer
      if (fileBufferOrPath !== destinationPath) {
        await fs.promises.copyFile(fileBufferOrPath, destinationPath);
      }
    }
    return {
      fileName,
      storageKey: fileName,
      provider: 'local',
      localPath: destinationPath
    };
  }

  async getFile(fileName) {
    const filePath = path.join(this.uploadDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found in local storage: ${fileName}`);
    }
    return {
      stream: fs.createReadStream(filePath),
      filePath,
      stat: await fs.promises.stat(filePath)
    };
  }

  async deleteFile(fileName) {
    const filePath = path.join(this.uploadDir, fileName);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  getFileUrl(_fileName, _req = null) {
    // Medical files are no longer served via public /uploads URL.
    // Access is through the authenticated API endpoint:
    // GET /api/medical-reports/:reportId/file  (or /view, /download)
    // This method is kept for interface compatibility but returns null
    // so callers know not to expose a direct URL.
    return null;
  }
}

/**
 * AWS S3 Storage Driver
 */
class S3StorageDriver {
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.AWS_S3_BUCKET;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    
    // Dynamic import to avoid crashing app if running in local mode without packages
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.PutObjectCommand = PutObjectCommand;
    this.GetObjectCommand = GetObjectCommand;
    this.DeleteObjectCommand = DeleteObjectCommand;
    this.getSignedUrl = getSignedUrl;
  }

  async saveFile(fileBufferOrPath, fileName) {
    const storageKey = `reports/${fileName}`;
    console.log(`[S3 Driver] Uploading ${fileName} to bucket ${this.bucket}...`);
    
    let fileBuffer;
    if (Buffer.isBuffer(fileBufferOrPath)) {
      fileBuffer = fileBufferOrPath;
    } else {
      fileBuffer = await fs.promises.readFile(fileBufferOrPath);
    }
    
    const command = new this.PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Body: fileBuffer
    });
    
    await this.client.send(command);
    
    return {
      fileName,
      storageKey,
      provider: 's3',
      bucket: this.bucket
    };
  }

  async getFile(storageKey) {
    const command = new this.GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey
    });
    
    const response = await this.client.send(command);
    return {
      stream: response.Body,
      filePath: storageKey,
      stat: { size: response.ContentLength }
    };
  }

  async deleteFile(storageKey) {
    console.log(`[S3 Driver] Deleted ${storageKey} from bucket ${this.bucket}`);
    const command = new this.DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey
    });
    await this.client.send(command);
    return true;
  }

  getFileUrl(storageKey) {
    // S3 requires signed URLs for private objects or fallback to API endpoint
    return null;
  }
}

/**
 * Google Cloud Storage Driver
 */
class GCSStorageDriver {
  constructor(config = {}) {
    this.bucketName = config.bucket || process.env.GCS_BUCKET_NAME;
    const { Storage } = require('@google-cloud/storage');
    this.storage = new Storage();
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async saveFile(fileBufferOrPath, fileName) {
    const storageKey = `reports/${fileName}`;
    console.log(`[GCS Driver] Uploading ${fileName} to bucket ${this.bucketName}...`);
    
    const file = this.bucket.file(storageKey);
    
    if (Buffer.isBuffer(fileBufferOrPath)) {
      await file.save(fileBufferOrPath);
    } else {
      await this.bucket.upload(fileBufferOrPath, { destination: storageKey });
    }
    
    return {
      fileName,
      storageKey,
      provider: 'gcs',
      bucket: this.bucketName
    };
  }

  async getFile(storageKey) {
    const file = this.bucket.file(storageKey);
    const [metadata] = await file.getMetadata();
    
    return {
      stream: file.createReadStream(),
      filePath: storageKey,
      stat: { size: parseInt(metadata.size, 10) }
    };
  }

  async deleteFile(storageKey) {
    console.log(`[GCS Driver] Deleted ${storageKey} from bucket ${this.bucketName}`);
    await this.bucket.file(storageKey).delete();
    return true;
  }

  getFileUrl(storageKey) {
    return null;
  }
}

/**
 * Storage Service Factory
 */
class StorageService {
  constructor() {
    const driverType = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

    switch (driverType) {
      case 's3':
      case 'aws':
        this.driver = new S3StorageDriver();
        break;
      case 'gcs':
      case 'google':
        this.driver = new GCSStorageDriver();
        break;
      case 'local':
      default:
        this.driver = new LocalStorageDriver(LOCAL_UPLOAD_DIR);
        break;
    }
  }

  async uploadFile(fileBufferOrPath, fileName) {
    return await this.driver.saveFile(fileBufferOrPath, fileName);
  }

  async getFile(fileName) {
    return await this.driver.getFile(fileName);
  }

  async deleteFile(fileName) {
    return await this.driver.deleteFile(fileName);
  }

  getFileUrl(fileName, req = null) {
    return this.driver.getFileUrl(fileName, req);
  }

  getDriverName() {
    return process.env.STORAGE_DRIVER || 'local';
  }
}

module.exports = new StorageService();
