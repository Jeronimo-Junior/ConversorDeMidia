const express = require('express');
const {Kafka}  = require('kafkajs');
const bodyParser = require('body-parser');
const multer = require('multer');
const Minio = require('minio');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const session = require('express-session');

const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: 'mysecretkey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 60 * 1000 } // 30 minutos
}));

const upload = multer();

// Configuração do banco de dados MySQL
const connection = mysql.createConnection({
  host: 'mysql',
  user: 'root',
  password: 'root',
  database: 'db'
});

const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'root',
  secretKey: '12345678'
});

// Send the filename to Kafka
const kafkaHost = 'kafka:9092';
const inputTopic = 'video-input';
const outputTopic = 'video-output';

const kafka = new Kafka({
  clientId: 'console-consumer',
  brokers: ['kafka:9092'],
})
const producer = kafka.producer()
const consumer = kafka.consumer({ groupId: 'console-consumer-5794' })

app.get('/', (req, res) => {
  res.redirect('/entrar');
});
// Rota para lidar com o envio de arquivo e formato para o Kafka
app.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.session.user) {
    res.redirect('/entrar')
  }
  const file = req.file; // Acessa o arquivo enviado
  const format = req.body.format;

  // Salvar o arquivo no MinIO
  const bucketName = 'input-bucket';
  const objectName = file.originalname;

  try {
    await minioClient.putObject(bucketName, objectName, file.buffer);
  } catch (error) {
    console.error('Erro ao salvar o arquivo no MinIO:', error);
    res.status(500).send('Erro ao salvar o arquivo');
    return;
  }

  // Enviar uma mensagem para o Kafka informando o término do upload
  await producer.connect()
  try {
    await producer.send({
      topic: inputTopic,
      messages: [
        { value: JSON.stringify({user: req.session.user, format, filename: file.originalname}) },
      ],
    })
    
    
    // producer.send([{
    //   topic: inputTopic,
    //   messages: JSON.stringify({user: req.session.user, format, filename: file.originalname}) }
    //   ]
    // )
  } catch (error) {
    console.error('Erro ao enviar mensagem para o Kafka:', error);
    res.status(500).send('Erro ao enviar mensagem para o Kafka');
    return;
  }
  await producer.disconnect()
  await consumer.connect()
await consumer.subscribe({ topic: outputTopic, fromBeginning: true })

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const {user, url} = JSON.parse(message.value);
  if (req.session.user == user) {
    res.redirect(url)
  }
  }})
  
  // Exibir a tela de espera
  res.send(`
    <html>
      <body>
        <h1>Aguarde</h1>
        <p>O arquivo está sendo convertido. Aguarde alguns minutos e tente novamente.</p>
      </body>
    </html>
  `);
});

// Rota para baixar o arquivo convertido
app.get('/download/:objectName', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/entrar')
  }
  const objectName = req.params.objectName;

  // Verificar se o arquivo existe no MinIO
  const bucketName = 'output-bucket';

  try {
    const stat = await minioClient.statObject(bucketName, objectName);
  } catch (error) {
    console.error('Erro ao verificar a existência do arquivo no MinIO:', error);
    res.status(404).send('Arquivo não encontrado');
    return;
  }

  // Gerar o URL de download do arquivo
  const downloadUrl = minioClient.presignedGetObject(bucketName, objectName);

  // Redirecionar para o URL de download
  res.redirect(downloadUrl);
});

// Rota para exibir a página de login
app.get('/entrar', (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});

// Rota para lidar com o login
app.post('/login', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  

  // Consultar o banco de dados para obter as informações do usuário
  connection.query('SELECT * FROM users WHERE username = ?', [username], (error, results) => {
    if (error) {
      console.error('Erro ao consultar o banco de dados:', error);
      res.status(500).send('Erro ao consultar o banco de dados');
    } else {
      if (results.length > 0) {
        const user = results[0];

        // Verificar a senha usando bcrypt
        bcrypt.compare(password, user.password, (err, result) => {
          if (result) {
            // Senha correta, redirecionar para a página home
            req.session.user = user;
            res.redirect('/home');
          } else {
            // Senha incorreta
            res.send('Senha incorreta');
          }
        });
      } else {
        // Usuário não encontrado
        res.send('Usuário não encontrado');
      }
    }
  });
});

// Rota para exibir a página de cadastro
app.get('/cadastro', (req, res) => {
  res.sendFile(__dirname + "/public/cadastro.html");
});

// Rota para lidar com o cadastro
app.post('/signup', (req, res) => {

  const username = req.body.username;
  const password = req.body.password;
  console.log(req.body)
  console.log(password)


  // Criptografar a senha usando bcrypt
  bcrypt.genSalt(10, function(err,salt){
    bcrypt.hash(password, salt, (err, hash) => {
      if (err) {
        console.error('Erro ao criptografar a senha:', err);
        res.status(500).send('Erro ao criar usuário');
      } else {
        // Inserir as informações do usuário no banco de dados
        connection.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], (err, results) => {
          if (err) {
            console.error('Erro ao inserir usuário no banco de dados:', err);
            res.status(500).send('Erro ao criar usuário');
          } else {
            // Redirecionar para a página de login após o cadastro
            res.redirect('/entrar');
          }
        });
      }
    });
  });
});

// Rota para exibir a página home
app.get('/home', (req, res) => {
  if (req.session.user) {
    res.sendFile(__dirname + "/public/home.html");
  } else {
    res.redirect('/entrar');
  }
  
});

// Rota para fazer logout
app.get('/logout', (req, res) => {
  req.session.destroy(__dirname + "/public/home.html");
  res.redirect('/entrar');
});

// Iniciando o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});