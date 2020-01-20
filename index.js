require('dotenv').config();
const { Pool } = require('pg');
const { google } = require('googleapis');
const path = require('path');
const moment = require('moment');
const utils = require('./utils');


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

// Define the lambda handler function

// eslint-disable-next-line no-unused-vars
const lambdaHandler = async (event, context) => {
  // query a database via pg-pool (i.e. an RDS instance)
  // pool.query will release the connection once query returns/fails
  // pool.connect().then(client => client.query()) will not release the connection until told to
  const queryResult = await pool.query('SELECT * FROM customers;');
  console.log('Database query result:', JSON.stringify(queryResult.rows, null, 2));


  // connect to google drive and google sheet
  // 1. a keyfile:
  // 2. a set of scope(s)/permission(s) = https://developers.google.com/identity/protocols/googlescopes
  const googleKeyFile = path.join(__dirname, 'credentials', 'lambda-project-001-1a2f5773dd4f.json');
  const googleAuth = new google.auth.GoogleAuth({
    keyFile: googleKeyFile,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const googleClient = await googleAuth.getClient();
  const googleDrive = await google.drive({ version: 'v3', auth: googleClient });
  const googleSheet = await google.sheets({ version: 'v4', auth: googleClient });


  // Get google drive file list
  const googleDriveResponse = await googleDrive.files.list();
  const googleDriveFiles = googleDriveResponse.data;
  console.log(`Google drive files: ${JSON.stringify(googleDriveFiles, null, 2)}`);


  // Get google sheet row data
  const googleSheetResponse = await googleSheet.spreadsheets.values.batchGet({
    spreadsheetId: '1NJwphpY9zuzORHLYnk9Xh54KENvEGYlAUorJ1J8A4YU', // service user must have access to this spreadsheet
    ranges: ['Sheet1!A:E'],
  });
  console.log(`Google sheet raw response: ${JSON.stringify(googleSheetResponse, null, 2)}`);

  // Reshape google sheet data as array of objects
  const gSheetRawData = googleSheetResponse.data.valueRanges[0].values;
  const gSheetColNames = gSheetRawData[0].map((v) => v.toLowerCase());
  const gSheetRows = gSheetRawData.slice(1);

  const gSheetShaped = gSheetRows.map((row) => {
    // convert row from array => object
    const rowObject = gSheetColNames.reduce((obj, curr, i) => {
      // Assign each colname as the object's key
      // Assign each corresponding row[i] value as the object's value
      obj[curr] = row[i];
      return obj;
    }, {});
    return rowObject;
  });
  console.log(`Gsheet shaped data: ${JSON.stringify(gSheetShaped, null, 2)}`);


  // Write data to a template .odt file
  const odtData = {
    author: 'Prince Ali',
    currentDate: moment().format('YYYY-MM-DD'),
    warehouse: gSheetShaped,
  };
  const templatePath = path.join(__dirname, 'templates', 'odt_template_1.odt');
  const odtPath = path.join('/tmp/', 'odt_w_data.odt');

  await utils.writeOdtFromTemplate({
    data: odtData,
    templatePath,
    outputPath: odtPath,
  });

  // Convert file using LibreOffice
  // Download minified Libreoffice at https://github.com/vladgolubev/serverless-libreoffice/releases
  // Place the lo.tar.gz compressed file in an S3 bucket and allow access from lambda function
  // You can either set the S3 bucket permissions as publicly-accessible (read-only),
  // or grant permissions to the lambda role specifically for the s3 bucket.

  // const libreofficePath = 'https://s3.ca-central-1.amazonaws.com/hochoy.libreoffice/lo.tar.gz';

  // const libreOfficeExePath = await utils.setupLibreOffice({
  //   s3Host: libreofficePath,
  //   setupPath: '/tmp',
  // });

  // // const pdfPath = await utils.convertOdtToPdf({
  // //   libreOfficeExePath,
  // //   odtPath,
  // // });

  // Upload file to GoogleDrive
  const uploadResult = await utils.uploadToGoogle({
    filePath: odtPath,
    gDriveClient: googleDrive,
    googleFolderId: '1plA69VMEqNfdotYO5j4cKoHZlbIjmfsE',
    googleFileName: `Report_${moment().format('YYYY-MM-DD')}`,
    googleFileType: 'application/pdf',
  });

  return uploadResult;
};

exports.handler = lambdaHandler;
