require('dotenv').config()
const { Pool } = require('pg');
const { google } = require('googleapis');
const path = require('path');
const _ = require('lodash');
const carbone = require('carbone');
const { promisify } = require('util');
const moment = require('moment');
const { writeFileSync } = require('fs');
const { execSync } = require('child_process');
const fs = require('fs');

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

  // connect to google drive and google sheet
  const gKeyFile = path.join(__dirname, 'credentials', 'lambda-project-001-1a2f5773dd4f.json');
  const gClient = await gAuthClient(gKeyFile);
  const gDrive = await gDriveClient(gClient);
  const gSheet = await gSheetClient(gClient);

  // Get gdrive file list
  const gDriveResponse = await gDrive.files.list();
  const gDriveFiles = gDriveResponse.data;
  console.log(`Gdrive files: ${JSON.stringify(gDriveFiles,null,2)}`);

  // Get google sheet row data
  const gSheetResponse = await gSheet.spreadsheets.values.batchGet({
    spreadsheetId: '1NJwphpY9zuzORHLYnk9Xh54KENvEGYlAUorJ1J8A4YU', // service user must have access to this spreadsheet
    ranges: [
      'Sheet1!A:E',
      ]
  });
  console.log(`Gsheet raw response: ${JSON.stringify(gSheetResponse, null, 2)}`)

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

  console.log(`Gsheet shaped data: ${JSON.stringify(gSheetShaped, null, 2)}`)

  // Write data to a template .odt file
  const odtData = {
    author: 'Prince Ali',
    currentDate: moment().format('YYYY-MM-DD'),
    warehouse: gSheetShaped
  };
  const templatePath = path.join(__dirname, 'templates', 'odt_template_1.odt');
  const odtPath = path.join('/tmp/', 'odt_w_data.odt');
  
  await writeOdtFromTemplate(
    odtData,
    templatePath,
    odtPath,
  );

  //// BROKEN: Convert file using minified LibreOffice
  //// NOTE: The current binary won't work on a mac
  //// NOTE: The current binary might also not work on AWS Lambda due to changes in the image
  //// NOTE: The current binary needs to be re-hosted on my personal AWS S3/Github. The existing link points to an older S3 link.
  //// SOLUTION: RE-COMPILING IN DESIRED ENVIRONMENT VIA DOCKER: https://github.com/vladgolubev/serverless-libreoffice/pull/22
  // const libreOfficeExePath = await setupLibreOffice('https://s3.ca-central-1.amazonaws.com/davidchoy.libreoffice/lo.tar.gz','/tmp');
  // const pdfPath = await convertOdtToPdf(libreOfficeExePath, odtPath);  
  
  // return pdfPath;

  // Upload file to S3 or GoogleDrive, then cleanup
}



async function gAuthClient(keyFile){
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

async function writeOdtFromTemplate(data, templatePath, outputPath){
  try {
      if (!/.*\.odt/.test(outputPath)) {
        throw new Error('Output filename should include .odt file extension');
      }
      console.log("\nWriting odt file with data to "+ outputPath + "...");

      const odtRender = promisify(carbone.render);
      const odtResult = await odtRender(templatePath, data);
      writeFileSync(outputPath, odtResult);
      console.log("ODT file written")

      return(outputPath)
  }
  catch(err){
      throw new Error(`ODT file creation failed: ${err.message}`)
  }
}

async function setupLibreOffice(
  s3Host = 'https://s3.ca-central-1.amazonaws.com/davidchoy.libreoffice/lo.tar.gz',
  setupPath = '/tmp'
) {
  // if (!/lo.tar.gz/.test(s3Host)) {
  //   throw new Error('ERR: Please provide file named lo.tar.gz from https://github.com/vladgolubev/serverless-libreoffice/releases')
  // }
  // if (!/^\/tmp\/?$/.test(setupPath)) {
  //   console.warn('WARN: Expecting the setup path to be /tmp as AWS Lambda only allows tmp to be writable')
  // }

  // if LibreOffice is not in the tmp folder, download and extract it into tmp folder
  const libreofficeExePath = path.join(setupPath, '/instdir/program/soffice');

if (!fs.existsSync(libreofficeExePath)){
    console.log('setupLibreOffice', 'Downloading libreoffice');
    try {
        execSync(`curl ${s3Host} -o ${setupPath}/lo.tar.gz && cd ${setupPath} && tar -xf ${setupPath}/lo.tar.gz`);
        console.log('setupLibreOffice', 'Downloaded and extracted libreoffice');
        return libreofficeExePath;
    }
    catch(err){
        throw new Error(`setupLibreOffice failed: Could not download libreoffice from ${s3Host}`);
    }
  } else {
      console.log('setupLibreOffice', 'Libreoffice already installed in this lambda instance');
      return libreofficeExePath;
  }
}

async function convertOdtToPdf(libreofficeExePath, odtPath){
  const outputDir = path.dirname(odtPath);

  // command for converting odt file to pdf 
  // note: libreoffice can be used for multiple types of conversions)
  const convertCommand = [
    libreofficeExePath,
    '--headless',
    '--invisible',
    '--nodefault',
    '--nofirststartwizard',
    '--nolockcheck',
    '--nologo',
    '--norestore',
    '--convert-to pdf',
    '--outdir', outputDir,
  ].join(' ')
  
  try {
    // run command on file
    console.log('convertOdtToPdf: ', 'Converting file to pdf');
    execSync(`cd ${outputDir} && ${convertCommand} ${odtPath}`);
    
    const pdfPath = odtPath.replace('.odt','.pdf');
    console.log(`convertOdtToPdf: Success: ${odtPath} converted to ${pdfPath}`);
    return pdfPath;
  }
  catch(err) {
    console.error(err.stack)
    throw new Error(`convertOdtToPdf: ${err.message}`);
  }
}