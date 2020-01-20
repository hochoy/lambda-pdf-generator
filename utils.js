
const { writeFileSync } = require('fs');
const { execSync } = require('child_process');
const fs = require('fs');
const carbone = require('carbone');
const { promisify } = require('util');
const path = require('path');

const writeOdtFromTemplate = async ({ data, templatePath, outputPath }) => {
  try {
    if (!/.*\.odt/.test(outputPath)) {
      throw new Error('Output filename should include .odt file extension');
    }
    console.log(`\nWriting odt file with data to ${outputPath}...`);

    const odtRender = promisify(carbone.render);
    const odtResult = await odtRender(templatePath, data);
    writeFileSync(outputPath, odtResult);
    console.log('ODT file written');

    return (outputPath);
  } catch (err) {
    throw new Error(`ODT file creation failed: ${err.stack}`);
  }
};

const setupLibreOffice = async ({
  s3Host,
  setupPath = '/tmp',
}) => {
  const libreofficeExePath = path.join(setupPath, '/instdir/program/soffice');

  // if LibreOffice is not in the tmp folder, download and extract it into tmp folder
  if (!fs.existsSync(libreofficeExePath)) {
    console.log('setupLibreOffice', 'Downloading libreoffice');
    try {
      execSync(`curl ${s3Host} -o ${setupPath}/lo.tar.gz && cd ${setupPath} && tar -xf ${setupPath}/lo.tar.gz`);
      console.log('setupLibreOffice', 'Downloaded and extracted libreoffice');
      return libreofficeExePath;
    } catch (err) {
      throw new Error(`setupLibreOffice failed: Could not download libreoffice from ${s3Host}: ${err.stack}`);
    }
  } else {
    console.log('setupLibreOffice', 'Libreoffice already installed in this lambda instance');
    return libreofficeExePath;
  }
};

const convertOdtToPdf = async ({ libreofficeExePath, odtPath }) => {
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
  ].join(' ');

  try {
    // run command on file
    console.log('convertOdtToPdf: ', 'Converting file to pdf');
    execSync(`${convertCommand} ${odtPath}`);

    const pdfPath = odtPath.replace('.odt', '.pdf');
    console.log(`convertOdtToPdf: Success: ${odtPath} converted to ${pdfPath}`);
    return pdfPath;
  } catch (err) {
    throw new Error(`convertOdtToPdf: ${err.stack}`);
  }
};

// official guide, easy: https://developers.google.com/drive/api/v3/quickstart/nodejs
// https://github.com/googleapis/google-api-nodejs-client/tree/master/samples/drive

const uploadToGoogle = async ({
  filePath, gDriveClient, googleFolderId, googleFileName, googleFileType = 'application/pdf',
}) => {
  console.log(`uploading ${filePath} to google drive as ${googleFileName} with format ${googleFileType}...`);
  try {
    const response = await gDriveClient.files.create({
      requestBody: {
        name: googleFileName,
        mimeType: googleFileType,
        parents: [googleFolderId],
      },
      media: {
        mimeType: googleFileType,
        body: fs.createReadStream(filePath),
      },
    });
    console.log('upload success!');
    return response.data;
  } catch (err) {
    throw new Error(`uploadToGoogle: ${err.stack}`);
  }
};

const updateGoogleFile = async ({
  gDriveClient, filePath, fileType = 'application/pdf', gFileId, newFileName,
}) => {
  try {
    const response = await gDriveClient.files.update({
      fileId: gFileId,
      // add metadata here
      resource: {
        name: newFileName || 'haha2',
      },
      media: {
        mimeType: fileType,
        body: fs.createReadStream(filePath),
      },
    });

    return response.data;
  } catch (err) {
    throw new Error(`updateGoogleFile: ${err.stack}`);
  }
};

module.exports = {
  convertOdtToPdf,
  setupLibreOffice,
  updateGoogleFile,
  uploadToGoogle,
  writeOdtFromTemplate,
};
