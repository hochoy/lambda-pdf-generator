const lambda = require('./index');

// // Call the main handler function. This is what AWS Lambda calls
lambda.handler()
  .then((result) => {
    console.log(result);
    // process.exit();
  })
  .catch((error) => {
    console.error(error);
    process.exit();
  });
