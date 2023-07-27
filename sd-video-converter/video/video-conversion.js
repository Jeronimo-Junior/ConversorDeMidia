const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Minio = require('minio');
const { URL } = require('url');

const kafkaHost = 'kafka:9092';
const inputTopic = 'video-input';
const outputTopic = 'video-output';

// Configuração do Kafka Consumer
const kafka = new Kafka({
  clientId: 'console-consumer',
  brokers: ['kafka:9092'],
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'console-consumer-5794' });

// Configuração do cliente do MinIO
const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'root',
  secretKey: '12345678'
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

consumer.connect();
consumer.subscribe({ topic: inputTopic, fromBeginning: true });
consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const { format, filename, user } = JSON.parse(message.value);

    // Salva o arquivo de entrada no diretório correspondente
    const inputFile = path.join(inputDir, filename);
    try {
      minioClient.fGetObject('input-bucket', filename, inputFile, async (error) => {
        if (error) {
          console.error('Erro ao salvar o arquivo:', error);
          return;
        }
        console.log('Arquivo salvo:', inputFile);

        // Define o caminho e o nome do arquivo de saída convertido
        const outputFilename = `${filename.split('.').shift()}.${format}`;
        const outputFile = path.join(outputDir, outputFilename);

        // Comando para realizar a conversão do vídeo usando o FFMpeg (é necessário tê-lo instalado)
        //const command = `ffmpeg -i "${inputFile}" "${outputFile}"`;
        const command = `mv '${inputFile}' '${outputFile}'`;
        // Executa o comando para converter o vídeo

        await new Promise((resolve, reject) => {
          exec(command, (error) => {
            if (error) {
              console.log('Erro ao converter o vídeo:', error.message);
              reject(error);
            } else {
              console.log('Vídeo convertido com sucesso:', outputFile);
              resolve();
            }
          });
        });

        const outputBucket = 'output-bucket';
        const objectName = outputFilename;

        minioClient.fPutObject(outputBucket, objectName, outputFile, async (err) => {
          if (err) {
            console.log('Error uploading file to MinIO:', error);
            //sendEmail(email, 'Error uploading converted file', 'An error occurred while uploading the converted file. Please try again later.');
          } else {
            minioClient.presignedUrl("GET", outputBucket, objectName, (err, presignedUrl) => {
              // Replace the host and port in the presigned URL
              const urlObj = new URL(presignedUrl);
              urlObj.host = 'localhost:9000';
              const updatedPresignedUrl = urlObj.toString();

              console.log('Presigned URL:', updatedPresignedUrl);
              producer.connect();
               producer.send({
                topic: outputTopic,
                messages: [{ value: JSON.stringify({ user, url: updatedPresignedUrl }) }]
              });
              producer.disconnect();
            });
          }
        });
      });
    } catch (error) {
      console.error('Erro ao salvar o arquivo:', error);
      return;
    }
  }
});

// Função para enviar e-mails
function sendEmail(to, subject, body, outputFile) {
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
    }
  });
}

console.log('Aguardando requisições do Kafka...');
