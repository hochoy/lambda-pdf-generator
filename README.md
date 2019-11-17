# pdf_report_generator
Generates pdf reports from Postgres and Googlesheet data via AWS Lambda

## Contents
1. Lambda/NodeJS - Connecting to a Postgres database
  - Connecting to AWS RDS databases
2. Lambda/NodeJS - Connecting to GoogleSheets
  - [Creating a service account](https://cloud.google.com/iam/docs/creating-managing-service-accounts)
  - [Using a service account](https://cloud.google.com/iam/docs/understanding-service-accounts)
  - [Connecting to Google sheets via `googleapis`](https://github.com/googleapis/google-api-nodejs-client/blob/168ad6ba5c10f798cf63daa101a19c50f12389bc/samples/jwt.js) Link may change but what we want to find is JWT authentication for service account
  - [Official way to authenticate with Google API (new?)](https://github.com/googleapis/google-auth-library-nodejs)
  - [Selecting specific sheets and cells in GSheet API](https://developers.google.com/sheets/api/guides/concepts#a1_notation)

3. Lambda/NodeJS - Writing JSON data into an .odt file
4. Lambda/NodeJS - Running Libreoffice on a Lambda instance
5. Lambda/NodeJS - Zipping and Encrypting files with 7zip
6. Lambda/NodeJS - Uploading files to GoogleDrive
7. Lambda/NodeJS - Invoking multiple lambda(s) with AWS-SDK + CRON scheduling

Bonus: Creating pdf from html/pages using [Puppeteer](https://github.com/GoogleChrome/puppeteer)
Bonus: Connecting to other google cloud services with node [Google Cloud pkgs](https://cloud.google.com/nodejs/docs/reference/libraries)


### Setting up a local pg database

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
5. Using a LaunchAgent and plist to Launch PostgreSQL on Startup
- mkdir -p ~/Library/LaunchAgents
- ln -sfv /usr/local/opt/postgresql/*.plist ~/Library/LaunchAgents
- launchctl load ~/Library/LaunchAgents/homebrew.mxcl.postgresql.plist

### Creating tables, managing database

Using the cli
1. Log into a running postgres server with the default user
- psql postgres (login)
- run sql commands
- quit (to exit)

Using a database admin tool (dbeaver)
- Download from https://dbeaver.io/ and run
- Add a new database connection
- run sql commands

