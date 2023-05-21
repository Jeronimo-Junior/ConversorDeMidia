const kafka = require('kafka-node');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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
  const { file, email, format } = JSON.parse(message.value);
  console.log(file.originalname)
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
    const fileData = Buffer.from(file.buffer, 'base64');
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
    // Remove o arquivo de entrada
    fs.unlinkSync(inputFile);
    if (error) {
      console.log('Erro ao converter o vídeo:', error.message);
      sendEmail(email, 'Erro na conversão do vídeo', 'Ocorreu um erro ao converter o vídeo. Por favor, tente novamente mais tarde.');
    } else {
      console.log('Vídeo convertido com sucesso:', outputFile);
      sendEmail(email, 'Vídeo convertido com sucesso', 'O vídeo foi convertido com sucesso.',outputFile);
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
    attachments: [
      {path:outputFile}
    ]
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
