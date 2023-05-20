const express = require('express');
const kafka = require('kafka-node');
const bodyParser = require('body-parser');
const multer = require('multer');

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const upload = multer();

// Rota para exibir uma tela HTML
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Exemplo de Envio de Arquivo e Dados para o Kafka</h1>
        <form action="/upload" method="post" enctype="multipart/form-data">
          <input type="file" name="video">
          <br>
          <input type="email" name="email" placeholder="Digite o e-mail">
          <br>
          <select name="format">
            <option value="mp4">MP4</option>
            <option value="avi">AVI</option>
            <option value="mkv">MKV</option>
          </select>
          <br>
          <input type="submit" value="Enviar">
        </form>
      </body>
    </html>
  `);
});

// Rota para lidar com o envio de arquivo, e-mail e formato para o Kafka
app.post('/upload', upload.single('video'), (req, res) => {
  const file = req.file; // Acessa o arquivo enviado
  const email = req.body.email;
  const format = req.body.format;
  
  console.log(file, email, format);
  // Lógica para enviar para o Kafka
  const kafkaHost = 'kafka:9092';
  const kafkaTopic = 'video-topic';

  const client = new kafka.KafkaClient({ kafkaHost });
  const producer = new kafka.Producer(client);

  const payloads = [
    {
      topic: kafkaTopic,
      messages: JSON.stringify({ file, email, format }),
    },
  ];

  producer.send(payloads, (error, data) => {
    if (error) {
      console.error('Erro ao enviar mensagem para o Kafka:', error);
      res.status(500).send('Erro ao enviar mensagem para o Kafka');
    } else {
      console.log('Mensagem enviada para o Kafka:', payloads[0].messages);
      res.send('Arquivo enviado com sucesso!');
    }
  });
});

// Iniciando o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
