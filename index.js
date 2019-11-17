require('dotenv').config()
const { Pool } = require('pg');


const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PWD,
  port: process.env.DB_PORT,
});

pool
  .query('SELECT * FROM customers;')
  .then(res => console.log(res.rows))
  .catch(e => {
    console.error(e)
    throw new Error(e)
  })
  .finally(() => {
    pool.end()
    // process.exit()
  }
  )

  