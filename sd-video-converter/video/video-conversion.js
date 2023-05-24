const kafka = require('kafka-node');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Minio = require('minio');

const kafkaHost = 'kafka:9092';
const kafkaTopic = 'video-topic';

// Configuração do Kafka Consumer
const Consumer = kafka.Consumer;
const client = new kafka.KafkaClient({ kafkaHost });
const consumer = new Consumer(
  client,
  [{ topic: kafkaTopic, partition: 0 }],
  { autoCommit: true }
);

// Configuração do cliente do MinIO
const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'root',
  secretKey: 'minio_password'
});

// Configuração do Nodemailer
var transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "731732736202f1",
    pass: "209ffdb0620065"
  }
});

consumer.on('message', async (message) => {
  const { filename, email, format } = JSON.parse(message.value);
  console.log(filename)
  console.log(email)
  console.log(format)
  // Define o diretório de entrada e saída dos vídeos
  const inputDir = '/app/input';
  const outputDir = '/app/output';

  // Cria o diretório de saída se não existir
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  if (!fs.existsSync(inputDir)) {
    fs.mkdirSync(inputDir);
  }

  // Salva o arquivo de entrada no diretório correspondente
  const inputFile = path.join(inputDir, file.originalname);
  try {
    const fileData = minioClient.getObject('input-bucket',filename);
    fs.writeFileSync(inputFile, fileData);
    console.log('Arquivo salvo:', inputFile);
  } catch (error) {
    console.error('Erro ao salvar o arquivo:', error);
    return;
  }

  
  // Define o caminho e o nome do arquivo de saída convertido
  const outputFilename = `${file.originalname.split('.').shift()}.${format}`;
  const outputFile = path.join(outputDir, outputFilename);

 

  // Comando para realizar a conversão do vídeo usando o FFMpeg (é necessário tê-lo instalado)
  const command = `ffmpeg -i "${inputFile}" "${outputFile}"`;

  // Executa o comando para converter o vídeo
  
  exec(command, (error) => {
    if (error) {
      console.log('Erro ao converter o vídeo:', error.message);
    } else {
      console.log('Vídeo convertido com sucesso:', outputFile);
    }
  });

  //
  const outputBucket = 'output-bucket';
  const objectName = outputFilename;
  const fileStream = fs.createReadStream(outputFile);

  minioClient.putObject(outputBucket, objectName, fileStream, (error) => {
    // Remove the input file from the input bucket
    fs.unlinkSync(inputFile);

    if (error) {
      console.log('Error uploading file to MinIO:', error);
      sendEmail(email, 'Error uploading converted file', 'An error occurred while uploading the converted file. Please try again later.');
    } else {
      console.log('File uploaded to MinIO:', objectName);

      // Generate a temporary download URL for the file
      const expiryTime = 24 * 60 * 60; // 24 hours in seconds
      minioClient.presignedGetObject(outputBucket, objectName, expiryTime, (error, presignedUrl) => {
        if (error) {
          console.log('Error generating presigned URL:', error);
          sendEmail(email, 'Error generating download link', 'An error occurred while generating the download link for the converted file. Please try again later.');
        } else {
          console.log('Presigned URL:', presignedUrl);
          sendEmail(email, 'File converted and uploaded', `Your file has been converted and uploaded. Download it using the following link (valid for 24 hours): ${presignedUrl}`);
        }
      });
    }
  });
});

// Função para enviar e-mails
function sendEmail(to, subject, body,outputFile) {
  const mailOptions = {
    from: 'videoconversor5@gmail.com',
    to: to,
    subject: subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erro ao enviar e-mail:', error);
    } else {
      console.log('E-mail enviado:', info.response);
      fs.unlinkSync(outputFile);
    }
  });
}

console.log('Aguardando requisições do Kafka...');
