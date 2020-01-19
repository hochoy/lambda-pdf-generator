FROM amazonlinux:2.0.20190508

ENV NODE_VERSION 12.11.0

# Install dependencies
RUN yum -y install gcc-c++ tar gzip findutils

# Install nvm: https://github.com/nvm-sh/nvm
# Install lambda-compatible node https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
RUN touch ~/.bashrc && chmod +x ~/.bashrc
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.35.2/install.sh | bash
RUN source ~/.bashrc && nvm install 12.11.0 && nvm use 12.11.0 
RUN source ~/.bashrc && node --version
RUN source ~/.bashrc && npm --version

# COPY OVER APP FILES
COPY package.json .
COPY index.js .
COPY templates templates
COPY credentials credentials
RUN source ~/.bashrc && npm install
RUN source ~/.bashrc && npm rebuild

CMD ["/root/.nvm/versions/node/v12.11.0/bin/node", "index.js"]

# Debug: Keeps container running
CMD tail -f /dev/null