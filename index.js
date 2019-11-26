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

// Define the main function

exports.handler = async function(event, context) {

  // query a database via pg-pool
  // using pool.query directly will release the connection once query returns/fails
  // using pool.connect().then(client => client.query()) will not release the connection until told to
  const queryResult = await pool.query('SELECT * FROM customers;');
  console.log(`Database query result:`,JSON.stringify(queryResult.rows,null,2));


  // connect to google drive and google sheet
  // 1. a keyfile: 
  // 2. a set of scope(s)/permission(s) = https://developers.google.com/identity/protocols/googlescopes
  const googleKeyFile = path.join(__dirname, 'credentials', 'lambda-project-001-1a2f5773dd4f.json');
  const googleAuth = new google.auth.GoogleAuth({ keyFile: googleKeyFile, scopes: [ 'https://www.googleapis.com/auth/drive' ] });
  const googleClient = await googleAuth.getClient();
  const googleDrive = await google.drive({ version: 'v3', auth: googleClient });
  const googleSheet = await google.sheets({ version: 'v4', auth: googleClient });


  // Get google drive file list
  const googleDriveResponse = await googleDrive.files.list();
  const googleDriveFiles = googleDriveResponse.data;
  console.log(`Google drive files: ${JSON.stringify(googleDriveFiles,null,2)}`);


  // Get google sheet row data
  const googleSheetResponse = await googleSheet.spreadsheets.values.batchGet({
    spreadsheetId: '1NJwphpY9zuzORHLYnk9Xh54KENvEGYlAUorJ1J8A4YU', // service user must have access to this spreadsheet
    ranges: ['Sheet1!A:E']
  });
  console.log(`Google sheet raw response: ${JSON.stringify(googleSheetResponse, null, 2)}`)

  // Reshape google sheet data as array of objects
  const gSheetRawData = googleSheetResponse.data.valueRanges[0].values;
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
  
  const outputPath = await writeOdtFromTemplate(
    odtData,
    templatePath,
    odtPath,
  );

  //// BROKEN: Convert file using minified LibreOffice
  //// NOTE: The current binary won't work on a mac as it was built on a Linux-based AMI for Lambda
  //// NOTE: The current binary MIGHT also not work on AWS Lambda due to new updates in Lambda
  //// NOTE: The current binary needs to be re-hosted on my personal AWS S3/Github. The existing link points to an older S3 link.
  //// SOLUTION 1: Test on AWS Lambda/Docker with similar environment since it was built for it
  //// SOLUTION 2: RE-COMPILING IN DESIRED ENVIRONMENT VIA DOCKER: https://github.com/vladgolubev/serverless-libreoffice/pull/22
  // const libreOfficeExePath = await setupLibreOffice('https://s3.ca-central-1.amazonaws.com/davidchoy.libreoffice/lo.tar.gz','/tmp');
  // const pdfPath = await convertOdtToPdf(libreOfficeExePath, odtPath);  
  // return pdfPath;


  // Upload file to GoogleDrive
  // const uploadResult = await uploadToGoogle(googleDrive,outputPath,'application/pdf','1plA69VMEqNfdotYO5j4cKoHZlbIjmfsE');
  const getResult = await getGoogleFile(googleDrive,'1fW-rvsHFoUs5R687BLMoItELvBA8KL0T');

  // Upload file to S3 (requires AWS S3 permissions)


  return getResult;
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
      throw new Error(`ODT file creation failed: ${err.stack}`)
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
        throw new Error(`setupLibreOffice failed: Could not download libreoffice from ${s3Host}: ${err.stack}`);
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
    throw new Error(`convertOdtToPdf: ${err.stack}`);
  }
}

// official guide, easy: https://developers.google.com/drive/api/v3/quickstart/nodejs
//https://github.com/googleapis/google-api-nodejs-client/tree/master/samples/drive

async function uploadToGoogle(gDriveClient, filePath, fileType = 'application/pdf', googleFolderId) {

  try {
    const response = await gDriveClient.files.create({
      requestBody: {
        name: 'haha',
        mimeType: 'application/pdf',
        parents: [googleFolderId]
      },
      media: {
        mimeType: fileType,
        body: fs.createReadStream(filePath)
      }
    });

    return response.data;
  } catch (err) {
    throw new Error(`uploadToGoogle: ${err.stack}`)
  }
}

async function updateGoogleFile(gDriveClient, filePath, fileType = 'application/pdf', gFileId, newFileName) {
  try {
    const response = await gDriveClient.files.update({
      fileId: gFileId,
      // add metadata here
      resource: {
        name: newFileName ? newFileName : 'haha2'
      },
      media: {
        mimeType: fileType,
        body: fs.createReadStream(filePath)
      }
    });

    return response.data;
  } catch (err) {
    throw new Error(`updateGoogleFile: ${err.stack}`);
  }
}

async function getGoogleFile(gDriveClient, gFileId) {
  try {
    const response = await gDriveClient.files.get({
      fileId: gFileId
    });
    
    // EXAMPLE to write stream: https://github.com/googleapis/google-api-nodejs-client/blob/master/samples/drive/download.js
    return response.data;
  } catch (err) {
    throw new Error(`getGoogleFile: ${err.stack}`);
  }
}

async function listGoogleFiles(gDriveClient) {
  // https://github.com/googleapis/google-api-nodejs-client/blob/master/samples/drive/quickstart.js
  // https://github.com/googleapis/google-api-nodejs-client/blob/master/samples/drive/list.js
}

async function exportGoogleFile(gDriveClient, outputType, outputPath) {
  // drive.files.export: https://github.com/googleapis/google-api-nodejs-client/issues/963#issuecomment-367671749
  // as per issue, these are the types of data format that can be returned:
  // googledrive on nodejs uses axios (an awesome http client) with these data-return options:
  // 'arraybuffer', 'document', 'json', 'text', 'stream', browser only: 'blob'
  // https://github.com/axios/axios#request-config
}


//// Call the main handler function. This is what AWS Lambda calls + the imports above the handler() definition
exports.handler()
  .then(function(result){
    console.log(result);
    // process.exit();
  })
  .catch(function(error) {
    console.error(error);
    process.exit();
  });
