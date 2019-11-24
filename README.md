# pdf_report_generator
Generates pdf reports from Postgres and Googlesheet data via AWS Lambda

## Contents
0. Setting up the workspace: Git, Node, Code-editor
1. Starting a Node project
2. Connecting to a Postgres database
  - Connecting to AWS RDS databases (TODO)
3. Connecting to GoogleDrive and GoogleSheets
  - [Creating a service account](https://cloud.google.com/iam/docs/creating-managing-service-accounts)
  - [Using a service account](https://cloud.google.com/iam/docs/understanding-service-accounts)
  - [Connecting to Google sheets via `googleapis`](https://github.com/googleapis/google-api-nodejs-client/blob/168ad6ba5c10f798cf63daa101a19c50f12389bc/samples/jwt.js) Link may change but what we want to find is JWT authentication for service account
  - [Official way to authenticate with Google API (new?)](https://github.com/googleapis/google-auth-library-nodejs)
  - [Selecting specific sheets and cells in GSheet API](https://developers.google.com/sheets/api/guides/concepts#a1_notation)

4. Writing JSON data into an .odt file
  - carbone moustache-like substitutions, etc https://carbone.io/documentation.html
5. Running Libreoffice on a Lambda instance
  - [Step-by-step to upload Libreoffice to s3, have lambda download/run it to convert files/do other libreoffice stuff](https://github.com/vladgolubev/serverless-libreoffice/blob/master/STEP_BY_STEP.md)
  - The idea of hosting software in S3 for later retrieval is useful when we can't/don't want to place large binaries/libraries in our Lambda instance. There is a limit however to the max size of files that we download onto a lambda instance (currently 512mb). Also, because the lambda instance has to download the instance from S3, it will increase the amount of runtime. If we want to run software that is hundreds of megabytes in size, we could have lambda send requests/messages/data to a larger docker/ec2 instance for processing.

6. Zipping and Encrypting files with 7zip
7. Uploading files to GoogleDrive
8. Invoking multiple lambda(s) with AWS-SDK + CRON scheduling

Bonus: Creating pdf from html/pages using [Puppeteer](https://github.com/GoogleChrome/puppeteer)
Bonus: Connecting to other google cloud services with node [Google Cloud pkgs](https://cloud.google.com/nodejs/docs/reference/libraries)
Creating pdfs/docs:
  1. Filling forms: https://www.npmjs.com/package/node-pdftk - based of this: https://www.pdflabs.com/tools/pdftk-server/
  2. Create from html (react) https://dev.to/carlbarrdahl/generating-pdf-reports-with-charts-using-react-and-puppeteer-4245
  3. Draw anything from scratch https://www.npmjs.com/package/pdfkit
  4. Wrapper around pdfkit: http://pdfmake.org/playground.html
  5. Create ppt, word, excel https://www.npmjs.com/package/officegen
  6. Primitive parser, generator by mozilla https://www.npmjs.com/package/pdfjs-dist
  7. docx/ppt => docx/ppt https://www.npmjs.com/package/docxtemplater
  8. CURRENT: CARBONE https://github.com/Ideolys/carbone

## Setting up a local pg database

Mac instructions only:

1. install Homebrew https://brew.sh/
  - /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
2. install postgresql
  - brew install postgresql
3. initialize database
  - rm -r /usr/local/var/postgres (only if there are existing files)
  - initdb /usr/local/var/postgres
4. start the postgres server
  - Option 1: postgres -D /usr/local/var/postgres start; postgres -D /usr/local/var/postgres stop
  - Option 2: brew services start postgres; brew services stop postgres
  - Option 3: Using a LaunchAgent and plist to Launch PostgreSQL on Startup
    - mkdir -p ~/Library/LaunchAgents
    - ln -sfv /usr/local/opt/postgresql/*.plist ~/Library/LaunchAgents
    - launchctl load ~/Library/LaunchAgents/homebrew.mxcl.postgresql.plist

## Creating tables, managing database

Using the cli
1. Log into a running postgres server with the default user
- `psql postgres (login)`
- run sql commands, i.e. `\l \dt` => list databases/tables, `SELECT ...` to query, `CREATE TABLE ...` to create new table
- `quit (to exit)`

Using a database admin tool (dbeaver)
- Download from https://dbeaver.io/ and run
- Add a new database connection
- run sql commands or use GUI tools to create tables, columns, data, etc

## Connecting to Google API

Briefly, there are three primary ways to authenticate outselves to use Google APIs. Some services support all authentication methods, other may only support one or two. In this example, we are automating the generation of PDF documents on AWS Lambda so we will use **Option 2: Google Service Account**

1. **OAuth2** - This allows you to make API calls on behalf of a given user. In this model, the user visits your application, signs in with their Google account, and provides your application with authorization against a set of scopes.

2. **Service <--> Service** - In this model, your application talks directly to Google APIs using a Service Account. It's useful when you have a backend application that will talk directly to Google APIs from the backend.

3. **API Key** - With an API key, you can access your service from a client or the server. Typically less secure, this is only available on a small subset of services with limited scopes.

*The above text is lifted from [Google's `googleapis` repository](https://github.com/googleapis/google-api-nodejs-client#authentication-and-authorization). Click the link to learn more.*


### Creating a service account 

TODO: Add Images

1. Create a google account if you don't already have one
2. Go to the [Google Developer Console](https://console.developers.google.com)
3. Create a new project and name it something obvious, i.e. 'My PDF generator'
4. Create a service account @ https://console.developers.google.com/iam-admin/serviceaccounts, with the following details:
  - Service Account Name: i.e. "PDF generator service account" (Something descriptive)
  - Service Account ID: <ID.goes.here>@<project.name>.iam.gserviceaccount.com(The ID is concatenated with the project name to create a unique email for the service account. You will need the email account generated here later, when we have to share files with the service account)
  - Service Account description: (Something descriptive, i.e.) "Service account for PDF generation that can access google services"
  - Role: Choose > Service Accounts > Service Account User (This role has)
  - Grant users access to:
    - Service account: <your.email.here@gmail.com> (We won't need this but it allows you, or another user(s) you specify to be able to run services as the service account (impersonation)).)
    - Service account admin: <your.email.here@gmail.com> (Allows you or another user(s) to manage the service account as an admin)
    *Both options above are useful in a company setting where you may want to assign certain employees permissions to run/manage certain long-running google services without granting them ownership over the services.*
    - Create key: YES, Json format (**The most important part for us is to create a key that allows our application to authenticate with Google's API. Download this key, place it in your project, and gitignore it so you don't accidentally upload it to your repo on github**)
  
  5. With the JSON key, we can authenticate with Google's API

### Enable GoogleDrive and GoogleSheet API for this project

Before we can use any of Google's service via the API, we will need to enable the service. It's simple, just click 'Enable API' at the following two links. Just make sure you are on the correct account and project.
https://console.developers.google.com/apis/library/drive.googleapis.com
https://console.developers.google.com/apis/library/sheets.googleapis.com

### Creating and sharing a google sheet/doc/file with the Service account
Unless a file was created by the service account itself (or the service account was granted [Domain-wide Delegation]()), a new service account doesn't actually have access to your files. It makes sense because creating a service account is a lot like creating a new user account. To allow the service account access your files and folders, you will need to share the files with the service account (just like how you would share files with another gmail user).

1. Navigate to/Create a google sheet, doc, file
2. Click share
3. Enter the email of the service account. You can find it at https://console.cloud.google.com/iam-admin/serviceaccounts or if you saved it back in step 4 of **Creating a service account**

The file, sheet, document or (folder) should now be accessible to the service account. 


    