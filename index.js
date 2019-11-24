require('dotenv').config()
const { Pool } = require('pg');
const { google } = require('googleapis');
const path = require('path');
const _ = require('lodash');
const carbone = require('carbone');
const { promisify } = require('util');
const moment = require('moment');
const { writeFileSync } = require('fs');

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PWD,
  port: process.env.DB_PORT,
  max: 20, // max number of connections in pool
  idleTimeoutMillis: 10000, // max time to keep client connected idly, before timing out
  connectionTimeoutMillis: 5000, // max time for client to connect, else timeout
});

main().catch(console.error);

// Main function
async function main() {

  // query a database via pg-pool
  // using pool.query directly will release the connection once query returns/fails
  // using pool.connect().then(client => client.query()) will not release the connection until told to
  pool
  .query('SELECT * FROM customers;')
  .then(res => console.log(`Database sample: ${JSON.stringify(res.rows, null, 2)}`))
  .catch(e => {
    console.error(e)
    throw new Error(e)
  })

  // connect to google drive
  const gKeyFile = path.join(__dirname, 'credentials', 'lambda-project-001-1a2f5773dd4f.json');
  const gClient = await gAuthClient(gKeyFile);
  const gDrive = await gDriveClient(gClient);
  const gSheet = await gSheetClient(gClient);

  // Get gdrive file list
  const gDriveResponse = await gDrive.files.list();
  const gDriveFiles = gDriveResponse.data;
  console.log(`Gdrive sample: ${JSON.stringify(gDriveFiles,null,2)}`);

  // Get google sheet row data
  const gSheetResponse = await gSheet.spreadsheets.values.batchGet({
    spreadsheetId: '1NJwphpY9zuzORHLYnk9Xh54KENvEGYlAUorJ1J8A4YU', // service user must have access to this spreadsheet
    ranges: [
      'Sheet1!A:E',
      ]
  });

  // Reshape google sheet data as array of objects
  const gSheetRawData = gSheetResponse.data.valueRanges[0].values;
  const gSheetColNames = gSheetRawData[0].map(v => v.toLowerCase());
  const gSheetRows = gSheetRawData.slice(1);

  const gSheetShaped = gSheetRows.map(row => {
    // convert row from array => object
    const rowObject = gSheetColNames.reduce((obj, curr,i) => {
      // Assign each colname as the object's key
      // Assign each corresponding row[i] value as the object's value
      obj[curr] = row[i]
      return obj;
    },{})
    return rowObject;
  })

  console.log(`Gsheet sample: ${JSON.stringify(gSheetShaped, null, 2)}`)

  // Write data to a template .odt file
  writeOdtFromTemplate(
    { 
      author: 'Prince Ali',
      currentDate: moment().format('YYYY-MM-DD'),
      warehouse: gSheetShaped
    },
    path.join(__dirname, 'templates','odt_template_1.odt'),
    path.join(__dirname,'tmp','odt_w_data.odt'))

}



async function gAuthClient(keyFile) {
  // Create a new JWT client using the key file downloaded from Google Developer Console
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFile,
    // full list of scopes
    // https://developers.google.com/identity/protocols/googlescopes#drivev3
    // https://developers.google.com/identity/protocols/googlescopes#sheetsv4
    scopes: [
      // 'https://www.googleapis.com/auth/spreadsheets', // drive permissions is a superset of spreadsheets
      'https://www.googleapis.com/auth/drive', 
    ]
  });
  const client = await auth.getClient();
  return client;
}

async function gDriveClient(gClient){
  // Obtain a new drive client
  const drive = google.drive({
    version: 'v3',
    auth: gClient,
  })
  return drive;
}

async function gSheetClient(gClient){
  // Obtain a new sheet client
  const sheets = google.sheets({
    version: 'v4',
    auth: gClient,
  });
  return sheets;
}

const writeOdtFromTemplate = async function(data, templatePath, outputPath){
  
  try {
      if (!/.*\.odt/.test(outputPath)) {
        throw new Error('Output filename should include .odt file extension');
      }
      console.log("\nWriting odt file with data to "+ outputPath + "...");

      const odtRender = promisify(carbone.render);
      const odtResult = await odtRender(templatePath, data);
      writeFileSync(outputPath, odtResult);
      console.log("ODT file written")

      return({
          outputPath
      })
  }
  catch(err){
      throw new Error(`ODT file creation failed: ${err.message}`)
  }
}