require('dotenv').config()
const { Pool } = require('pg');
const { google } = require('googleapis');
const path = require('path');
const _ = require('lodash');

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PWD,
  port: process.env.DB_PORT,
});

main().catch(console.error);

// Main function
async function main() {

  // query a database via pg-pool
  pool
  .query('SELECT * FROM customers;')
  .then(res => console.log(`Database sample: ${JSON.stringify(res.rows, null, 2)}`))
  .catch(e => {
    console.error(e)
    throw new Error(e)
  })
  .finally(() => pool.end())

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

  const gSheetRawData = gSheetResponse.data.valueRanges[0].values;

  const gSheetColNames = gSheetRawData[0];
  const gSheetRows = gSheetRawData.slice(1);

  const gSheetShaped = gSheetRows.map(row => {
    let obj = {};
    // obj[gSheetColNames[0]] = row[0] // Warehouse
    // obj[gSheetColNames[1]] = row[1] // Produce
    // obj[gSheetColNames[2]] = row[2] // Date
    // obj[gSheetColNames[3]] = row[3] // Quantity
    // obj[gSheetColNames[4]] = row[4] // Unit
    for (let i=0; i < row.length; i++){
      obj[gSheetColNames[i]] = row[i]
    }
    return obj;
  })
  
  console.log(`Gsheet sample: ${JSON.stringify(gSheetShaped, null, 2)}`)
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


  