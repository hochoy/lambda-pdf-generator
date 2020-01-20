export async function listGoogleFiles(gDriveClient) {
  // https://github.com/googleapis/google-api-nodejs-client/blob/master/samples/drive/quickstart.js
  // https://github.com/googleapis/google-api-nodejs-client/blob/master/samples/drive/list.js
}

export async function exportGoogleFile(gDriveClient, outputType, outputPath) {
  // drive.files.export: https://github.com/googleapis/google-api-nodejs-client/issues/963#issuecomment-367671749
  // as per issue, these are the types of data format that can be returned:
  // googledrive on nodejs uses axios (an awesome http client) with these data-return options:
  // 'arraybuffer', 'document', 'json', 'text', 'stream', browser only: 'blob'
  // https://github.com/axios/axios#request-config
}

export async function getGoogleFile(gDriveClient, gFileId) {
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

export async function uploadToS3(filePath, S3BucketName, desiredFilename) {

  const AWS = require('aws-sdk');

  // The below are not required in Lambda.
  // In lambda, we assign an IAM role to the Lambda function, which will allow the function to write to S3
  // const AWSID = '<AWS_ID>';
  // const AWSSecret = '<AWS_SECRET>';
  // const S3 = new AWS.S3({
  //   accessKeyId: AWSID,
  //   secretAccessKey: AWSSecret
  // })

  const S3 = new AWS.S3()

  const fileContent = fs.readFileSync(filePath);

  const S3Params = {
    Bucket: S3BucketName,
    Key: desiredFilename,
    Body: fileContent,
  };

  const S3Result = await S3
    .upload(S3Params)
    .catch(err => console.log(err));

  return S3Result;
}
