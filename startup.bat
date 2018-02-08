@ECHO OFF

SET STEEM_NAME=we-resist
SET STEEM_WIF=

docker run -d --rm -e STEEM_NAME=we-resist -p 3000:3000 r351574nc3/we-resist-bot:latest
