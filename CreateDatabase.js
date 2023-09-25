const mysql = require('mysql2');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create a MySQL connection
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

// Connect to MySQL server
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL server');

  // Create the database specified in the DB_NAME environment variable
  const dbName = process.env.DB_NAME;
  connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`, (err) => {
    if (err) {
      console.error('Error creating database:', err);
    } else {
      console.log(`Database '${dbName}' created (if it didn't exist already)`);
    }

    // Close the MySQL connection
    connection.end();
  });
});
