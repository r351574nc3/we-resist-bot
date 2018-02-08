SET STEEM_NAME=we-resist
SET STEEM_WIF=

docker build -t testrepo/we-resist-bot .
docker run -d --rm -e STEEM_NAME=we-resist -p 3000:3000 testrepo/we-resist-bot:latest
