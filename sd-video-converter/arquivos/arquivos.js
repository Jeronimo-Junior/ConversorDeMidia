const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const storage = multer.diskStorage({
   destination: (req, file, cb) => {
      cb(null, 'uploads/');
   },
   filename: (req, file, cb) => {
      cb(null, file.originalname);
   }
});

const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), (req, res) => {
   res.send('File uploaded successfully!');
});

app.get('/download/:fileName', (req, res) => {
   const fileName = req.params.fileName;
   const filePath = path.join(__dirname, 'uploads', fileName);

   if (fs.existsSync(filePath)) {
      const expiryTime = new Date(Date.now() + 3600000).toUTCString();
      const downloadLink = `http://localhost:${port}/download/temp/${fileName}?expiry=${expiryTime}`;

      res.send({ link: downloadLink });
   } else {
      res.status(404).send('File not found!');
   }
});

app.get('/download/temp/:fileName', (req, res) => {
   const fileName = req.params.fileName;
   const filePath = path.join(__dirname, 'uploads', fileName);
   const expiryTime = new Date(req.query.expiry);

   if (fs.existsSync(filePath) && expiryTime > new Date()) {
      res.sendFile(filePath);
   } else {
      res.status(404).send('File not found or link expired!');
   }
});

function cleanupExpiredFiles() {
   const uploadDir = path.join(__dirname, 'uploads');

   fs.readdir(uploadDir, (err, files) => {
      if (err) throw err;

      files.forEach(file => {
         const filePath = path.join(uploadDir, file);

         if (fs.statSync(filePath).isFile() && new Date(fs.statSync(filePath).mtime) < new Date()) {
            fs.unlinkSync(filePath);
         }
      });
   });
}

setInterval(cleanupExpiredFiles, 3600000);

app.listen(port, () => {
   console.log(`Server is running on port ${port}`);
});